/**
 * SEO Settings Routes
 * 
 * Admin-only endpoints for managing per-page SEO meta tags
 */

const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { successResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');

// Default pages - seeded on first GET if table is empty
const DEFAULT_PAGES = [
    { pageSlug: 'home', pageName: 'Home Page' },
    { pageSlug: 'login', pageName: 'Login' },
    { pageSlug: 'signup', pageName: 'Signup' },
    { pageSlug: 'services', pageName: 'Services' },
    { pageSlug: 'new-order', pageName: 'New Order' },
    { pageSlug: 'orders', pageName: 'Orders' },
    { pageSlug: 'add-funds', pageName: 'Add Funds' },
    { pageSlug: 'api', pageName: 'API' },
    { pageSlug: 'tickets', pageName: 'Tickets' },
    { pageSlug: 'faqs', pageName: 'FAQs' },
    { pageSlug: 'terms', pageName: 'Terms' },
    { pageSlug: 'contact', pageName: 'Contact' },
    { pageSlug: 'about', pageName: 'About Us' },
    { pageSlug: 'dashboard', pageName: 'Dashboard' },
    { pageSlug: 'reports', pageName: 'Reports' },
    { pageSlug: 'settings', pageName: 'Settings' },
];

/**
 * Seed default pages if table is empty
 */
async function seedDefaultPages() {
    const count = await prisma.seoSetting.count();
    if (count === 0) {
        await prisma.seoSetting.createMany({
            data: DEFAULT_PAGES,
            skipDuplicates: true
        });
    }
}

// ==================== PUBLIC ROUTE ====================

/**
 * GET /api/seo/page/:slug
 * Get SEO data for a specific page (public - no auth needed)
 */
router.get('/page/:slug', async (req, res, next) => {
    try {
        const setting = await prisma.seoSetting.findUnique({
            where: { pageSlug: req.params.slug },
            select: {
                pageTitle: true,
                metaKeywords: true,
                metaDescription: true,
                metaRobots: true,
                customHeader: true
            }
        });

        successResponse(res, setting || {});
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/seo/all-meta
 * Get all SEO settings at once (for frontend to cache)
 */
router.get('/all-meta', async (req, res, next) => {
    try {
        const settings = await prisma.seoSetting.findMany({
            select: {
                pageSlug: true,
                pageTitle: true,
                metaKeywords: true,
                metaDescription: true,
                metaRobots: true,
                customHeader: true
            }
        });

        // Convert to slug-keyed object for easy lookup
        const result = {};
        for (const s of settings) {
            result[s.pageSlug] = s;
        }

        successResponse(res, result);
    } catch (error) {
        next(error);
    }
});

// ==================== ADMIN ROUTES ====================

// Admin routes require authentication + admin role
router.use('/admin', authenticate, requireAdmin);

/**
 * GET /api/seo/admin/pages
 * List all pages with SEO settings (admin only)
 */
router.get('/admin/pages', async (req, res, next) => {
    try {
        // Seed default pages on first access
        await seedDefaultPages();

        const pages = await prisma.seoSetting.findMany({
            orderBy: { pageName: 'asc' }
        });

        successResponse(res, pages);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/seo/admin/pages/:id
 * Get single page SEO detail (admin only)
 */
router.get('/admin/pages/:id', async (req, res, next) => {
    try {
        const page = await prisma.seoSetting.findUnique({
            where: { id: req.params.id }
        });

        if (!page) {
            throw new AppError('SEO page not found', 404);
        }

        successResponse(res, page);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/seo/admin/pages/:id
 * Update SEO settings for a page (admin only)
 */
router.put('/admin/pages/:id', async (req, res, next) => {
    try {
        const { pageTitle, metaKeywords, metaDescription, metaRobots, customHeader, isVisible } = req.body;

        const existing = await prisma.seoSetting.findUnique({
            where: { id: req.params.id }
        });

        if (!existing) {
            throw new AppError('SEO page not found', 404);
        }

        // Coerce empty strings to null for nullable fields
        const coerce = (v) => (typeof v === 'string' && v.trim() === '') ? null : v;

        const updated = await prisma.seoSetting.update({
            where: { id: req.params.id },
            data: {
                ...(pageTitle !== undefined && { pageTitle: coerce(pageTitle) }),
                ...(metaKeywords !== undefined && { metaKeywords }),
                ...(metaDescription !== undefined && { metaDescription: coerce(metaDescription) }),
                ...(metaRobots !== undefined && { metaRobots: coerce(metaRobots) }),
                ...(customHeader !== undefined && { customHeader: coerce(customHeader) }),
                ...(isVisible !== undefined && { isVisible })
            }
        });

        successResponse(res, updated, 'SEO settings updated');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/seo/admin/pages
 * Add a new page (admin only)
 */
router.post('/admin/pages', async (req, res, next) => {
    try {
        const { pageSlug, pageName, pageTitle, metaKeywords, metaDescription, metaRobots, customHeader } = req.body;

        if (!pageSlug || !pageName) {
            throw new AppError('Page slug and name are required', 400);
        }

        const existing = await prisma.seoSetting.findUnique({
            where: { pageSlug }
        });

        if (existing) {
            throw new AppError('Page with this slug already exists', 409);
        }

        const page = await prisma.seoSetting.create({
            data: {
                pageSlug,
                pageName,
                pageTitle: pageTitle || null,
                metaKeywords: metaKeywords || null,
                metaDescription: metaDescription || null,
                metaRobots: metaRobots || null,
                customHeader: customHeader || null
            }
        });

        successResponse(res, page, 'Page added');
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/seo/admin/pages/:id
 * Delete a page (admin only)
 */
router.delete('/admin/pages/:id', async (req, res, next) => {
    try {
        await prisma.seoSetting.delete({
            where: { id: req.params.id }
        });

        successResponse(res, null, 'Page deleted');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
