/**
 * Guarantee Routes
 * 
 * API endpoints for managing guarantee configuration
 * Phase 2: Order Command Handling - Guarantee Validation
 */

const express = require('express');
const router = express.Router();
const guaranteeService = require('../services/guaranteeService');
const { authenticate } = require('../middleware/auth');
const { successResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const { safeParseArray } = require('../utils/safeJson');

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/guarantee/config
 * Get current user's guarantee configuration
 */
router.get('/config', async (req, res, next) => {
    try {
        const config = await guaranteeService.getConfig(req.user.id);

        // Parse patterns for frontend
        const parsedConfig = {
            ...config,
            patterns: safeParseArray(config.patterns)
        };

        successResponse(res, parsedConfig);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/guarantee/config
 * Update guarantee configuration
 */
router.put('/config', async (req, res, next) => {
    try {
        const { patterns, keywords, emojis, defaultDays, isEnabled, noGuaranteeAction } = req.body;

        const updates = {};

        // Validate and stringify patterns if array
        if (patterns !== undefined) {
            if (!Array.isArray(patterns)) {
                throw new AppError('patterns must be an array', 400);
            }
            // Validate each pattern is a valid regex
            for (const pattern of patterns) {
                if (pattern) {
                    try {
                        new RegExp(pattern);
                    } catch (e) {
                        throw new AppError(`Invalid regex pattern: ${pattern}`, 400);
                    }
                }
            }
            updates.patterns = JSON.stringify(patterns);
        }

        if (keywords !== undefined) {
            updates.keywords = keywords;
        }

        if (emojis !== undefined) {
            updates.emojis = emojis;
        }

        if (defaultDays !== undefined) {
            if (typeof defaultDays !== 'number' || defaultDays < 1 || defaultDays > 365) {
                throw new AppError('defaultDays must be a number between 1 and 365', 400);
            }
            updates.defaultDays = defaultDays;
        }

        if (isEnabled !== undefined) {
            updates.isEnabled = !!isEnabled;
        }

        if (noGuaranteeAction !== undefined) {
            if (!['ALLOW', 'DENY', 'ASK'].includes(noGuaranteeAction)) {
                throw new AppError('noGuaranteeAction must be ALLOW, DENY, or ASK', 400);
            }
            updates.noGuaranteeAction = noGuaranteeAction;
        }

        const config = await guaranteeService.updateConfig(req.user.id, updates);

        // Parse for response
        const parsedConfig = {
            ...config,
            patterns: safeParseArray(config.patterns)
        };

        successResponse(res, parsedConfig, 'Guarantee configuration updated');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/guarantee/test
 * Test guarantee extraction on a sample service name
 */
router.post('/test', async (req, res, next) => {
    try {
        const { serviceName } = req.body;

        if (!serviceName) {
            throw new AppError('serviceName is required', 400);
        }

        const config = await guaranteeService.getConfig(req.user.id);
        const guaranteeDays = guaranteeService.extractGuaranteeDays(serviceName, config);

        successResponse(res, {
            serviceName,
            guaranteeDays,
            hasGuarantee: guaranteeDays !== null,
            message: guaranteeDays
                ? `✅ Found ${guaranteeDays} day guarantee`
                : '❌ No guarantee pattern matched'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/guarantee/check-order/:orderId
 * Check guarantee status for a specific order
 */
router.post('/check-order/:orderId', async (req, res, next) => {
    try {
        const prisma = require('../utils/prisma');
        const { orderId } = req.params;

        const order = await prisma.order.findFirst({
            where: {
                externalOrderId: orderId,
                userId: req.user.id
            }
        });

        if (!order) {
            throw new AppError('Order not found', 404);
        }

        const result = await guaranteeService.checkGuarantee(order, req.user.id);
        const message = guaranteeService.formatGuaranteeMessage(result, order);

        successResponse(res, {
            orderId,
            serviceName: order.serviceName,
            status: order.status,
            completedAt: order.completedAt,
            valid: result.valid,
            reason: result.reason,
            message,
            details: result.details
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/guarantee/info/:orderId
 * Get guarantee info for display purposes
 */
router.get('/info/:orderId', async (req, res, next) => {
    try {
        const prisma = require('../utils/prisma');
        const { orderId } = req.params;

        const order = await prisma.order.findFirst({
            where: {
                externalOrderId: orderId,
                userId: req.user.id
            }
        });

        if (!order) {
            throw new AppError('Order not found', 404);
        }

        const config = await guaranteeService.getConfig(req.user.id);
        const info = guaranteeService.getGuaranteeInfo(order, config);

        successResponse(res, {
            orderId,
            serviceName: order.serviceName,
            ...info
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
