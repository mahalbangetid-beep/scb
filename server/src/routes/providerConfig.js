/**
 * Provider Configuration API Routes
 * 
 * Endpoints for managing provider forwarding configurations
 * Feature 2: Provider Forwarding Configuration
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { successResponse } = require('../utils/response');
const prisma = require('../utils/prisma');
const providerForwardingService = require('../services/providerForwardingService');

/**
 * GET /api/provider-config
 * Get all provider configurations for the user
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const configs = await prisma.providerConfig.findMany({
            where: { userId: req.user.id },
            orderBy: [{ priority: 'asc' }, { providerName: 'asc' }]
        });

        successResponse(res, configs, 'Provider configurations retrieved');
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/provider-config/logs
 * Get forwarding logs
 * NOTE: This route MUST be defined before /:id to prevent "logs" being matched as an id
 */
router.get('/logs', authenticate, async (req, res, next) => {
    try {
        const { limit = 50, offset = 0, orderId, requestType } = req.query;

        const where = { userId: req.user.id };
        if (orderId) where.orderId = orderId;
        if (requestType) where.requestType = requestType;

        const [logs, total] = await Promise.all([
            prisma.providerForwardLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: parseInt(limit),
                skip: parseInt(offset)
            }),
            prisma.providerForwardLog.count({ where })
        ]);

        successResponse(res, { logs, total, limit: parseInt(limit), offset: parseInt(offset) });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/provider-config/manual-destination
 * Get the manual service destination config for a panel
 */
router.get('/manual-destination', authenticate, async (req, res, next) => {
    try {
        const config = await prisma.providerConfig.findFirst({
            where: {
                userId: req.user.id,
                providerName: 'MANUAL',
                isActive: true
            }
        });
        successResponse(res, config || null);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/provider-config/manual-destination
 * Create or update the manual service destination config
 */
router.post('/manual-destination', authenticate, async (req, res, next) => {
    try {
        const {
            whatsappNumber, whatsappGroupJid, telegramChatId,
            errorWhatsappNumber, errorGroupJid, errorTelegramChatId
        } = req.body;

        const config = await prisma.providerConfig.upsert({
            where: {
                userId_providerName: { userId: req.user.id, providerName: 'MANUAL' }
            },
            update: {
                whatsappNumber: whatsappNumber || null,
                whatsappGroupJid: whatsappGroupJid || null,
                telegramChatId: telegramChatId || null,
                errorGroupJid: errorGroupJid || null,
                errorChatId: errorTelegramChatId || null,
                isActive: true
            },
            create: {
                userId: req.user.id,
                providerName: 'MANUAL',
                alias: 'Manual Service Destination',
                whatsappNumber: whatsappNumber || null,
                whatsappGroupJid: whatsappGroupJid || null,
                telegramChatId: telegramChatId || null,
                errorGroupJid: errorGroupJid || null,
                errorChatId: errorTelegramChatId || null,
                errorNotifyEnabled: true,
                isActive: true
            }
        });

        successResponse(res, config, 'Manual destination saved');
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/provider-config/:id
 * Get a specific provider configuration
 */
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const config = await prisma.providerConfig.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!config) {
            return res.status(404).json({
                success: false,
                message: 'Provider configuration not found'
            });
        }

        successResponse(res, config, 'Provider configuration retrieved');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/provider-config
 * Create a new provider configuration
 */
router.post('/', authenticate, async (req, res, next) => {
    try {
        const {
            providerName,
            alias,
            providerDomain,
            forwardRefill,
            forwardCancel,
            forwardSpeedup,
            forwardStatus,
            whatsappGroupJid,
            whatsappNumber,
            telegramChatId,
            telegramBotToken,
            errorGroupJid,
            errorChatId,
            errorNotifyEnabled,
            refillTemplate,
            cancelTemplate,
            speedupTemplate,
            errorTemplate,
            priority,
            deviceId,
            isActive
        } = req.body;

        if (!providerName) {
            return res.status(400).json({
                success: false,
                message: 'Provider name is required'
            });
        }

        // Check if already exists
        const existing = await prisma.providerConfig.findUnique({
            where: {
                userId_providerName: { userId: req.user.id, providerName }
            }
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Provider configuration already exists. Use PUT to update.'
            });
        }

        const config = await prisma.providerConfig.create({
            data: {
                userId: req.user.id,
                providerName,
                alias,
                providerDomain,
                forwardRefill: forwardRefill ?? true,
                forwardCancel: forwardCancel ?? true,
                forwardSpeedup: forwardSpeedup ?? true,
                forwardStatus: forwardStatus ?? false,
                whatsappGroupJid,
                whatsappNumber,
                telegramChatId,
                telegramBotToken,
                errorGroupJid,
                errorChatId,
                errorNotifyEnabled: errorNotifyEnabled ?? true,
                refillTemplate,
                cancelTemplate,
                speedupTemplate,
                errorTemplate,
                priority: priority ?? 0,
                deviceId: deviceId || null,
                isActive: isActive ?? true
            }
        });

        successResponse(res, config, 'Provider configuration created', 201);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/provider-config/:id
 * Update a provider configuration
 */
router.put('/:id', authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;

        // Check ownership
        const existing = await prisma.providerConfig.findFirst({
            where: { id, userId: req.user.id }
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Provider configuration not found'
            });
        }

        const updateData = {};
        const allowedFields = [
            'alias', 'providerDomain',
            'forwardRefill', 'forwardCancel', 'forwardSpeedup', 'forwardStatus',
            'whatsappGroupJid', 'whatsappNumber',
            'telegramChatId', 'telegramBotToken',
            'errorGroupJid', 'errorChatId', 'errorNotifyEnabled',
            'refillTemplate', 'cancelTemplate', 'speedupTemplate', 'errorTemplate',
            'priority', 'isActive', 'deviceId'
        ];

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }

        const config = await prisma.providerConfig.update({
            where: { id },
            data: updateData
        });

        successResponse(res, config, 'Provider configuration updated');
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/provider-config/:id
 * Delete a provider configuration
 */
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;

        // Check ownership
        const existing = await prisma.providerConfig.findFirst({
            where: { id, userId: req.user.id }
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Provider configuration not found'
            });
        }

        await prisma.providerConfig.delete({ where: { id } });

        successResponse(res, { id }, 'Provider configuration deleted');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/provider-config/:id/test
 * Test forwarding to a provider configuration
 */
router.post('/:id/test', authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { platform, deviceId } = req.body;

        const config = await prisma.providerConfig.findFirst({
            where: { id, userId: req.user.id }
        });

        if (!config) {
            return res.status(404).json({
                success: false,
                message: 'Provider configuration not found'
            });
        }

        let destination;
        if (platform === 'whatsapp_group') {
            destination = config.whatsappGroupJid;
        } else if (platform === 'whatsapp_number') {
            destination = config.whatsappNumber;
        } else if (platform === 'telegram') {
            destination = config.telegramChatId;
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid platform. Use: whatsapp_group, whatsapp_number, or telegram'
            });
        }

        if (!destination) {
            return res.status(400).json({
                success: false,
                message: `No ${platform} destination configured`
            });
        }

        const result = await providerForwardingService.testForward({
            userId: req.user.id,
            deviceId,
            platform: platform.startsWith('whatsapp') ? 'whatsapp' : 'telegram',
            destination,
            message: `🧪 *Test Message*\n\nThis is a test from DICREWA.\nProvider: ${config.providerName}\nTime: ${new Date().toLocaleString()}`
        });

        successResponse(res, result, result.success ? 'Test message sent' : 'Test failed');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
