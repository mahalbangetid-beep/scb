/**
 * Message Credits API Routes
 * 
 * Endpoints for managing message credits:
 * - Get balance (dollar + message credits)
 * - Convert dollar to message credits
 * - Transaction history
 * - Admin: Add/deduct credits
 */

const express = require('express');
const router = express.Router();
const { successResponse, paginatedResponse, parsePagination } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const messageCreditService = require('../services/messageCreditService');

// ==================== USER ENDPOINTS ====================

/**
 * GET /api/message-credits/balance
 * Get user's both balances (dollar and message credits)
 */
router.get('/balance', authenticate, async (req, res, next) => {
    try {
        const balances = await messageCreditService.getBothBalances(req.user.id);

        successResponse(res, {
            dollarBalance: balances.dollarBalance,
            messageCredits: balances.messageCredits,
            creditsPerMessage: balances.creditsPerMessage,
            // Helper calculations
            canSendMessages: Math.floor(balances.messageCredits / balances.creditsPerMessage),
            todayUsage: 0 // Will be populated if tracking is added
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/message-credits/convert
 * DISABLED — Per spec 12.2: "No custom exchange allowed."
 * This endpoint is intentionally disabled. Users must buy predefined packages instead.
 */
router.post('/convert', authenticate, async (req, res) => {
    return res.status(403).json({
        success: false,
        error: {
            message: 'Dollar-to-credits conversion is no longer available. Please purchase a message package instead.'
        }
    });
});

/**
 * GET /api/message-credits/transactions
 * Get message credit transaction history
 */
router.get('/transactions', authenticate, async (req, res, next) => {
    try {
        const { page, limit } = parsePagination(req.query);
        const { type } = req.query;

        const result = await messageCreditService.getTransactions(req.user.id, {
            page,
            limit,
            type // CREDIT, DEBIT, CONVERSION, SIGNUP_BONUS
        });

        paginatedResponse(res, result.transactions, {
            page: result.pagination.page,
            limit: result.pagination.limit,
            total: result.pagination.total
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/message-credits/config
 * Get message credit configuration (rates, etc)
 */
router.get('/config', authenticate, async (req, res, next) => {
    try {
        const config = await messageCreditService.getConfig();

        successResponse(res, {
            freeSignupCredits: config.freeSignupCredits,
            creditsPerMessage: config.creditsPerMessage,
            description: `1 message = ${config.creditsPerMessage} credit(s). Purchase packages to get credits.`
        });
    } catch (error) {
        next(error);
    }
});

// ==================== ADMIN ENDPOINTS ====================

/**
 * POST /api/message-credits/admin/add
 * Admin: Add message credits to a user
 */
router.post('/admin/add', authenticate, requireRole(['MASTER_ADMIN', 'ADMIN']), async (req, res, next) => {
    try {
        const { userId, amount, description } = req.body;

        if (!userId) {
            throw new AppError('User ID is required', 400);
        }

        if (!amount || amount <= 0) {
            throw new AppError('Invalid amount. Must be greater than 0', 400);
        }

        const result = await messageCreditService.addCredits(
            userId,
            parseInt(amount),
            description || `Admin grant: ${amount} credits`,
            `ADMIN_${req.user.id}_${Date.now()}`
        );

        successResponse(res, {
            success: true,
            creditsAdded: result.creditsAdded,
            newBalance: result.balance
        }, `Added ${amount} message credits to user`);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/message-credits/admin/deduct
 * Admin: Deduct message credits from a user
 */
router.post('/admin/deduct', authenticate, requireRole(['MASTER_ADMIN', 'ADMIN']), async (req, res, next) => {
    try {
        const { userId, amount, description } = req.body;

        if (!userId) {
            throw new AppError('User ID is required', 400);
        }

        if (!amount || amount <= 0) {
            throw new AppError('Invalid amount. Must be greater than 0', 400);
        }

        const result = await messageCreditService.deductCredits(
            userId,
            parseInt(amount),
            description || `Admin deduct: ${amount} credits`,
            `ADMIN_DEDUCT_${req.user.id}_${Date.now()}`
        );

        if (!result.success) {
            throw new AppError(result.reason === 'insufficient_credits'
                ? 'User has insufficient credits'
                : 'Failed to deduct credits', 400);
        }

        successResponse(res, {
            success: true,
            creditsDeducted: amount,
            newBalance: result.balance
        }, `Deducted ${amount} message credits from user`);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/message-credits/admin/user/:userId
 * Admin: Get a user's message credit balance and history
 */
router.get('/admin/user/:userId', authenticate, requireRole(['MASTER_ADMIN', 'ADMIN']), async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { page, limit } = parsePagination(req.query);

        const [balances, transactions] = await Promise.all([
            messageCreditService.getBothBalances(userId),
            messageCreditService.getTransactions(userId, { page, limit })
        ]);

        successResponse(res, {
            balance: balances,
            transactions: transactions.transactions,
            pagination: transactions.pagination
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/message-credits/admin/give-signup-bonus
 * Admin: Manually give signup bonus to a user (if not already given)
 */
router.post('/admin/give-signup-bonus', authenticate, requireRole(['MASTER_ADMIN', 'ADMIN']), async (req, res, next) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            throw new AppError('User ID is required', 400);
        }

        const result = await messageCreditService.giveSignupCredits(userId);

        if (!result.success && result.reason === 'already_given') {
            throw new AppError('User has already received signup credits', 400);
        }

        successResponse(res, {
            success: true,
            creditsAdded: result.creditsAdded,
            newBalance: result.balance
        }, `Gave ${result.creditsAdded} signup credits to user`);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
