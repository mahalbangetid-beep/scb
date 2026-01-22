/**
 * Billing Mode Routes
 * 
 * API endpoints for managing global billing mode (CREDITS vs DOLLARS)
 */

const express = require('express');
const router = express.Router();
const { successResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const billingModeService = require('../services/billingModeService');

/**
 * GET /api/billing-mode
 * Get current billing mode (for frontend display)
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const modeInfo = await billingModeService.getModeInfo();
        successResponse(res, modeInfo);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/billing-mode/public
 * Get current billing mode (no auth required - for wallet page)
 */
router.get('/public', async (req, res, next) => {
    try {
        const modeInfo = await billingModeService.getModeInfo();
        successResponse(res, modeInfo);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/billing-mode
 * Update billing mode (Admin only)
 */
router.put('/', authenticate, requireRole(['MASTER_ADMIN', 'ADMIN']), async (req, res, next) => {
    try {
        const { mode } = req.body;

        if (!mode) {
            throw new AppError('Mode is required', 400);
        }

        if (!['CREDITS', 'DOLLARS'].includes(mode)) {
            throw new AppError('Mode must be CREDITS or DOLLARS', 400);
        }

        const newMode = await billingModeService.setMode(mode);
        const modeInfo = await billingModeService.getModeInfo();

        successResponse(res, modeInfo, `Billing mode changed to ${newMode}`);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
