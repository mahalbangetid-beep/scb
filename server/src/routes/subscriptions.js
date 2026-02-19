/**
 * Subscription Routes
 * 
 * API endpoints for managing monthly subscriptions
 * From clientupdate2.md: Auto-renewal system
 */

const express = require('express');
const router = express.Router();
const subscriptionService = require('../services/subscriptionService');
const { authenticate, requireRole } = require('../middleware/auth');
const { successResponse, createdResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');

// All routes require authentication
router.use(authenticate);

// ==================== USER ROUTES ====================

/**
 * GET /api/subscriptions
 * Get current user's subscriptions
 */
router.get('/', async (req, res, next) => {
    try {
        const subscriptions = await subscriptionService.getUserSubscriptions(req.user.id);
        successResponse(res, subscriptions);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/subscriptions/summary
 * Get subscription summary for user
 */
router.get('/summary', async (req, res, next) => {
    try {
        const summary = await subscriptionService.getUserSummary(req.user.id);
        successResponse(res, summary);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/subscriptions/active
 * Get active subscriptions only
 */
router.get('/active', async (req, res, next) => {
    try {
        const subscriptions = await subscriptionService.getActiveSubscriptions(req.user.id);
        successResponse(res, subscriptions);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/subscriptions/fees
 * Get current subscription fees
 */
router.get('/fees', async (req, res, next) => {
    try {
        const fees = {
            DEVICE: await subscriptionService.getFee('DEVICE'),
            TELEGRAM_BOT: await subscriptionService.getFee('TELEGRAM_BOT'),
            SMM_PANEL: await subscriptionService.getFee('SMM_PANEL')
        };
        successResponse(res, fees);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/subscriptions/:id/resume
 * Resume a paused subscription
 */
router.post('/:id/resume', async (req, res, next) => {
    try {
        const subscription = await subscriptionService.resumeSubscription(
            req.params.id,
            req.user.id
        );
        successResponse(res, subscription, 'Subscription resumed successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/subscriptions/:id/cancel
 * Cancel a subscription
 */
router.post('/:id/cancel', async (req, res, next) => {
    try {
        const subscription = await subscriptionService.cancelSubscription(
            req.params.id,
            req.user.id
        );
        successResponse(res, subscription, 'Subscription cancelled');
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/subscriptions/resource/:type/:resourceId
 * Check subscription status for a specific resource
 */
router.get('/resource/:type/:resourceId', async (req, res, next) => {
    try {
        const { type, resourceId } = req.params;
        const subscription = await subscriptionService.getByResource(
            req.user.id,
            type.toUpperCase(),
            resourceId
        );

        successResponse(res, {
            hasSubscription: !!subscription,
            subscription: subscription || null
        });
    } catch (error) {
        next(error);
    }
});

// ==================== ADMIN ROUTES ====================

/**
 * GET /api/subscriptions/admin/all
 * Get all subscriptions (admin only)
 */
router.get('/admin/all', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const { status, userId } = req.query;

        const where = {};
        if (status) where.status = status;
        if (userId) where.userId = userId;

        const prisma = require('../utils/prisma');
        const subscriptions = await prisma.monthlySubscription.findMany({
            where,
            orderBy: { nextBillingDate: 'asc' },
            take: 100
        });

        successResponse(res, subscriptions);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/subscriptions/admin/due
 * Get subscriptions due for renewal (admin only)
 */
router.get('/admin/due', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const dueSubscriptions = await subscriptionService.getDueSubscriptions();
        successResponse(res, dueSubscriptions);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/subscriptions/admin/process-renewals
 * Manually trigger renewal processing (admin only)
 */
router.post('/admin/process-renewals', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const results = await subscriptionService.processAllRenewals();
        successResponse(res, results, 'Renewals processed');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/subscriptions/admin/:id/pause
 * Pause a subscription (admin only)
 */
router.post('/admin/:id/pause', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const { reason } = req.body;

        // Verify subscription exists
        const prisma = require('../utils/prisma');
        const existing = await prisma.monthlySubscription.findUnique({
            where: { id: req.params.id }
        });

        if (!existing) {
            throw new AppError('Subscription not found', 404);
        }

        if (existing.status === 'PAUSED') {
            throw new AppError('Subscription is already paused', 400);
        }

        if (existing.status === 'CANCELLED') {
            throw new AppError('Cannot pause a cancelled subscription', 400);
        }

        const subscription = await subscriptionService.pauseSubscription(req.params.id, reason);
        successResponse(res, subscription, 'Subscription paused');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/subscriptions/admin/create
 * Manually create subscription for a user (admin only)
 */
router.post('/admin/create', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const { userId, resourceType, resourceId, resourceName, isFreeFirst } = req.body;

        if (!userId || !resourceType || !resourceId) {
            throw new AppError('userId, resourceType, and resourceId are required', 400);
        }

        const subscription = await subscriptionService.createSubscription(
            userId,
            resourceType,
            resourceId,
            resourceName,
            isFreeFirst || false
        );

        createdResponse(res, subscription, 'Subscription created');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/subscriptions/admin/:id/extend
 * Extend subscription expiry (Master Admin only)
 * Per spec: "Master Admin can extend expiry"
 */
router.post('/admin/:id/extend', requireRole(['MASTER_ADMIN']), async (req, res, next) => {
    try {
        const { days, months } = req.body;

        if (!days && !months) {
            throw new AppError('days or months is required', 400);
        }

        const parsedDays = days ? parseInt(days) : 0;
        const parsedMonths = months ? parseInt(months) : 0;

        if ((days && (isNaN(parsedDays) || parsedDays <= 0)) || (months && (isNaN(parsedMonths) || parsedMonths <= 0))) {
            throw new AppError('days and months must be positive numbers', 400);
        }

        const prisma = require('../utils/prisma');
        const subscription = await prisma.monthlySubscription.findUnique({
            where: { id: req.params.id }
        });

        if (!subscription) {
            throw new AppError('Subscription not found', 404);
        }

        // Calculate new billing date
        const currentBillingDate = new Date(subscription.nextBillingDate);
        const newBillingDate = new Date(currentBillingDate);

        if (parsedMonths) {
            newBillingDate.setMonth(newBillingDate.getMonth() + parsedMonths);
        }
        if (parsedDays) {
            newBillingDate.setDate(newBillingDate.getDate() + parsedDays);
        }

        const updated = await prisma.monthlySubscription.update({
            where: { id: req.params.id },
            data: {
                nextBillingDate: newBillingDate,
                status: 'ACTIVE', // Re-activate if was paused/expired
                pausedAt: null,
                failedAttempts: 0,
                lastFailReason: null
            }
        });

        successResponse(res, updated, `Subscription extended to ${newBillingDate.toISOString().split('T')[0]}`);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/subscriptions/admin/expiring
 * Get subscriptions expiring soon (admin only)
 */
router.get('/admin/expiring', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const days = parseInt(req.query.days) || 3;
        const expiring = await subscriptionService.getExpiringSoon(days);
        successResponse(res, expiring);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
