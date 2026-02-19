const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { successResponse } = require('../utils/response');

// ==================== ADMIN: MANAGE SYSTEM BOTS ====================

// GET /api/system-bots/admin/list - List all system bots (Admin only)
router.get('/admin/list', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const systemBots = await prisma.device.findMany({
            where: { isSystemBot: true },
            include: {
                user: { select: { id: true, username: true, name: true } },
                panel: { select: { id: true, alias: true } },
                _count: { select: { systemBotSubscriptions: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const formatted = systemBots.map(bot => ({
            ...bot,
            subscriberCount: bot._count.systemBotSubscriptions,
            _count: undefined
        }));

        successResponse(res, formatted, 'System bots retrieved');
    } catch (error) {
        next(error);
    }
});

// POST /api/system-bots/admin/create - Create a system bot (Admin only)
router.post('/admin/create', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const {
            name,
            monthlyPrice = 5.00,
            usageLimit = null,
            maxSubscribers = null,
            panelId = null
        } = req.body;

        if (!name) {
            throw new AppError('Bot name is required', 400);
        }

        // Create the system bot device (owned by admin)
        const device = await prisma.device.create({
            data: {
                name,
                userId: req.user.id,
                isSystemBot: true,
                groupOnly: true, // System bots only work in groups
                systemBotPrice: monthlyPrice,
                usageLimit: usageLimit || null,
                maxSubscribers: maxSubscribers || null,
                panelId: panelId || null,
                status: 'pending'
            }
        });

        // Initialize WhatsApp session (QR will be delivered via Socket.IO)
        const whatsapp = req.app.get('whatsapp');
        await whatsapp.createSession(device.id);

        successResponse(res, device, 'System bot created. Go to device management page and scan the QR code to connect.', 201);
    } catch (error) {
        next(error);
    }
});

// PUT /api/system-bots/admin/:id - Update system bot settings (Admin only)
router.put('/admin/:id', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const { name, monthlyPrice, usageLimit, maxSubscribers, groupOnly, panelId } = req.body;

        const device = await prisma.device.findFirst({
            where: { id: req.params.id, isSystemBot: true }
        });

        if (!device) {
            throw new AppError('System bot not found', 404);
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (monthlyPrice !== undefined) updateData.systemBotPrice = monthlyPrice;
        if (usageLimit !== undefined) updateData.usageLimit = usageLimit || null;
        if (maxSubscribers !== undefined) updateData.maxSubscribers = maxSubscribers || null;
        if (groupOnly !== undefined) updateData.groupOnly = groupOnly;
        if (panelId !== undefined) updateData.panelId = panelId || null;

        const updated = await prisma.device.update({
            where: { id: device.id },
            data: updateData,
            include: {
                _count: { select: { systemBotSubscriptions: true } }
            }
        });

        successResponse(res, updated, 'System bot updated');
    } catch (error) {
        next(error);
    }
});

// DELETE /api/system-bots/admin/:id - Delete system bot (Admin only)
router.delete('/admin/:id', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const device = await prisma.device.findFirst({
            where: { id: req.params.id, isSystemBot: true }
        });

        if (!device) {
            throw new AppError('System bot not found', 404);
        }

        // Cancel all active subscriptions
        await prisma.systemBotSubscription.updateMany({
            where: { deviceId: device.id, status: 'ACTIVE' },
            data: { status: 'CANCELLED' }
        });

        // Disconnect WhatsApp session
        try {
            const whatsapp = req.app.get('whatsapp');
            await whatsapp.deleteSession(device.id);
        } catch (e) {
            console.error('Failed to delete WA session:', e.message);
        }

        await prisma.device.delete({ where: { id: device.id } });

        successResponse(res, { id: device.id }, 'System bot deleted');
    } catch (error) {
        next(error);
    }
});

// GET /api/system-bots/admin/:id/subscribers - List subscribers (Admin only)
router.get('/admin/:id/subscribers', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const subs = await prisma.systemBotSubscription.findMany({
            where: { deviceId: req.params.id },
            include: {
                user: { select: { id: true, username: true, email: true, name: true, creditBalance: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        successResponse(res, subs, 'Subscribers retrieved');
    } catch (error) {
        next(error);
    }
});

// ==================== USER: BROWSE & SUBSCRIBE ====================

// GET /api/system-bots - List available system bots for users
router.get('/', authenticate, async (req, res, next) => {
    try {
        const userId = req.user.id;

        const systemBots = await prisma.device.findMany({
            where: {
                isSystemBot: true,
                status: 'connected' // Only show active/connected bots
            },
            select: {
                id: true,
                name: true,
                phone: true,
                status: true,
                groupOnly: true,
                usageLimit: true,
                systemBotPrice: true,
                maxSubscribers: true,
                createdAt: true,
                _count: {
                    select: {
                        systemBotSubscriptions: {
                            where: { status: 'ACTIVE' }
                        }
                    }
                },
                systemBotSubscriptions: {
                    where: { userId },
                    select: {
                        id: true,
                        status: true,
                        usageCount: true,
                        usageLimit: true,
                        nextBillingDate: true,
                        autoRenew: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const formatted = systemBots.map(bot => ({
            id: bot.id,
            name: bot.name,
            phone: bot.phone,
            status: bot.status,
            groupOnly: bot.groupOnly,
            usageLimit: bot.usageLimit,
            monthlyPrice: bot.systemBotPrice,
            activeSubscribers: bot._count.systemBotSubscriptions,
            maxSubscribers: bot.maxSubscribers,
            isFull: bot.maxSubscribers ? bot._count.systemBotSubscriptions >= bot.maxSubscribers : false,
            mySubscription: bot.systemBotSubscriptions[0] || null,
            isSubscribed: bot.systemBotSubscriptions.length > 0 && bot.systemBotSubscriptions[0].status === 'ACTIVE'
        }));

        successResponse(res, formatted, 'System bots retrieved');
    } catch (error) {
        next(error);
    }
});

// POST /api/system-bots/:id/subscribe - Subscribe to a system bot
router.post('/:id/subscribe', authenticate, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const deviceId = req.params.id;

        // Get the system bot
        const bot = await prisma.device.findFirst({
            where: { id: deviceId, isSystemBot: true, status: 'connected' },
            include: {
                _count: {
                    select: {
                        systemBotSubscriptions: { where: { status: 'ACTIVE' } }
                    }
                }
            }
        });

        if (!bot) {
            throw new AppError('System bot not found or not available', 404);
        }

        // Check if already subscribed
        const existing = await prisma.systemBotSubscription.findUnique({
            where: { userId_deviceId: { userId, deviceId } }
        });

        if (existing && existing.status === 'ACTIVE') {
            throw new AppError('You are already subscribed to this bot', 400);
        }

        // Check max subscribers
        if (bot.maxSubscribers && bot._count.systemBotSubscriptions >= bot.maxSubscribers) {
            throw new AppError('This bot has reached its maximum subscribers', 400);
        }

        const monthlyFee = bot.systemBotPrice || 5.00;

        // Deduct from wallet — all inside transaction to prevent TOCTOU race condition
        const now = new Date();
        const nextBilling = new Date(now);
        nextBilling.setMonth(nextBilling.getMonth() + 1);

        const result = await prisma.$transaction(async (tx) => {
            // Read balance INSIDE transaction for atomicity
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: { creditBalance: true }
            });

            if ((user?.creditBalance || 0) < monthlyFee) {
                throw new AppError(`Insufficient balance. You need $${monthlyFee.toFixed(2)} to subscribe. Current balance: $${(user?.creditBalance || 0).toFixed(2)}`, 400);
            }

            const balanceBefore = user.creditBalance || 0;
            const balanceAfter = balanceBefore - monthlyFee;

            // Deduct balance
            await tx.user.update({
                where: { id: userId },
                data: { creditBalance: { decrement: monthlyFee } }
            });

            // Record transaction with accurate balances
            await tx.creditTransaction.create({
                data: {
                    userId,
                    type: 'DEBIT',
                    amount: monthlyFee,
                    description: `System Bot subscription - ${bot.name}`,
                    balanceBefore,
                    balanceAfter
                }
            });

            // Create or reactivate subscription
            let subscription;
            if (existing) {
                subscription = await tx.systemBotSubscription.update({
                    where: { id: existing.id },
                    data: {
                        status: 'ACTIVE',
                        monthlyFee,
                        startDate: now,
                        nextBillingDate: nextBilling,
                        lastBilledAt: now,
                        usageCount: 0,
                        usageLimit: bot.usageLimit,
                        failedAttempts: 0,
                        lastFailReason: null,
                        autoRenew: true
                    }
                });
            } else {
                subscription = await tx.systemBotSubscription.create({
                    data: {
                        userId,
                        deviceId,
                        status: 'ACTIVE',
                        monthlyFee,
                        startDate: now,
                        nextBillingDate: nextBilling,
                        lastBilledAt: now,
                        usageCount: 0,
                        usageLimit: bot.usageLimit,
                        autoRenew: true
                    }
                });
            }

            return subscription;
        }, {
            isolationLevel: 'Serializable'
        });

        successResponse(res, result, `Subscribed to ${bot.name}! $${monthlyFee.toFixed(2)} charged. Next billing: ${nextBilling.toLocaleDateString()}`, 201);
    } catch (error) {
        next(error);
    }
});

// POST /api/system-bots/:id/unsubscribe - Cancel subscription
router.post('/:id/unsubscribe', authenticate, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const deviceId = req.params.id;

        const sub = await prisma.systemBotSubscription.findUnique({
            where: { userId_deviceId: { userId, deviceId } }
        });

        if (!sub || sub.status !== 'ACTIVE') {
            throw new AppError('No active subscription found', 404);
        }

        const updated = await prisma.systemBotSubscription.update({
            where: { id: sub.id },
            data: {
                status: 'CANCELLED',
                autoRenew: false
            }
        });

        successResponse(res, updated, 'Subscription cancelled. Bot access remains until billing cycle ends.');
    } catch (error) {
        next(error);
    }
});

// POST /api/system-bots/:id/switch-number - Switch to different system bot (same subscription slot)
router.post('/:id/switch-number', authenticate, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const currentDeviceId = req.params.id;
        const { newDeviceId } = req.body;

        if (!newDeviceId) {
            throw new AppError('New device ID is required', 400);
        }

        // Get current subscription
        const currentSub = await prisma.systemBotSubscription.findUnique({
            where: { userId_deviceId: { userId, deviceId: currentDeviceId } }
        });

        if (!currentSub || currentSub.status !== 'ACTIVE') {
            throw new AppError('No active subscription on current bot', 404);
        }

        // Check new bot exists and is available
        const newBot = await prisma.device.findFirst({
            where: { id: newDeviceId, isSystemBot: true, status: 'connected' },
            include: {
                _count: {
                    select: {
                        systemBotSubscriptions: { where: { status: 'ACTIVE' } }
                    }
                }
            }
        });

        if (!newBot) {
            throw new AppError('New system bot not found or not available', 404);
        }

        // Check not already subscribed to new bot
        const existingNew = await prisma.systemBotSubscription.findUnique({
            where: { userId_deviceId: { userId, deviceId: newDeviceId } }
        });

        if (existingNew && existingNew.status === 'ACTIVE') {
            throw new AppError('You already have a subscription on the new bot', 400);
        }

        // Check capacity
        if (newBot.maxSubscribers && newBot._count.systemBotSubscriptions >= newBot.maxSubscribers) {
            throw new AppError('New bot is at maximum capacity', 400);
        }

        // Switch: cancel old, create new with same billing remaining
        await prisma.$transaction(async (tx) => {
            // Cancel old subscription
            await tx.systemBotSubscription.update({
                where: { id: currentSub.id },
                data: { status: 'CANCELLED', autoRenew: false }
            });

            // Create new subscription with remaining time
            let newSubId;
            if (existingNew) {
                const updated = await tx.systemBotSubscription.update({
                    where: { id: existingNew.id },
                    data: {
                        status: 'ACTIVE',
                        monthlyFee: currentSub.monthlyFee,
                        nextBillingDate: currentSub.nextBillingDate, // Keep same billing date
                        usageCount: 0,
                        usageLimit: newBot.usageLimit,
                        autoRenew: true,
                        failedAttempts: 0
                    }
                });
                newSubId = updated.id;
            } else {
                const created = await tx.systemBotSubscription.create({
                    data: {
                        userId,
                        deviceId: newDeviceId,
                        status: 'ACTIVE',
                        monthlyFee: currentSub.monthlyFee,
                        startDate: new Date(),
                        nextBillingDate: currentSub.nextBillingDate, // Keep same billing date
                        lastBilledAt: currentSub.lastBilledAt,
                        usageCount: 0,
                        usageLimit: newBot.usageLimit,
                        autoRenew: true
                    }
                });
                newSubId = created.id;
            }

            // Transfer assigned groups from old subscription to new subscription
            // Reset test status since the new bot needs to be tested in each group
            const oldGroups = await tx.systemBotGroup.findMany({
                where: { subscriptionId: currentSub.id }
            });

            for (const group of oldGroups) {
                // Check if group already exists on new subscription (avoid unique constraint)
                const existingGroup = await tx.systemBotGroup.findUnique({
                    where: { subscriptionId_groupJid: { subscriptionId: newSubId, groupJid: group.groupJid } }
                });

                if (!existingGroup) {
                    await tx.systemBotGroup.create({
                        data: {
                            subscriptionId: newSubId,
                            groupJid: group.groupJid,
                            groupName: group.groupName,
                            isTested: false, // Must re-test with new bot
                            isActive: false
                        }
                    });
                }
            }

            // Delete old groups from cancelled subscription
            await tx.systemBotGroup.deleteMany({
                where: { subscriptionId: currentSub.id }
            });
        });

        successResponse(res, { oldDeviceId: currentDeviceId, newDeviceId },
            `Switched from current bot to ${newBot.name}. No additional charge — billing date unchanged.`);
    } catch (error) {
        next(error);
    }
});

// ==================== GROUP ASSIGNMENT (Section 11) ====================

// POST /api/system-bots/:id/assign-group - Assign a support group to subscription
router.post('/:id/assign-group', authenticate, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const deviceId = req.params.id;
        const { groupJid, groupName } = req.body;

        if (!groupJid || !groupName) {
            throw new AppError('Group JID and name are required', 400);
        }

        // Verify active subscription
        const sub = await prisma.systemBotSubscription.findUnique({
            where: { userId_deviceId: { userId, deviceId } }
        });

        if (!sub || sub.status !== 'ACTIVE') {
            throw new AppError('No active subscription found for this bot', 404);
        }

        // Normalize group JID BEFORE duplicate check
        const normalizedJid = groupJid.includes('@') ? groupJid : `${groupJid}@g.us`;

        // Check if already assigned (using normalized JID)
        const existing = await prisma.systemBotGroup.findUnique({
            where: { subscriptionId_groupJid: { subscriptionId: sub.id, groupJid: normalizedJid } }
        });

        if (existing) {
            throw new AppError('This group is already assigned to this bot', 400);
        }

        const assignment = await prisma.systemBotGroup.create({
            data: {
                subscriptionId: sub.id,
                groupJid: normalizedJid,
                groupName,
                isTested: false,
                isActive: false
            }
        });

        successResponse(res, assignment, 'Group assigned. Please test the bot in this group before activation.', 201);
    } catch (error) {
        next(error);
    }
});

// DELETE /api/system-bots/:id/remove-group/:groupId - Remove a group assignment
router.delete('/:id/remove-group/:groupId', authenticate, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const deviceId = req.params.id;
        const groupId = req.params.groupId;

        // Verify subscription ownership
        const sub = await prisma.systemBotSubscription.findUnique({
            where: { userId_deviceId: { userId, deviceId } }
        });

        if (!sub) {
            throw new AppError('Subscription not found', 404);
        }

        // Verify group belongs to this subscription
        const group = await prisma.systemBotGroup.findFirst({
            where: { id: groupId, subscriptionId: sub.id }
        });

        if (!group) {
            throw new AppError('Group assignment not found', 404);
        }

        await prisma.systemBotGroup.delete({ where: { id: groupId } });

        successResponse(res, { id: groupId }, 'Group removed from bot');
    } catch (error) {
        next(error);
    }
});

// POST /api/system-bots/:id/test-group/:groupId - Test bot in assigned group
router.post('/:id/test-group/:groupId', authenticate, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const deviceId = req.params.id;
        const groupId = req.params.groupId;

        // Verify subscription
        const sub = await prisma.systemBotSubscription.findUnique({
            where: { userId_deviceId: { userId, deviceId } }
        });

        if (!sub || sub.status !== 'ACTIVE') {
            throw new AppError('No active subscription found', 404);
        }

        // Verify group assignment
        const group = await prisma.systemBotGroup.findFirst({
            where: { id: groupId, subscriptionId: sub.id }
        });

        if (!group) {
            throw new AppError('Group assignment not found', 404);
        }

        // Get WhatsApp service
        const whatsappService = req.app.get('whatsapp');
        if (!whatsappService) {
            throw new AppError('WhatsApp service not available', 500);
        }

        // Check bot is connected
        const bot = await prisma.device.findFirst({
            where: { id: deviceId, isSystemBot: true }
        });

        if (!bot || bot.status !== 'connected') {
            throw new AppError('System bot is not connected', 400);
        }

        // Check if bot is in the group by trying to fetch group info
        const socket = whatsappService.getSession(deviceId);
        if (!socket) {
            throw new AppError('Bot session not available', 400);
        }

        // Try to verify bot is in the group
        let botInGroup = false;
        try {
            if (typeof socket.groupFetchAllParticipating === 'function') {
                const groups = await socket.groupFetchAllParticipating();
                botInGroup = !!groups[group.groupJid];
            } else {
                // Fallback: try sending and see if it fails
                botInGroup = true; // Assume yes, test message will confirm
            }
        } catch (e) {
            throw new AppError(`Bot is NOT in this group. Please add the bot (${bot.phone || 'unknown'}) to the group first.`, 400);
        }

        if (!botInGroup) {
            throw new AppError(`Bot is NOT in this group "${group.groupName}". Please add the bot number (${bot.phone || 'unknown'}) to the group first.`, 400);
        }

        // Send test message
        try {
            await whatsappService.sendMessage(deviceId, group.groupJid,
                `✅ *System Bot Test Successful*\n\n` +
                `Bot: ${bot.name}\n` +
                `Group: ${group.groupName}\n` +
                `Time: ${new Date().toLocaleString()}\n\n` +
                `_This bot is now active in this group. It will respond to commands like /status, /refill, /cancel._`
            );
        } catch (sendErr) {
            throw new AppError(`Failed to send test message. Bot may not be in this group. Please add ${bot.phone || 'the bot number'} to the group first.`, 400);
        }

        // Mark as tested and active
        const updated = await prisma.systemBotGroup.update({
            where: { id: groupId },
            data: {
                isTested: true,
                testedAt: new Date(),
                isActive: true
            }
        });

        successResponse(res, updated, `Test successful! Bot is active in "${group.groupName}".`);
    } catch (error) {
        next(error);
    }
});

// GET /api/system-bots/my-subscriptions - List user's active subscriptions
// NOTE: This MUST be BEFORE /:id/* routes to prevent Express treating "my-subscriptions" as an :id param
router.get('/my-subscriptions', authenticate, async (req, res, next) => {
    try {
        const subs = await prisma.systemBotSubscription.findMany({
            where: { userId: req.user.id },
            include: {
                device: {
                    select: { id: true, name: true, phone: true, status: true, usageLimit: true }
                },
                assignedGroups: {
                    orderBy: { createdAt: 'desc' }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        successResponse(res, subs, 'Subscriptions retrieved');
    } catch (error) {
        next(error);
    }
});

// GET /api/system-bots/:id/groups - Get groups assigned to a subscription
router.get('/:id/groups', authenticate, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const deviceId = req.params.id;

        const sub = await prisma.systemBotSubscription.findUnique({
            where: { userId_deviceId: { userId, deviceId } }
        });

        if (!sub) {
            throw new AppError('Subscription not found', 404);
        }

        const groups = await prisma.systemBotGroup.findMany({
            where: { subscriptionId: sub.id },
            orderBy: { createdAt: 'desc' }
        });

        successResponse(res, groups, 'Groups retrieved');
    } catch (error) {
        next(error);
    }
});

// ==================== SUBSCRIPTION RENEWAL (for scheduler) ====================

// Process auto-renewal for system bot subscriptions
async function processSystemBotRenewals() {
    const now = new Date();

    const dueSubs = await prisma.systemBotSubscription.findMany({
        where: {
            status: 'ACTIVE',
            autoRenew: true,
            nextBillingDate: { lte: now }
        },
        include: {
            user: { select: { id: true, creditBalance: true, username: true } },
            device: { select: { id: true, name: true, systemBotPrice: true } }
        }
    });

    const results = { processed: 0, success: 0, failed: 0, details: [] };

    for (const sub of dueSubs) {
        results.processed++;
        const fee = sub.monthlyFee || sub.device.systemBotPrice || 5.00;

        try {
            const nextBilling = new Date(now);
            nextBilling.setMonth(nextBilling.getMonth() + 1);

            const renewed = await prisma.$transaction(async (tx) => {
                // Read fresh balance INSIDE transaction to prevent TOCTOU
                const freshUser = await tx.user.findUnique({
                    where: { id: sub.userId },
                    select: { creditBalance: true }
                });

                const currentBalance = freshUser?.creditBalance || 0;

                if (currentBalance < fee) {
                    // Insufficient balance — return false to handle outside
                    return { success: false, balance: currentBalance };
                }

                // Deduct balance
                await tx.user.update({
                    where: { id: sub.userId },
                    data: { creditBalance: { decrement: fee } }
                });

                // Log transaction with accurate balance values
                await tx.creditTransaction.create({
                    data: {
                        userId: sub.userId,
                        type: 'DEBIT',
                        amount: fee,
                        description: `System Bot renewal - ${sub.device.name}`,
                        balanceBefore: currentBalance,
                        balanceAfter: currentBalance - fee
                    }
                });

                // Update subscription
                await tx.systemBotSubscription.update({
                    where: { id: sub.id },
                    data: {
                        nextBillingDate: nextBilling,
                        lastBilledAt: now,
                        usageCount: 0,
                        failedAttempts: 0
                    }
                });

                return { success: true };
            });

            if (renewed.success) {
                results.success++;
                results.details.push({ userId: sub.userId, deviceId: sub.deviceId, success: true });
            } else {
                // Insufficient balance (detected inside transaction)
                results.failed++;
                const failedAttempts = sub.failedAttempts + 1;

                const updateData = {
                    failedAttempts,
                    lastFailReason: 'Insufficient balance'
                };

                if (failedAttempts >= 3) {
                    const graceEnd = new Date(now);
                    graceEnd.setDate(graceEnd.getDate() + (sub.gracePeriodDays || 3));
                    updateData.status = 'SUSPENDED';
                    updateData.expiresAt = graceEnd;
                }

                await prisma.systemBotSubscription.update({
                    where: { id: sub.id },
                    data: updateData
                });

                results.details.push({
                    userId: sub.userId,
                    deviceId: sub.deviceId,
                    success: false,
                    reason: `Insufficient balance ($${(renewed.balance || 0).toFixed(2)} < $${fee.toFixed(2)})`,
                    suspended: failedAttempts >= 3
                });
            }
        } catch (err) {
            results.failed++;
            results.details.push({ userId: sub.userId, deviceId: sub.deviceId, success: false, reason: err.message });
        }
    }

    // Expire suspended subscriptions past grace period
    await prisma.systemBotSubscription.updateMany({
        where: {
            status: 'SUSPENDED',
            expiresAt: { lte: now }
        },
        data: { status: 'EXPIRED' }
    });

    return results;
}

module.exports = router;
module.exports.processSystemBotRenewals = processSystemBotRenewals;
