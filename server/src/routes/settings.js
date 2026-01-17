const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const { successResponse } = require('../utils/response');

// GET /api/settings - Get all settings for user
router.get('/', authenticate, async (req, res, next) => {
    try {
        const settings = await prisma.setting.findMany({
            where: { userId: req.user.id }
        });

        // Convert array to object
        const formatted = settings.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {});

        successResponse(res, formatted);
    } catch (error) {
        next(error);
    }
});

// GET /api/settings/:key - Get specific setting
router.get('/:key', authenticate, async (req, res, next) => {
    try {
        const setting = await prisma.setting.findUnique({
            where: {
                key_userId: {
                    key: req.params.key,
                    userId: req.user.id
                }
            }
        });

        if (!setting) {
            return successResponse(res, null);
        }

        successResponse(res, setting.value);
    } catch (error) {
        next(error);
    }
});

// POST /api/settings - Update or create multiple settings
router.post('/', authenticate, async (req, res, next) => {
    try {
        const settings = req.body; // Expecting { key: value, ... }

        const operations = Object.entries(settings).map(([key, value]) => {
            return prisma.setting.upsert({
                where: {
                    key_userId: {
                        key,
                        userId: req.user.id
                    }
                },
                update: { value },
                create: {
                    key,
                    value,
                    userId: req.user.id
                }
            });
        });

        await Promise.all(operations);

        successResponse(res, null, 'Settings updated');
    } catch (error) {
        next(error);
    }
});

// PUT /api/settings/:key - Update or create specific setting
router.put('/:key', authenticate, async (req, res, next) => {
    try {
        const { value } = req.body;

        const setting = await prisma.setting.upsert({
            where: {
                key_userId: {
                    key: req.params.key,
                    userId: req.user.id
                }
            },
            update: { value },
            create: {
                key: req.params.key,
                value,
                userId: req.user.id
            }
        });

        successResponse(res, setting.value, 'Setting updated');
    } catch (error) {
        next(error);
    }
});

// GET /api/settings/stats/dashboard - Dashboard statistics
router.get('/stats/dashboard', authenticate, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);

        const [
            totalMessages,
            messagesToday,
            messagesYesterday,
            activeDevices,
            devicesYesterday,
            successfulMessages,
            failedMessages,
            failedYesterday,
            autoReplyTriggers,
            webhookCalls
        ] = await Promise.all([
            // Total messages
            prisma.message.count({ where: { device: { userId } } }),

            // Messages today
            prisma.message.count({
                where: {
                    device: { userId },
                    createdAt: { gte: startOfToday }
                }
            }),

            // Messages yesterday
            prisma.message.count({
                where: {
                    device: { userId },
                    createdAt: { gte: startOfYesterday, lt: startOfToday }
                }
            }),

            // Active devices
            prisma.device.count({
                where: { userId, status: 'connected' }
            }),

            // Total devices (as proxy for device change if we don't track connection history)
            // For now let's just use connected devices today vs total
            prisma.device.count({
                where: { userId }
            }),

            // Successful messages
            prisma.message.count({
                where: {
                    device: { userId },
                    status: { in: ['sent', 'delivered', 'read'] }
                }
            }),

            // Failed messages
            prisma.message.count({
                where: {
                    device: { userId },
                    status: 'failed'
                }
            }),

            // Failed yesterday
            prisma.message.count({
                where: {
                    device: { userId },
                    status: 'failed',
                    createdAt: { gte: startOfYesterday, lt: startOfToday }
                }
            }),

            // Total AutoReply triggers
            prisma.autoReplyRule.aggregate({
                where: { userId },
                _sum: { triggerCount: true }
            }),

            // Webhook calls today
            prisma.webhookLog.count({
                where: {
                    webhook: { userId },
                    createdAt: { gte: startOfToday }
                }
            })
        ]);

        // Calculate changes
        const messagesChange = messagesYesterday === 0 ? (messagesToday > 0 ? 100 : 0) : ((messagesToday - messagesYesterday) / messagesYesterday * 100);
        const successRate = totalMessages === 0 ? 100 : (successfulMessages / totalMessages * 100);
        const failedChange = failedYesterday === 0 ? (failedMessages > 0 ? 100 : 0) : ((failedMessages - failedYesterday) / failedYesterday * 100);

        const stats = {
            totalMessages,
            messagesChange: Math.round(messagesChange),
            activeDevices,
            devicesChange: activeDevices, // Just show current count as change if no history
            successRate: Math.round(successRate * 10) / 10,
            successRateChange: 0, // Hard to calculate without snapshots
            failedMessages,
            failedChange: Math.round(failedChange),
            messagesToday,
            autoReplyTriggers: autoReplyTriggers._sum.triggerCount || 0,
            webhookCalls
        };
        successResponse(res, stats);
    } catch (error) {
        next(error);
    }
});

// ==================== BOT SECURITY SETTINGS ====================

const securityService = require('../services/securityService');

// GET /api/settings/bot-security - Get bot security settings
router.get('/bot-security', authenticate, async (req, res, next) => {
    try {
        const settings = await securityService.getUserSettings(req.user.id);

        successResponse(res, {
            orderClaimMode: settings.orderClaimMode,
            groupSecurityMode: settings.groupSecurityMode,
            usernameValidationMode: settings.usernameValidationMode,
            maxCommandsPerMinute: settings.maxCommandsPerMinute,
            commandCooldownSecs: settings.commandCooldownSecs,
            showProviderInResponse: settings.showProviderInResponse,
            showDetailedStatus: settings.showDetailedStatus,
            privateReplyInGroups: settings.privateReplyInGroups,
            // Action modes
            refillActionMode: settings.refillActionMode,
            cancelActionMode: settings.cancelActionMode,
            speedupActionMode: settings.speedupActionMode,
            statusResponseMode: settings.statusResponseMode
        }, 'Bot security settings retrieved');
    } catch (error) {
        next(error);
    }
});

// PUT /api/settings/bot-security - Update bot security settings
router.put('/bot-security', authenticate, async (req, res, next) => {
    try {
        const {
            orderClaimMode,
            groupSecurityMode,
            usernameValidationMode,
            maxCommandsPerMinute,
            commandCooldownSecs,
            showProviderInResponse,
            showDetailedStatus,
            privateReplyInGroups,
            // Action modes
            refillActionMode,
            cancelActionMode,
            speedupActionMode,
            statusResponseMode
        } = req.body;

        // Validate values
        const validClaimModes = ['disabled', 'auto', 'email'];
        const validGroupModes = ['none', 'verified', 'disabled'];
        const validUsernameModes = ['disabled', 'ask', 'strict'];
        const validActionModes = ['forward', 'auto', 'both', 'disabled'];
        const validStatusModes = ['standard', 'detailed', 'minimal'];

        if (orderClaimMode && !validClaimModes.includes(orderClaimMode)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid orderClaimMode. Valid values: disabled, auto, email'
            });
        }

        if (groupSecurityMode && !validGroupModes.includes(groupSecurityMode)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid groupSecurityMode. Valid values: none, verified, disabled'
            });
        }

        if (usernameValidationMode && !validUsernameModes.includes(usernameValidationMode)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid usernameValidationMode. Valid values: disabled, ask, strict'
            });
        }

        // Build update object with only provided fields
        const updates = {};
        if (orderClaimMode !== undefined) updates.orderClaimMode = orderClaimMode;
        if (groupSecurityMode !== undefined) updates.groupSecurityMode = groupSecurityMode;
        if (usernameValidationMode !== undefined) updates.usernameValidationMode = usernameValidationMode;
        if (maxCommandsPerMinute !== undefined) updates.maxCommandsPerMinute = Math.max(1, Math.min(60, maxCommandsPerMinute));
        if (commandCooldownSecs !== undefined) updates.commandCooldownSecs = Math.max(0, Math.min(3600, commandCooldownSecs));
        if (showProviderInResponse !== undefined) updates.showProviderInResponse = !!showProviderInResponse;
        if (showDetailedStatus !== undefined) updates.showDetailedStatus = !!showDetailedStatus;
        if (privateReplyInGroups !== undefined) updates.privateReplyInGroups = !!privateReplyInGroups;

        // Action modes validation and update
        if (refillActionMode !== undefined) {
            if (!validActionModes.includes(refillActionMode)) {
                return res.status(400).json({ success: false, message: 'Invalid refillActionMode. Valid: forward, auto, both, disabled' });
            }
            updates.refillActionMode = refillActionMode;
        }
        if (cancelActionMode !== undefined) {
            if (!validActionModes.includes(cancelActionMode)) {
                return res.status(400).json({ success: false, message: 'Invalid cancelActionMode. Valid: forward, auto, both, disabled' });
            }
            updates.cancelActionMode = cancelActionMode;
        }
        if (speedupActionMode !== undefined) {
            if (!validActionModes.includes(speedupActionMode)) {
                return res.status(400).json({ success: false, message: 'Invalid speedupActionMode. Valid: forward, auto, both, disabled' });
            }
            updates.speedupActionMode = speedupActionMode;
        }
        if (statusResponseMode !== undefined) {
            if (!validStatusModes.includes(statusResponseMode)) {
                return res.status(400).json({ success: false, message: 'Invalid statusResponseMode. Valid: standard, detailed, minimal' });
            }
            updates.statusResponseMode = statusResponseMode;
        }

        const settings = await securityService.updateUserSettings(req.user.id, updates);

        successResponse(res, {
            orderClaimMode: settings.orderClaimMode,
            groupSecurityMode: settings.groupSecurityMode,
            usernameValidationMode: settings.usernameValidationMode,
            maxCommandsPerMinute: settings.maxCommandsPerMinute,
            commandCooldownSecs: settings.commandCooldownSecs,
            showProviderInResponse: settings.showProviderInResponse,
            showDetailedStatus: settings.showDetailedStatus,
            privateReplyInGroups: settings.privateReplyInGroups,
            // Action modes
            refillActionMode: settings.refillActionMode,
            cancelActionMode: settings.cancelActionMode,
            speedupActionMode: settings.speedupActionMode,
            statusResponseMode: settings.statusResponseMode
        }, 'Bot security settings updated');
    } catch (error) {
        next(error);
    }
});


// POST /api/settings/cleanup-cooldowns - Manual cooldown cleanup
router.post('/cleanup-cooldowns', authenticate, async (req, res, next) => {
    try {
        const count = await securityService.cleanupExpiredCooldowns();

        successResponse(res, { cleaned: count }, `Cleaned ${count} expired cooldowns`);
    } catch (error) {
        next(error);
    }
});


// ==================== BOT FEATURE TOGGLES ====================

// GET /api/settings/bot-toggles - Get bot feature toggles
router.get('/bot-toggles', authenticate, async (req, res, next) => {
    try {
        let toggles = await prisma.botFeatureToggles.findUnique({
            where: { userId: req.user.id }
        });

        // Create default if not exists
        if (!toggles) {
            toggles = await prisma.botFeatureToggles.create({
                data: { userId: req.user.id }
            });
        }

        successResponse(res, toggles, 'Bot feature toggles retrieved');
    } catch (error) {
        next(error);
    }
});

// PUT /api/settings/bot-toggles - Update bot feature toggles
router.put('/bot-toggles', authenticate, async (req, res, next) => {
    try {
        const { replyToAllMessages, fallbackMessage, ...otherToggles } = req.body;

        // Prepare update data
        const updateData = {};

        if (replyToAllMessages !== undefined) {
            updateData.replyToAllMessages = !!replyToAllMessages;
        }

        if (fallbackMessage !== undefined) {
            updateData.fallbackMessage = fallbackMessage || null;
        }

        // Handle other toggles dynamically
        const allowedFields = [
            'autoHandleFailedOrders', 'failedOrderAction', 'allowForceCompleted',
            'allowLinkUpdateViaBot', 'allowPaymentVerification', 'allowAccountDetailsViaBot',
            'allowTicketAutoReply', 'allowRefillCommand', 'allowCancelCommand',
            'allowSpeedUpCommand', 'allowStatusCommand', 'processingSpeedUpEnabled',
            'processingCancelEnabled', 'autoForwardProcessingCancel',
            'providerSpeedUpTemplate', 'providerRefillTemplate', 'providerCancelTemplate',
            'bulkResponseThreshold', 'maxBulkOrders', 'showProviderInResponse', 'showDetailedStatus'
        ];

        for (const field of allowedFields) {
            if (otherToggles[field] !== undefined) {
                updateData[field] = otherToggles[field];
            }
        }

        // Upsert toggles
        const toggles = await prisma.botFeatureToggles.upsert({
            where: { userId: req.user.id },
            update: updateData,
            create: { userId: req.user.id, ...updateData }
        });

        successResponse(res, toggles, 'Bot feature toggles updated');
    } catch (error) {
        next(error);
    }
});


module.exports = router;
