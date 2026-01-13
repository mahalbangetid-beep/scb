const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { successResponse, paginatedResponse, parsePagination } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const commandParser = require('../services/commandParser');
const commandHandler = require('../services/commandHandler');
const creditService = require('../services/creditService');

// All routes require authentication
router.use(authenticate);

// ==================== BOT COMMANDS ====================

// POST /api/bot/process - Process a command manually (for testing)
router.post('/process', async (req, res, next) => {
    try {
        const { message } = req.body;

        if (!message) {
            throw new AppError('Message is required', 400);
        }

        // Process the command
        const result = await commandHandler.processCommand({
            userId: req.user.id,
            message,
            senderNumber: 'manual-test',
            platform: 'WHATSAPP'
        });

        successResponse(res, {
            parsed: commandParser.parse(message),
            result
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/bot/parse - Parse a message (without executing)
router.post('/parse', async (req, res, next) => {
    try {
        const { message } = req.body;

        if (!message) {
            throw new AppError('Message is required', 400);
        }

        const parsed = commandParser.parse(message);

        successResponse(res, {
            message,
            isCommand: commandParser.isCommandMessage(message),
            parsed
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/bot/commands - Get command history
router.get('/commands', async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { orderId, command, status } = req.query;

        // Build where clause - join through orders to filter by user
        const where = {
            order: {
                userId: req.user.id
            }
        };

        if (command) {
            where.command = command;
        }

        if (status) {
            where.status = status;
        }

        const [commands, total] = await Promise.all([
            prisma.orderCommand.findMany({
                where,
                include: {
                    order: {
                        select: {
                            externalOrderId: true,
                            panel: {
                                select: {
                                    alias: true
                                }
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.orderCommand.count({ where })
        ]);

        paginatedResponse(res, commands, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// GET /api/bot/commands/stats - Get command statistics
router.get('/commands/stats', async (req, res, next) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [total, todayCount, byCommand, byStatus] = await Promise.all([
            prisma.orderCommand.count({
                where: {
                    order: { userId: req.user.id }
                }
            }),
            prisma.orderCommand.count({
                where: {
                    order: { userId: req.user.id },
                    createdAt: { gte: today }
                }
            }),
            prisma.orderCommand.groupBy({
                by: ['command'],
                where: {
                    order: { userId: req.user.id }
                },
                _count: true
            }),
            prisma.orderCommand.groupBy({
                by: ['status'],
                where: {
                    order: { userId: req.user.id }
                },
                _count: true
            })
        ]);

        successResponse(res, {
            total,
            today: todayCount,
            byCommand: byCommand.map(c => ({ command: c.command, count: c._count })),
            byStatus: byStatus.map(s => ({ status: s.status, count: s._count }))
        });
    } catch (error) {
        next(error);
    }
});

// ==================== CREDIT ====================

// GET /api/bot/credit - Get user's credit balance
router.get('/credit', async (req, res, next) => {
    try {
        const balance = await creditService.getBalance(req.user.id);
        const rates = {
            waMessage: await creditService.getMessageRate('WHATSAPP', false, req.user),
            tgMessage: await creditService.getMessageRate('TELEGRAM', false, req.user),
            groupMessage: await creditService.getMessageRate('WHATSAPP', true, req.user)
        };

        successResponse(res, {
            balance,
            rates,
            user: {
                discountRate: req.user.discountRate || 0,
                customRates: {
                    wa: req.user.customWaRate,
                    tg: req.user.customTgRate,
                    group: req.user.customGroupRate
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/bot/credit/transactions - Get credit transaction history
router.get('/credit/transactions', async (req, res, next) => {
    try {
        const { page, limit } = parsePagination(req.query);
        const { type } = req.query;

        const result = await creditService.getTransactions(req.user.id, {
            page,
            limit,
            type
        });

        paginatedResponse(res, result.transactions, result.pagination);
    } catch (error) {
        next(error);
    }
});

// ==================== BOT SETTINGS ====================

// GET /api/bot/settings - Get bot settings
router.get('/settings', async (req, res, next) => {
    try {
        // Get user's bot-related settings
        const settings = await prisma.setting.findMany({
            where: { userId: req.user.id }
        });

        // Get auto-reply rules count
        const autoReplyCount = await prisma.autoReplyRule.count({
            where: { userId: req.user.id }
        });

        // Get active panels count
        const panelsCount = await prisma.smmPanel.count({
            where: { userId: req.user.id, isActive: true }
        });

        // Get connected devices
        const devicesCount = await prisma.device.count({
            where: { userId: req.user.id, status: 'connected' }
        });

        successResponse(res, {
            settings: settings.reduce((acc, s) => {
                acc[s.key] = s.value;
                return acc;
            }, {}),
            stats: {
                autoReplyRules: autoReplyCount,
                activePanels: panelsCount,
                connectedDevices: devicesCount
            }
        });
    } catch (error) {
        next(error);
    }
});

// PUT /api/bot/settings - Update bot settings
router.put('/settings', async (req, res, next) => {
    try {
        const { settings } = req.body;

        if (!settings || typeof settings !== 'object') {
            throw new AppError('Settings object is required', 400);
        }

        // Update each setting
        for (const [key, value] of Object.entries(settings)) {
            await prisma.setting.upsert({
                where: {
                    key_userId: {
                        key,
                        userId: req.user.id
                    }
                },
                update: { value: String(value) },
                create: {
                    userId: req.user.id,
                    key,
                    value: String(value)
                }
            });
        }

        successResponse(res, null, 'Settings updated');
    } catch (error) {
        next(error);
    }
});

// ==================== KEYWORDS ====================

// GET /api/bot/keywords - Get custom keyword responses
router.get('/keywords', async (req, res, next) => {
    try {
        const rules = await prisma.autoReplyRule.findMany({
            where: {
                userId: req.user.id,
                isCommandHandler: false
            },
            orderBy: [
                { priority: 'desc' },
                { createdAt: 'desc' }
            ]
        });

        successResponse(res, rules);
    } catch (error) {
        next(error);
    }
});

// POST /api/bot/keywords - Add keyword
router.post('/keywords', async (req, res, next) => {
    try {
        const { name, trigger, response, matchType, priority } = req.body;

        if (!name || !trigger || !response) {
            throw new AppError('Name, trigger, and response are required', 400);
        }

        const rule = await prisma.autoReplyRule.create({
            data: {
                name,
                keywords: trigger,           // Schema field is 'keywords'
                response,
                triggerType: matchType || 'contains',  // Schema field is 'triggerType'
                priority: priority || 0,
                isActive: true,
                userId: req.user.id
            }
        });

        successResponse(res, rule, 'Keyword added');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
