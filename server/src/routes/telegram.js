/**
 * Telegram Bot Routes
 * 
 * Routes untuk mengelola Telegram Bot integration
 */

const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const telegramService = require('../services/telegram');
const { successResponse, createdResponse, AppError } = require('../utils/response');
const { parsePagination } = require('../utils/response');

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/telegram/bots
 * Get all bots for current user
 */
router.get('/bots', async (req, res, next) => {
    try {
        const bots = await telegramService.getUserBots(req.user.id);
        successResponse(res, bots);
    } catch (error) {
        next(error);
    }
});

/**
 * Helper: Verify bot belongs to current user
 */
const verifyBotOwnership = async (botId, userId) => {
    const bot = await prisma.telegramBot.findFirst({
        where: {
            id: botId,
            userId: userId
        }
    });
    if (!bot) {
        throw new AppError('Bot not found', 404);
    }
    return bot;
};

/**
 * GET /api/telegram/bots/:id
 * Get specific bot status
 */
router.get('/bots/:id', async (req, res, next) => {
    try {
        // Verify ownership first
        await verifyBotOwnership(req.params.id, req.user.id);
        const status = await telegramService.getBotStatus(req.params.id);
        successResponse(res, status);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/telegram/bots
 * Create a new Telegram bot
 */
router.post('/bots', async (req, res, next) => {
    try {
        const { botToken } = req.body;

        if (!botToken) {
            throw new AppError('Bot token is required', 400);
        }

        const bot = await telegramService.createBot(req.user.id, botToken);
        createdResponse(res, bot, 'Telegram bot created successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/telegram/bots/:id/start
 * Start a bot (begin listening)
 */
router.post('/bots/:id/start', async (req, res, next) => {
    try {
        // Verify ownership first
        await verifyBotOwnership(req.params.id, req.user.id);
        const result = await telegramService.startBot(req.params.id);
        successResponse(res, result, 'Bot started successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/telegram/bots/:id/stop
 * Stop a running bot
 */
router.post('/bots/:id/stop', async (req, res, next) => {
    try {
        // Verify ownership first
        await verifyBotOwnership(req.params.id, req.user.id);
        const result = await telegramService.stopBot(req.params.id);
        successResponse(res, result, 'Bot stopped successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/telegram/bots/:id
 * Delete a bot
 */
router.delete('/bots/:id', async (req, res, next) => {
    try {
        // Verify ownership first
        await verifyBotOwnership(req.params.id, req.user.id);
        await telegramService.deleteBot(req.params.id, req.user.id);
        successResponse(res, null, 'Bot deleted successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/telegram/bots/:id/send
 * Send a message via bot
 */
router.post('/bots/:id/send', async (req, res, next) => {
    try {
        // Verify ownership first
        await verifyBotOwnership(req.params.id, req.user.id);

        const { chatId, message, parseMode } = req.body;

        if (!chatId || !message) {
            throw new AppError('Chat ID and message are required', 400);
        }

        const result = await telegramService.sendMessage(
            req.params.id,
            chatId,
            message,
            { parseMode }
        );

        successResponse(res, result, 'Message sent successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/telegram/bots/:id/messages
 * Get messages for a bot (SECURE - ownership verified)
 */
router.get('/bots/:id/messages', async (req, res, next) => {
    try {
        // CRITICAL: Verify bot ownership before showing messages
        await verifyBotOwnership(req.params.id, req.user.id);

        // Use safe pagination
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [messages, total] = await Promise.all([
            prisma.message.findMany({
                where: {
                    telegramBotId: req.params.id,  // Use correct field name
                    platform: 'TELEGRAM'
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.message.count({
                where: {
                    telegramBotId: req.params.id,
                    platform: 'TELEGRAM'
                }
            })
        ]);

        successResponse(res, {
            messages,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
