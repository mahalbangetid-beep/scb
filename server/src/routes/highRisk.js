/**
 * High-Risk Features Routes
 * 
 * API endpoints for high-risk feature management
 * Phase 4: Rule-Based Bot Control - High-Risk Features
 * 
 * ⚠️ All routes are heavily logged and require explicit confirmation
 */

const express = require('express');
const router = express.Router();
const highRiskService = require('../services/highRiskService');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { successResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');

// All routes require authentication AND admin role
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/high-risk/features
 * Get all feature definitions
 */
router.get('/features', async (req, res, next) => {
    try {
        const features = highRiskService.getFeatureDefinitions();
        successResponse(res, features);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/high-risk/enabled
 * Get enabled features for current user
 */
router.get('/enabled', async (req, res, next) => {
    try {
        const features = await highRiskService.getEnabledFeatures(req.user.id);
        successResponse(res, features);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/high-risk/history
 * Get action history
 */
router.get('/history', async (req, res, next) => {
    try {
        const { limit } = req.query;
        const history = await highRiskService.getActionHistory(req.user.id, {
            limit: limit ? parseInt(limit) : 50
        });
        successResponse(res, history);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/high-risk/execute/:feature
 * Execute a high-risk action
 */
router.post('/execute/:feature', async (req, res, next) => {
    try {
        const { feature } = req.params;
        const { confirmed, ...params } = req.body;

        // Get feature definition
        const features = highRiskService.getFeatureDefinitions();
        const featureDef = features[feature];

        if (!featureDef) {
            throw new AppError('Unknown feature', 400);
        }

        // Check confirmation for critical features
        if (featureDef.requireConfirmation && !confirmed) {
            return successResponse(res, {
                requireConfirmation: true,
                feature: featureDef.name,
                riskLevel: featureDef.risk,
                description: featureDef.description,
                message: `⚠️ This is a ${featureDef.risk} risk action. Please confirm to proceed.`
            });
        }

        // Execute the action
        const executorInfo = {
            ip: req.ip || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent'],
            userId: req.user.id,
            timestamp: new Date().toISOString()
        };

        const result = await highRiskService.executeAction(
            req.user.id,
            feature,
            params,
            executorInfo
        );

        successResponse(res, result, `${featureDef.name} completed successfully`);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/high-risk/force-complete
 * Force complete an order (convenience endpoint)
 */
router.post('/force-complete', async (req, res, next) => {
    try {
        const { orderId, reason, confirmed } = req.body;

        if (!orderId || !reason) {
            throw new AppError('Order ID and reason are required', 400);
        }

        if (!confirmed) {
            return successResponse(res, {
                requireConfirmation: true,
                message: '⚠️ CRITICAL: Force completing an order will mark it as done without actual completion. Are you sure?'
            });
        }

        const executorInfo = {
            ip: req.ip,
            userId: req.user.id,
            timestamp: new Date().toISOString()
        };

        const result = await highRiskService.executeAction(
            req.user.id,
            'FORCE_COMPLETE',
            { orderId, reason },
            executorInfo
        );

        successResponse(res, result, 'Order force completed');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/high-risk/update-link
 * Update order link (convenience endpoint)
 */
router.post('/update-link', async (req, res, next) => {
    try {
        const { orderId, newLink, reason, confirmed } = req.body;

        if (!orderId || !newLink) {
            throw new AppError('Order ID and new link are required', 400);
        }

        if (!confirmed) {
            return successResponse(res, {
                requireConfirmation: true,
                message: '⚠️ HIGH: Changing order link may affect service delivery. Confirm to proceed.'
            });
        }

        const executorInfo = {
            ip: req.ip,
            userId: req.user.id,
            timestamp: new Date().toISOString()
        };

        const result = await highRiskService.executeAction(
            req.user.id,
            'UPDATE_ORDER_LINK',
            { orderId, newLink, reason },
            executorInfo
        );

        successResponse(res, result, 'Order link updated');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/high-risk/verify-payment
 * Verify payment (convenience endpoint)
 */
router.post('/verify-payment', async (req, res, next) => {
    try {
        const { paymentId, reference, confirmed } = req.body;

        if (!paymentId && !reference) {
            throw new AppError('Payment ID or reference is required', 400);
        }

        if (!confirmed) {
            return successResponse(res, {
                requireConfirmation: true,
                message: '⚠️ HIGH: Manual payment verification will add balance. Confirm payment receipt first.'
            });
        }

        const executorInfo = {
            ip: req.ip,
            userId: req.user.id,
            timestamp: new Date().toISOString()
        };

        const result = await highRiskService.executeAction(
            req.user.id,
            'VERIFY_PAYMENT',
            { paymentId, reference },
            executorInfo
        );

        successResponse(res, result, 'Payment verified');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
