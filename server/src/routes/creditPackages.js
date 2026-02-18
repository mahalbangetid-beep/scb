/**
 * Credit Package Routes
 * 
 * API endpoints for credit package management
 * From clientupdate2.md: Message credit packages
 */

const express = require('express');
const router = express.Router();
const creditPackageService = require('../services/creditPackageService');
const { authenticate, requireRole } = require('../middleware/auth');
const { successResponse, createdResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');

// All routes require authentication
router.use(authenticate);

// ==================== USER ROUTES ====================

/**
 * GET /api/credit-packages
 * Get all active credit packages (for purchase)
 * Query: ?category=support|whatsapp_marketing|telegram_marketing (optional filter)
 */
router.get('/', async (req, res, next) => {
    try {
        const { category } = req.query;
        const packages = await creditPackageService.getPackagesWithValues(category || null);
        successResponse(res, packages);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/credit-packages/featured
 * Get featured package
 */
router.get('/featured', async (req, res, next) => {
    try {
        const pkg = await creditPackageService.getFeatured();
        if (pkg) {
            successResponse(res, {
                ...pkg,
                ...creditPackageService.calculateValue(pkg)
            });
        } else {
            successResponse(res, null);
        }
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/credit-packages/:id
 * Get a single package details
 */
router.get('/:id', async (req, res, next) => {
    try {
        const pkg = await creditPackageService.getById(req.params.id);

        if (!pkg) {
            throw new AppError('Package not found', 404);
        }

        successResponse(res, {
            ...pkg,
            ...creditPackageService.calculateValue(pkg)
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/credit-packages/:id/purchase
 * Purchase a credit package (creates payment request)
 */
router.post('/:id/purchase', async (req, res, next) => {
    try {
        const { quantity, paymentMethod } = req.body;
        const packageId = req.params.id;

        const pkg = await creditPackageService.getById(packageId);
        if (!pkg) {
            throw new AppError('Package not found', 404);
        }

        if (!pkg.isActive) {
            throw new AppError('This package is no longer available', 400);
        }

        const qty = quantity || 1;
        const totalPrice = pkg.price * qty;
        const totalCredits = (pkg.credits + (pkg.bonusCredits || 0)) * qty;

        // Create payment record
        const prisma = require('../utils/prisma');
        const payment = await prisma.payment.create({
            data: {
                userId: req.user.id,
                amount: totalPrice,
                method: paymentMethod || 'PENDING',
                status: 'PENDING',
                metadata: JSON.stringify({
                    type: 'CREDIT_PACKAGE',
                    packageId,
                    packageName: pkg.name,
                    quantity: qty,
                    credits: totalCredits,
                    baseCredits: pkg.credits * qty,
                    bonusCredits: (pkg.bonusCredits || 0) * qty
                })
            }
        });

        successResponse(res, {
            paymentId: payment.id,
            package: pkg.name,
            quantity: qty,
            totalPrice,
            totalCredits,
            status: 'PENDING',
            message: 'Payment request created. Complete payment to receive credits.'
        });
    } catch (error) {
        next(error);
    }
});

// ==================== ADMIN ROUTES ====================

/**
 * GET /api/credit-packages/admin/all
 * Get all packages including inactive (admin only)
 */
router.get('/admin/all', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const packages = await creditPackageService.getAllPackages();

        // Add calculated values
        const packagesWithValues = packages.map(pkg => ({
            ...pkg,
            ...creditPackageService.calculateValue(pkg)
        }));

        successResponse(res, packagesWithValues);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/credit-packages/admin
 * Create a new package (admin only)
 */
router.post('/admin', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const pkg = await creditPackageService.create(req.body, req.user.id);
        createdResponse(res, pkg, 'Package created successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/credit-packages/admin/:id
 * Update a package (admin only)
 */
router.put('/admin/:id', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const pkg = await creditPackageService.update(req.params.id, req.body);
        successResponse(res, pkg, 'Package updated successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/credit-packages/admin/:id
 * Delete a package (admin only)
 */
router.delete('/admin/:id', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        await creditPackageService.delete(req.params.id);
        successResponse(res, null, 'Package deleted successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/credit-packages/admin/:id/toggle
 * Toggle package active status (admin only)
 */
router.post('/admin/:id/toggle', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const pkg = await creditPackageService.toggleActive(req.params.id);
        successResponse(res, pkg, `Package ${pkg.isActive ? 'activated' : 'deactivated'}`);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/credit-packages/admin/:id/feature
 * Toggle featured status (admin only)
 */
router.post('/admin/:id/feature', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const pkg = await creditPackageService.toggleFeatured(req.params.id);
        successResponse(res, pkg, `Package ${pkg.isFeatured ? 'featured' : 'unfeatured'}`);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/credit-packages/admin/:id/grant
 * Grant package credits to a user (admin only)
 */
router.post('/admin/:id/grant', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const { userId, quantity, note } = req.body;

        if (!userId) {
            throw new AppError('User ID is required', 400);
        }

        const result = await creditPackageService.purchase(
            userId,
            req.params.id,
            quantity || 1,
            `ADMIN_GRANT_${req.user.id}_${Date.now()}`
        );

        // Log activity
        const prisma = require('../utils/prisma');
        await prisma.activityLog.create({
            data: {
                userId: req.user.id,
                action: 'CREDIT_GRANTED',
                category: 'ADMIN',
                details: JSON.stringify({
                    targetUser: userId,
                    packageId: req.params.id,
                    packageName: result.packageName,
                    credits: result.totalCredits,
                    note: note || null
                }),
                ipAddress: req.ip
            }
        });

        successResponse(res, result, `Granted ${result.totalCredits} credits to user`);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
