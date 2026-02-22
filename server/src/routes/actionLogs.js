/**
 * API Action Logs Routes
 * 
 * Endpoints for viewing API action logs (refill, cancel, status requests)
 */

const express = require('express');
const router = express.Router();
const apiActionLogService = require('../services/apiActionLogService');
const { authenticate } = require('../middleware/auth');
const { successResponse } = require('../utils/response');

router.use(authenticate);

/**
 * GET /api/action-logs
 * Get paginated API action logs for the current user
 */
router.get('/', async (req, res, next) => {
    try {
        const { page = 1, limit = 50, action, orderId } = req.query;
        const result = await apiActionLogService.getLogs(req.user.id, {
            page: parseInt(page),
            limit: parseInt(limit),
            action: action || undefined,
            orderId: orderId || undefined
        });
        successResponse(res, result);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/action-logs/order/:orderId
 * Get logs for a specific order
 */
router.get('/order/:orderId', async (req, res, next) => {
    try {
        const logs = await apiActionLogService.getOrderLogs(req.params.orderId);
        successResponse(res, logs);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
