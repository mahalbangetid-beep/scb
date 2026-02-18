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

// NOTE: GET /:key and PUT /:key routes have been moved to the END of this file
// because Express matches routes in order, and /:key would match all named routes
// like /stats/dashboard, /bot-security, /bot-toggles, etc.

// GET /api/settings/stats/dashboard - Enhanced Dashboard statistics
router.get('/stats/dashboard', authenticate, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        const sevenDaysAgo = new Date(startOfToday);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const [
            totalMessages,
            messagesToday,
            messagesYesterday,
            sentToday,
            receivedToday,
            activeDevices,
            totalDevices,
            successfulMessages,
            failedMessages,
            failedYesterday,
            failedToday,
            autoReplyTriggers,
            webhookCalls,
            userCredit,
            weeklyMessages,
            recentBotActivity
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

            // Sent today (outgoing)
            prisma.message.count({
                where: {
                    device: { userId },
                    type: 'outgoing',
                    createdAt: { gte: startOfToday }
                }
            }),

            // Received today (incoming)
            prisma.message.count({
                where: {
                    device: { userId },
                    type: 'incoming',
                    createdAt: { gte: startOfToday }
                }
            }),

            // Active devices
            prisma.device.count({
                where: { userId, status: 'connected' }
            }),

            // Total devices
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

            // Failed today
            prisma.message.count({
                where: {
                    device: { userId },
                    status: 'failed',
                    createdAt: { gte: startOfToday }
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
            }),

            // User credit balance
            prisma.user.findUnique({
                where: { id: userId },
                select: { creditBalance: true }
            }),

            // Weekly messages (last 7 days) — aggregated in DB, not in JS
            prisma.$queryRaw`
                SELECT 
                    DATE("createdAt") as date,
                    COUNT(*) FILTER (WHERE "type" = 'outgoing') as sent,
                    COUNT(*) FILTER (WHERE "type" = 'incoming') as received,
                    COUNT(*) FILTER (WHERE "status" = 'failed') as failed,
                    COUNT(*) as total
                FROM "Message"
                WHERE "deviceId" IN (SELECT "id" FROM "Device" WHERE "userId" = ${userId})
                AND "createdAt" >= ${sevenDaysAgo}
                GROUP BY DATE("createdAt")
                ORDER BY date ASC
            `,

            // Recent bot activity (order commands)
            prisma.orderCommand.findMany({
                where: { order: { userId } },
                take: 10,
                orderBy: { createdAt: 'desc' },
                include: {
                    order: {
                        select: {
                            externalOrderId: true,
                            providerName: true,
                            panel: { select: { alias: true } }
                        }
                    }
                }
            })
        ]);

        // Calculate changes
        const messagesChange = messagesYesterday === 0 ? (messagesToday > 0 ? 100 : 0) : ((messagesToday - messagesYesterday) / messagesYesterday * 100);
        const completedMessages = successfulMessages + failedMessages;
        const successRate = completedMessages === 0 ? 100 : (successfulMessages / completedMessages * 100);
        const failedChange = failedYesterday === 0 ? (failedToday > 0 ? 100 : 0) : ((failedToday - failedYesterday) / failedYesterday * 100);

        // Build weekly chart data from aggregated results
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weeklyChart = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date(startOfToday);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            // Find aggregated data for this day (weeklyMessages is now DB-grouped)
            const dayData = weeklyMessages.find(row => {
                const rowDate = new Date(row.date).toISOString().split('T')[0];
                return rowDate === dateStr;
            });

            weeklyChart.push({
                day: dayNames[date.getDay()],
                date: dateStr,
                sent: Number(dayData?.sent || 0),
                received: Number(dayData?.received || 0),
                failed: Number(dayData?.failed || 0),
                total: Number(dayData?.total || 0)
            });
        }

        // Format recent bot activity
        const botActivity = recentBotActivity.map(cmd => ({
            id: cmd.id,
            command: cmd.command,
            status: cmd.status,
            orderId: cmd.order?.externalOrderId || 'N/A',
            panelName: cmd.order?.panel?.alias || 'Unknown',
            providerAlias: cmd.order?.providerName || 'Direct',
            sentTo: cmd.targetGroup || cmd.targetNumber || 'N/A',
            createdAt: cmd.createdAt
        }));

        const stats = {
            totalMessages,
            messagesChange: Math.round(messagesChange),
            activeDevices,
            totalDevices,
            offlineDevices: totalDevices - activeDevices,
            successRate: Math.round(successRate * 10) / 10,
            successRateChange: 0,
            failedMessages,
            failedChange: Math.round(failedChange),
            messagesToday,
            sentToday,
            receivedToday,
            successfulMessages,
            creditBalance: userCredit?.creditBalance || 0,
            autoReplyTriggers: autoReplyTriggers._sum?.triggerCount ?? 0,
            webhookCalls,
            weeklyChart,
            botActivity
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


// ==================== BINANCE PAYMENT CONFIG ====================

const binancePayService = require('../services/paymentGateway/binancePay');

// GET /api/settings/binance - Get Binance payment config
router.get('/binance', authenticate, async (req, res, next) => {
    try {
        const config = await binancePayService.getUserConfig(req.user.id);
        successResponse(res, config, 'Binance configuration retrieved');
    } catch (error) {
        next(error);
    }
});

// PUT /api/settings/binance - Update Binance payment config
router.put('/binance', authenticate, async (req, res, next) => {
    try {
        const result = await binancePayService.saveUserConfig(req.user.id, req.body);
        successResponse(res, result.config, result.message);
    } catch (error) {
        next(error);
    }
});

// ==================== BOT FEATURE TOGGLES ====================

// GET /api/settings/bot-toggles - Get bot feature toggles
router.get('/bot-toggles', authenticate, async (req, res, next) => {
    try {
        const botFeatureService = require('../services/botFeatureService');
        const toggles = await botFeatureService.getToggles(req.user.id);

        successResponse(res, toggles, 'Bot feature toggles retrieved');
    } catch (error) {
        next(error);
    }
});

// PUT /api/settings/bot-toggles - Update bot feature toggles
router.put('/bot-toggles', authenticate, async (req, res, next) => {
    try {
        const botFeatureService = require('../services/botFeatureService');
        const { replyToAllMessages, fallbackMessage, ...otherToggles } = req.body;

        // Prepare update data
        const updateData = {};

        if (replyToAllMessages !== undefined) {
            updateData.replyToAllMessages = !!replyToAllMessages;
        }

        if (fallbackMessage !== undefined) {
            updateData.fallbackMessage = fallbackMessage || null;
        }

        const booleanFields = [
            'autoHandleFailedOrders', 'allowForceCompleted',
            'allowLinkUpdateViaBot', 'allowPaymentVerification', 'allowAccountDetailsViaBot',
            'allowTicketAutoReply', 'allowRefillCommand', 'allowCancelCommand',
            'allowSpeedUpCommand', 'allowStatusCommand', 'processingSpeedUpEnabled',
            'processingCancelEnabled', 'autoForwardProcessingCancel', 'showProviderInResponse', 'showDetailedStatus',
            'callAutoReplyEnabled', 'spamProtectionEnabled'
        ];
        const stringFields = [
            'failedOrderAction', 'providerSpeedUpTemplate', 'providerRefillTemplate', 'providerCancelTemplate',
            'callReplyMessage', 'groupCallReplyMessage', 'repeatedCallReplyMessage',
            'spamWarningMessage'
        ];
        const numericFields = [
            'bulkResponseThreshold', 'maxBulkOrders',
            'repeatedCallThreshold', 'repeatedCallWindowMinutes',
            'spamRepeatThreshold', 'spamTimeWindowMinutes', 'spamDisableDurationMin'
        ];

        for (const field of booleanFields) {
            if (otherToggles[field] !== undefined) {
                updateData[field] = Boolean(otherToggles[field]);
            }
        }
        for (const field of stringFields) {
            if (otherToggles[field] !== undefined) {
                updateData[field] = String(otherToggles[field]);
            }
        }
        for (const field of numericFields) {
            if (otherToggles[field] !== undefined) {
                const val = parseInt(otherToggles[field], 10);
                if (!isNaN(val)) updateData[field] = val;
            }
        }

        // Use service method (handles composite key correctly)
        const toggles = await botFeatureService.updateToggles(req.user.id, updateData);

        successResponse(res, toggles, 'Bot feature toggles updated');
    } catch (error) {
        next(error);
    }
});

// ==================== WILDCARD ROUTES (MUST BE LAST) ====================
// These routes use /:key which would match any path
// They MUST be defined after all specific named routes

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

// ==================== STAFF OVERRIDE GROUP (Section 5) ====================
// IMPORTANT: These MUST be before /:key wildcard routes below!

// GET /api/settings/staff-override-groups - Get staff override group config
router.get('/staff-override-groups', authenticate, async (req, res, next) => {
    try {
        const securityService = require('../services/securityService');
        const config = await securityService.getStaffOverrideConfig(req.user.id);
        successResponse(res, config, 'Staff override groups retrieved');
    } catch (error) {
        next(error);
    }
});

// PUT /api/settings/staff-override-groups - Update staff override group config
router.put('/staff-override-groups', authenticate, async (req, res, next) => {
    try {
        const securityService = require('../services/securityService');
        const { enabled, groups } = req.body;
        const updated = await securityService.updateStaffOverrideConfig(req.user.id, { enabled, groups });
        successResponse(res, {
            enabled: updated.staffOverrideEnabled,
            groups: updated.staffOverrideGroups || []
        }, 'Staff override groups updated');
    } catch (error) {
        next(error);
    }
});

// POST /api/settings/staff-override-groups/add - Add a group JID
router.post('/staff-override-groups/add', authenticate, async (req, res, next) => {
    try {
        const securityService = require('../services/securityService');
        const { groupJid } = req.body;
        if (!groupJid || typeof groupJid !== 'string') {
            throw new AppError('groupJid is required', 400);
        }
        const groups = await securityService.addStaffOverrideGroup(req.user.id, groupJid.trim());
        successResponse(res, { groups }, 'Staff override group added');
    } catch (error) {
        next(error);
    }
});

// DELETE /api/settings/staff-override-groups/:groupJid - Remove a group JID
router.delete('/staff-override-groups/:groupJid', authenticate, async (req, res, next) => {
    try {
        const securityService = require('../services/securityService');
        const groupJid = decodeURIComponent(req.params.groupJid);
        if (!groupJid) {
            throw new AppError('groupJid is required', 400);
        }
        const groups = await securityService.removeStaffOverrideGroup(req.user.id, groupJid);
        successResponse(res, { groups }, 'Staff override group removed');
    } catch (error) {
        next(error);
    }
});

// GET /api/settings/:key - Get specific setting (MUST BE AFTER NAMED ROUTES)
router.get('/:key', authenticate, async (req, res, next) => {
    try {
        const key = req.params.key;
        if (!key || !/^[a-zA-Z0-9_\-.]{1,100}$/.test(key)) {
            throw new AppError('Invalid setting key format', 400);
        }

        const setting = await prisma.setting.findUnique({
            where: {
                key_userId: {
                    key,
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

// PUT /api/settings/:key - Update or create specific setting (MUST BE AFTER NAMED ROUTES)
router.put('/:key', authenticate, async (req, res, next) => {
    try {
        const key = req.params.key;
        if (!key || !/^[a-zA-Z0-9_\-.]{1,100}$/.test(key)) {
            throw new AppError('Invalid setting key format', 400);
        }

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

module.exports = router;
