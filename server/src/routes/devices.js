const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate, getEffectiveUserId } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { successResponse, paginatedResponse, parsePagination } = require('../utils/response');
const resourceSubscriptionHook = require('../services/resourceSubscriptionHook');

// GET /api/devices - List all devices for current user
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const effectiveUserId = await getEffectiveUserId(req);

        const [devices, total, messageStats] = await Promise.all([
            prisma.device.findMany({
                where: { userId: effectiveUserId },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    panel: {
                        select: {
                            id: true,
                            name: true,
                            alias: true,
                            url: true
                        }
                    },
                    panelBindings: {
                        include: {
                            panel: {
                                select: {
                                    id: true,
                                    name: true,
                                    alias: true
                                }
                            }
                        }
                    }
                }
            }),
            prisma.device.count({
                where: { userId: effectiveUserId }
            }),
            prisma.message.groupBy({
                by: ['deviceId', 'type'],
                where: { device: { userId: effectiveUserId } },
                _count: true
            })
        ]);

        // Map database status to UI format and include message counts + panel info
        const formattedDevices = devices.map(device => {
            const sent = messageStats.find(s => s.deviceId === device.id && s.type === 'outgoing')?._count || 0;
            const received = messageStats.find(s => s.deviceId === device.id && s.type === 'incoming')?._count || 0;

            return {
                id: device.id,
                name: device.name,
                phone: device.phone,
                status: device.status,
                isActive: device.isActive,
                replyScope: device.replyScope || 'all',
                forwardOnly: device.forwardOnly || false,
                panelId: device.panelId,
                panel: device.panel,
                panels: (device.panelBindings || []).map(b => b.panel),
                lastActive: device.lastActive,
                messagesSent: sent,
                messagesReceived: received,
                createdAt: device.createdAt
            };
        });

        paginatedResponse(res, formattedDevices, {
            page,
            limit,
            total
        });
    } catch (error) {
        next(error);
    }
});


// GET /api/devices/slot-pricing - Check pricing for next device slot
// MUST be defined BEFORE /:id to avoid Express matching 'slot-pricing' as a param
router.get('/slot-pricing', authenticate, async (req, res, next) => {
    try {
        const effectiveUserId = await getEffectiveUserId(req);
        const preCheck = await resourceSubscriptionHook.beforeResourceCreate(effectiveUserId, 'DEVICE');
        const deviceCount = await prisma.device.count({ where: { userId: effectiveUserId } });

        successResponse(res, {
            isFree: preCheck.isFree,
            fee: preCheck.isFree ? 0 : preCheck.requiredBalance,
            canAfford: preCheck.canCreate,
            currentBalance: preCheck.currentBalance || 0,
            currentDevices: deviceCount,
            freeSlots: 1,
            message: preCheck.message
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/devices/:id - Get device by ID
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const effectiveUserId = await getEffectiveUserId(req);
        const device = await prisma.device.findFirst({
            where: {
                id: req.params.id,
                userId: effectiveUserId
            }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        successResponse(res, device);
    } catch (error) {
        next(error);
    }
});

// POST /api/devices - Add new device
router.post('/', authenticate, async (req, res, next) => {
    try {
        const { name, panelId } = req.body;

        if (!name) {
            throw new AppError('Device name is required', 400);
        }

        const effectiveUserId = await getEffectiveUserId(req);

        // Validate panelId if provided
        if (panelId) {
            const panel = await prisma.smmPanel.findFirst({
                where: {
                    id: panelId,
                    userId: effectiveUserId
                }
            });
            if (!panel) {
                throw new AppError('Panel not found or does not belong to you', 400);
            }
        }

        // ── CHECK DEVICE SLOT PRICING ──
        // First device is free, subsequent devices cost $10/month
        const preCheck = await resourceSubscriptionHook.beforeResourceCreate(effectiveUserId, 'DEVICE');

        if (!preCheck.canCreate) {
            throw new AppError(preCheck.message || 'Insufficient balance to add a new device', 402);
        }

        // If NOT free, deduct upfront payment BEFORE creating device
        let upfrontCharge = null;
        if (!preCheck.isFree) {
            const fee = preCheck.requiredBalance;

            // Atomic deduction
            upfrontCharge = await prisma.$transaction(async (tx) => {
                const user = await tx.user.findUnique({
                    where: { id: effectiveUserId },
                    select: { creditBalance: true }
                });

                const balanceBefore = user?.creditBalance || 0;
                if (balanceBefore < fee) {
                    throw new Error(`Insufficient balance. Required: $${fee.toFixed(2)}, Available: $${balanceBefore.toFixed(2)}`);
                }

                const balanceAfter = balanceBefore - fee;

                await tx.user.update({
                    where: { id: effectiveUserId },
                    data: { creditBalance: balanceAfter }
                });

                await tx.creditTransaction.create({
                    data: {
                        userId: effectiveUserId,
                        type: 'DEBIT',
                        amount: fee,
                        balanceBefore,
                        balanceAfter,
                        description: `WhatsApp device slot: ${name}`,
                        reference: `DEVICE_SLOT_${Date.now()}`
                    }
                });

                return { fee, balanceBefore, balanceAfter };
            }, { isolationLevel: 'Serializable' });

            // Update sidebar credit display
            try {
                const io = req.app.get('io');
                if (io) io.to(effectiveUserId).emit('balance-updated');
            } catch { /* ignore */ }
        }

        // Create in database with optional panel binding
        const device = await prisma.device.create({
            data: {
                name,
                userId: effectiveUserId,
                panelId: panelId || null,
                status: 'pending'
            },
            include: {
                panel: {
                    select: {
                        id: true,
                        name: true,
                        alias: true
                    }
                }
            }
        });

        // Initialize WhatsApp session and get QR
        const whatsapp = req.app.get('whatsapp');
        const session = await whatsapp.createSession(device.id);

        // Auto-create subscription (for monthly renewal tracking)
        let subscriptionInfo = null;
        try {
            subscriptionInfo = await resourceSubscriptionHook.onResourceCreated(
                effectiveUserId, 'DEVICE', device.id, device.name
            );
        } catch (hookErr) {
            console.error('[Devices] Subscription hook error:', hookErr.message);
        }

        const message = preCheck.isFree
            ? 'Your first device is free! Scan QR to connect.'
            : `Device slot purchased for $${upfrontCharge?.fee?.toFixed(2)}/month. Scan QR to connect.`;

        successResponse(res, {
            ...device,
            qrCode: session.qr,
            subscription: subscriptionInfo,
            slotCharge: upfrontCharge
        }, message, 201);
    } catch (error) {
        next(error);
    }
});

// DELETE /api/devices/:id - Disconnect and delete device
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const effectiveUserId = await getEffectiveUserId(req);
        const device = await prisma.device.findFirst({
            where: {
                id: req.params.id,
                userId: effectiveUserId
            }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        // Disconnect from WhatsApp
        const whatsapp = req.app.get('whatsapp');
        await whatsapp.deleteSession(device.id);

        // Cancel any associated subscription (before deleting the resource)
        try {
            await resourceSubscriptionHook.onResourceDeleted(effectiveUserId, 'DEVICE', device.id);
        } catch (hookErr) {
            console.error('[Devices] Subscription cancel hook error:', hookErr.message);
        }

        // Delete from database
        await prisma.device.delete({
            where: { id: device.id }
        });

        successResponse(res, { id: req.params.id }, 'Device disconnected and deleted successfully');
    } catch (error) {
        next(error);
    }
});

// PUT /api/devices/:id - Update device (panel binding, name, etc.)
router.put('/:id', authenticate, async (req, res, next) => {
    try {
        const { panelId, panelIds, name, replyScope, forwardOnly } = req.body;

        // Find device
        const effectiveUserId = await getEffectiveUserId(req);
        const device = await prisma.device.findFirst({
            where: {
                id: req.params.id,
                userId: effectiveUserId
            }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        // Validate panelId if provided (null means unbind from panel)
        if (panelId) {
            const panel = await prisma.smmPanel.findFirst({
                where: {
                    id: panelId,
                    userId: effectiveUserId
                }
            });
            if (!panel) {
                throw new AppError('Panel not found or does not belong to you', 400);
            }
        }

        // Build update data
        const updateData = {};
        if (panelId !== undefined) {
            updateData.panelId = panelId || null;
        }
        if (name) {
            updateData.name = name;
        }
        if (replyScope !== undefined) {
            const validScopes = ['all', 'groups_only', 'private_only', 'disabled'];
            if (!validScopes.includes(replyScope)) {
                throw new AppError(`Invalid replyScope. Must be one of: ${validScopes.join(', ')}`, 400);
            }
            updateData.replyScope = replyScope;
        }
        if (forwardOnly !== undefined) {
            updateData.forwardOnly = Boolean(forwardOnly);
        }

        // Update device
        const updatedDevice = await prisma.device.update({
            where: { id: device.id },
            data: updateData,
            include: {
                panel: {
                    select: {
                        id: true,
                        name: true,
                        alias: true
                    }
                },
                panelBindings: {
                    include: {
                        panel: {
                            select: {
                                id: true,
                                name: true,
                                alias: true
                            }
                        }
                    }
                }
            }
        });

        // Handle multi-panel bindings if panelIds array provided
        if (Array.isArray(panelIds)) {
            // Validate all panel IDs belong to user
            if (panelIds.length > 0) {
                const validPanels = await prisma.smmPanel.findMany({
                    where: {
                        id: { in: panelIds },
                        userId: effectiveUserId
                    },
                    select: { id: true }
                });
                const validIds = validPanels.map(p => p.id);
                const invalidIds = panelIds.filter(id => !validIds.includes(id));
                if (invalidIds.length > 0) {
                    throw new AppError(`Invalid panel IDs: ${invalidIds.join(', ')}`, 400);
                }
            }

            // Delete existing bindings and create new ones (atomic transaction)
            await prisma.$transaction(async (tx) => {
                await tx.devicePanelBinding.deleteMany({
                    where: { deviceId: device.id }
                });

                if (panelIds.length > 0) {
                    await tx.devicePanelBinding.createMany({
                        data: panelIds.map(pid => ({
                            deviceId: device.id,
                            panelId: pid
                        }))
                    });
                }
            });

            // Re-fetch with updated bindings
            const refreshed = await prisma.device.findUnique({
                where: { id: device.id },
                include: {
                    panel: { select: { id: true, name: true, alias: true } },
                    panelBindings: {
                        include: {
                            panel: { select: { id: true, name: true, alias: true } }
                        }
                    }
                }
            });
            return successResponse(res, {
                ...refreshed,
                panels: (refreshed.panelBindings || []).map(b => b.panel)
            }, 'Device updated successfully');
        }

        successResponse(res, {
            ...updatedDevice,
            panels: (updatedDevice.panelBindings || []).map(b => b.panel)
        }, 'Device updated successfully');
    } catch (error) {
        next(error);
    }
});

// PATCH /api/devices/:id/toggle - Toggle device ON/OFF (bot stops when OFF)
router.patch('/:id/toggle', authenticate, async (req, res, next) => {
    try {
        const effectiveUserId = await getEffectiveUserId(req);
        const device = await prisma.device.findFirst({
            where: {
                id: req.params.id,
                userId: effectiveUserId
            }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        const updatedDevice = await prisma.device.update({
            where: { id: device.id },
            data: { isActive: !device.isActive }
        });

        successResponse(res, {
            id: updatedDevice.id,
            name: updatedDevice.name,
            isActive: updatedDevice.isActive
        }, `Bot ${updatedDevice.isActive ? 'activated' : 'deactivated'} successfully`);
    } catch (error) {
        next(error);
    }
});

router.post('/:id/restart', authenticate, async (req, res, next) => {
    try {
        const effectiveUserId = await getEffectiveUserId(req);
        const device = await prisma.device.findFirst({
            where: {
                id: req.params.id,
                userId: effectiveUserId
            }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        const whatsapp = req.app.get('whatsapp');
        await whatsapp.restartSession(device.id);

        successResponse(res, { id: req.params.id }, 'Device session restart initiated');
    } catch (error) {
        next(error);
    }
});

// GET /api/devices/:id/qr - Get QR code for device
router.get('/:id/qr', authenticate, async (req, res, next) => {
    try {
        const effectiveUserId = await getEffectiveUserId(req);
        const device = await prisma.device.findFirst({
            where: {
                id: req.params.id,
                userId: effectiveUserId
            }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        const whatsapp = req.app.get('whatsapp');
        const status = whatsapp.getSessionStatus(device.id);

        if (status.status === 'connected') {
            throw new AppError('Device is already connected', 400);
        }

        // If no active session exists (disconnected device), create a new session
        // This is the key fix: when a device is disconnected, there's no socket
        // in the sessions Map, so getSessionStatus returns { status: 'disconnected', qr: null }.
        // We need to call createSession() to initiate a new WhatsApp connection
        // which will generate a fresh QR code.
        if (status.status === 'disconnected' && !status.qr) {
            console.log(`[Devices:QR] No active session for ${device.id}, creating new session for reconnect...`);
            
            // Check if session auth files exist
            const fs = require('fs');
            const path = require('path');
            const sessionPath = path.join(__dirname, '../../sessions', `session_${device.id}`);
            const hasSessionFiles = fs.existsSync(sessionPath);
            
            // If session files exist but device is 'disconnected' in DB, it could mean:
            // 1. Temporary disconnect (network issue) → auth might still be valid → try reconnect first
            // 2. Logged out (401) → deleteSession already removed files, so hasSessionFiles = false
            // 
            // If NO session files exist, this was a logout or first-time connect → fresh pairing needed
            if (hasSessionFiles) {
                console.log(`[Devices:QR] Found existing session files for ${device.id}, attempting reconnect with saved auth...`);
            } else {
                console.log(`[Devices:QR] No session files for ${device.id}, starting fresh pairing...`);
            }
            
            // Create new session (this triggers QR generation via connection.update event)
            // If auth state is valid, Baileys will auto-connect without QR
            // If auth state is expired/missing, Baileys will emit a QR code
            await whatsapp.createSession(device.id);
            
            // Update DB status to 'connecting'
            await prisma.device.update({
                where: { id: device.id },
                data: { status: 'connecting' }
            }).catch(() => {});
            
            // Re-check status after session creation (QR might be available immediately)
            const newStatus = whatsapp.getSessionStatus(device.id);
            return successResponse(res, {
                qrCode: newStatus.qr,
                status: newStatus.status
            });
        }

        successResponse(res, {
            qrCode: status.qr,
            status: status.status
        });
    } catch (error) {
        next(error);
    }
});

// ==================== GROUP REPLY BLOCKING (Bug 1.2) ====================

// GET /api/devices/:id/groups - Get live WhatsApp groups from a connected device
router.get('/:id/groups', authenticate, async (req, res, next) => {
    try {
        const effectiveUserId = await getEffectiveUserId(req);
        const device = await prisma.device.findFirst({
            where: { id: req.params.id, userId: effectiveUserId }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        // Block group fetching on System Bots (Bug 2.4) — defense-in-depth.
        // System Bots are shared by multiple users; exposing their group list
        // could leak other subscribers' support group data.
        if (device.isSystemBot) {
            throw new AppError('Group fetching is not allowed on System Bots. Users should assign their own support groups instead.', 403);
        }

        if (device.status !== 'connected') {
            throw new AppError('Device must be connected to fetch groups', 400);
        }

        const whatsappService = req.app.get('whatsapp');
        if (!whatsappService) {
            throw new AppError('WhatsApp service not available', 500);
        }

        const socket = whatsappService.getSession(req.params.id);
        if (!socket || typeof socket.groupFetchAllParticipating !== 'function') {
            throw new AppError('WhatsApp session not available for this device', 400);
        }

        const liveGroups = await socket.groupFetchAllParticipating();
        const groupList = Object.values(liveGroups).map(g => ({
            groupJid: g.id,
            groupName: g.subject || g.id,
            participantCount: g.participants?.length || 0
        }));

        // Also fetch blocked status for each group
        const blocks = await prisma.deviceGroupBlock.findMany({
            where: { deviceId: req.params.id },
            select: { groupJid: true }
        });
        const blockedJids = new Set(blocks.map(b => b.groupJid));

        const enriched = groupList.map(g => ({
            ...g,
            isBlocked: blockedJids.has(g.groupJid)
        }));

        successResponse(res, enriched, `${groupList.length} groups found`);
    } catch (error) {
        next(error);
    }
});

// GET /api/devices/:id/group-blocks - Get all blocked groups for a device
router.get('/:id/group-blocks', authenticate, async (req, res, next) => {
    try {
        const effectiveUserId = await getEffectiveUserId(req);
        const device = await prisma.device.findFirst({
            where: { id: req.params.id, userId: effectiveUserId }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        const blocks = await prisma.deviceGroupBlock.findMany({
            where: { deviceId: req.params.id },
            orderBy: { createdAt: 'desc' }
        });

        successResponse(res, blocks, `${blocks.length} blocked groups`);
    } catch (error) {
        next(error);
    }
});

// POST /api/devices/:id/group-blocks - Block a group (or multiple groups)
router.post('/:id/group-blocks', authenticate, async (req, res, next) => {
    try {
        const { groupJid, groupName, groups } = req.body;

        const effectiveUserId = await getEffectiveUserId(req);
        const device = await prisma.device.findFirst({
            where: { id: req.params.id, userId: effectiveUserId }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        // Support single or bulk block
        const toBlock = groups && Array.isArray(groups)
            ? groups
            : [{ groupJid, groupName }];

        if (toBlock.length === 0 || !toBlock[0].groupJid) {
            throw new AppError('groupJid is required', 400);
        }

        let added = 0, skipped = 0;
        const results = [];

        for (const g of toBlock) {
            if (!g.groupJid) { skipped++; continue; }

            try {
                const block = await prisma.deviceGroupBlock.upsert({
                    where: {
                        deviceId_groupJid: {
                            deviceId: req.params.id,
                            groupJid: g.groupJid
                        }
                    },
                    update: {
                        groupName: g.groupName || undefined
                    },
                    create: {
                        deviceId: req.params.id,
                        groupJid: g.groupJid,
                        groupName: g.groupName || null
                    }
                });
                results.push(block);
                added++;
            } catch (e) {
                skipped++;
            }
        }

        successResponse(res, {
            added,
            skipped,
            blocks: results
        }, `${added} group(s) blocked`);
    } catch (error) {
        next(error);
    }
});

// POST /api/devices/:id/group-blocks/mass-action - Mass block/unblock groups
router.post('/:id/group-blocks/mass-action', authenticate, async (req, res, next) => {
    try {
        const { action, groupJids } = req.body;

        if (!action || !['block', 'unblock'].includes(action)) {
            throw new AppError('action must be "block" or "unblock"', 400);
        }
        if (!groupJids || !Array.isArray(groupJids) || groupJids.length === 0) {
            throw new AppError('groupJids must be a non-empty array', 400);
        }

        const effectiveUserId = await getEffectiveUserId(req);
        const device = await prisma.device.findFirst({
            where: { id: req.params.id, userId: effectiveUserId }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        let affected = 0;

        if (action === 'block') {
            // Block all specified groups
            for (const jid of groupJids) {
                try {
                    await prisma.deviceGroupBlock.upsert({
                        where: {
                            deviceId_groupJid: {
                                deviceId: req.params.id,
                                groupJid: jid
                            }
                        },
                        update: {},
                        create: {
                            deviceId: req.params.id,
                            groupJid: jid
                        }
                    });
                    affected++;
                } catch (e) {
                    // Skip errors
                }
            }
        } else {
            // Unblock all specified groups
            const result = await prisma.deviceGroupBlock.deleteMany({
                where: {
                    deviceId: req.params.id,
                    groupJid: { in: groupJids }
                }
            });
            affected = result.count;
        }

        successResponse(res, { action, affected }, `${affected} group(s) ${action}ed`);
    } catch (error) {
        next(error);
    }
});

// DELETE /api/devices/:id/group-blocks/:blockId - Unblock a single group
router.delete('/:id/group-blocks/:blockId', authenticate, async (req, res, next) => {
    try {
        const effectiveUserId = await getEffectiveUserId(req);
        const device = await prisma.device.findFirst({
            where: { id: req.params.id, userId: effectiveUserId }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        const block = await prisma.deviceGroupBlock.findFirst({
            where: {
                id: req.params.blockId,
                deviceId: req.params.id
            }
        });

        if (!block) {
            throw new AppError('Block not found', 404);
        }

        await prisma.deviceGroupBlock.delete({
            where: { id: req.params.blockId }
        });

        successResponse(res, { id: req.params.blockId }, 'Group unblocked');
    } catch (error) {
        next(error);
    }
});

// POST /api/devices/:id/logout - Logout WhatsApp session (keep device slot, allow number change)
// This clears the session files and resets phone/status so user can pair a new number
router.post('/:id/logout', authenticate, async (req, res, next) => {
    try {
        const effectiveUserId = await getEffectiveUserId(req);
        const device = await prisma.device.findFirst({
            where: {
                id: req.params.id,
                userId: effectiveUserId
            }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        // Logout and delete session files (but keep the device record)
        const whatsapp = req.app.get('whatsapp');
        await whatsapp.deleteSession(device.id);

        // Reset phone and status in database
        await prisma.device.update({
            where: { id: device.id },
            data: {
                status: 'disconnected',
                phone: null
            }
        });

        console.log(`[Devices] Device ${device.id} (${device.name}) logged out for number change. Slot preserved.`);

        successResponse(res, {
            id: device.id,
            name: device.name,
            status: 'disconnected',
            phone: null
        }, 'WhatsApp session logged out. You can now connect a new number.');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
