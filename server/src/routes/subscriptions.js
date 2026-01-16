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
