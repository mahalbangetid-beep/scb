/**
 * Public Credit Package Routes (No Authentication Required)
 * 
 * Public-facing API for landing page pricing section.
 * Only returns active packages — no sensitive data exposed.
 * 
 * This file is SEPARATE from creditPackages.js to avoid
 * touching the authenticated routes.
 */

const express = require('express');
const router = express.Router();
const creditPackageService = require('../services/creditPackageService');
const { successResponse } = require('../utils/response');

/**
 * GET /api/public/credit-packages
 * Get all active credit packages for public display (landing page pricing)
 * Query: ?category=support|whatsapp_marketing|telegram_marketing (optional)
 * 
 * No authentication required.
 * Only returns: name, description, category, price, credits, bonusCredits,
 *               discountPct, isFeatured, sortOrder — no IDs or admin fields.
 */
router.get('/credit-packages', async (req, res, next) => {
    try {
        const { category } = req.query;
        const validCategories = ['support', 'whatsapp_marketing', 'telegram_marketing'];
        const validatedCategory = category && validCategories.includes(category) ? category : null;

        const packages = await creditPackageService.getPackagesWithValues(validatedCategory);

        // Map to public-safe fields only (no internal IDs, no createdBy, etc.)
        const publicPackages = packages.map(pkg => ({
            name: pkg.name,
            description: pkg.description || '',
            category: pkg.category || 'support',
            price: pkg.price,
            credits: pkg.credits,
            bonusCredits: pkg.bonusCredits || 0,
            discountPct: pkg.discountPct || 0,
            isFeatured: pkg.isFeatured || false,
            sortOrder: pkg.sortOrder || 0,
            // Calculated values from service
            totalCredits: pkg.totalCredits,
            valuePerDollar: pkg.valuePerDollar,
            effectivePrice: pkg.effectivePrice
        }));

        successResponse(res, publicPackages, 'Credit packages retrieved');
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/public/head-tags
 * Returns verification meta tags configured by admin (e.g. Cryptomus domain verification).
 * No authentication required — these are meant to be public.
 */
router.get('/head-tags', async (req, res, next) => {
    try {
        const prisma = require('../utils/prisma');
        const config = await prisma.systemConfig.findFirst({
            where: { key: 'cryptomus_head_code' },
            select: { value: true }
        });

        successResponse(res, {
            headCode: config?.value || ''
        });
    } catch (error) {
        // Fail silently — don't break page rendering
        res.json({ success: true, data: { headCode: '' } });
    }
});

/**
 * GET /api/public/google-integrations
 * Returns Google Analytics ID and Search Console tag for frontend embedding.
 * Section 10.3 — No authentication required.
 */
router.get('/google-integrations', async (req, res, next) => {
    try {
        const prisma = require('../utils/prisma');
        const settings = await prisma.setting.findMany({
            where: {
                key: { in: ['googleAnalyticsId', 'googleSearchConsoleTag'] },
                category: 'platform'
            },
            select: { key: true, value: true }
        });

        const result = {};
        for (const s of settings) {
            result[s.key] = s.value || '';
        }

        successResponse(res, result);
    } catch (error) {
        // Fail silently — don't break page rendering
        res.json({ success: true, data: {} });
    }
});

module.exports = router;
