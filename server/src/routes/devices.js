const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { successResponse, paginatedResponse, parsePagination } = require('../utils/response');
const resourceSubscriptionHook = require('../services/resourceSubscriptionHook');

// GET /api/devices - List all devices for current user
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const [devices, total, messageStats] = await Promise.all([
            prisma.device.findMany({
                where: { userId: req.user.id },
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
                where: { userId: req.user.id }
            }),
            prisma.message.groupBy({
                by: ['deviceId', 'type'],
                where: { device: { userId: req.user.id } },
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


// GET /api/devices/:id - Get device by ID
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const device = await prisma.device.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
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

        // Validate panelId if provided
        if (panelId) {
            const panel = await prisma.smmPanel.findFirst({
                where: {
                    id: panelId,
                    userId: req.user.id
                }
            });
            if (!panel) {
                throw new AppError('Panel not found or does not belong to you', 400);
            }
        }

        // Create in database with optional panel binding
        const device = await prisma.device.create({
            data: {
                name,
                userId: req.user.id,
                panelId: panelId || null,  // Bind to panel if provided
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

        // Auto-create subscription (1st device free, subsequent ones charged monthly)
        let subscriptionInfo = null;
        try {
            subscriptionInfo = await resourceSubscriptionHook.onResourceCreated(
                req.user.id, 'DEVICE', device.id, device.name
            );
        } catch (hookErr) {
            console.error('[Devices] Subscription hook error:', hookErr.message);
        }

        successResponse(res, {
            ...device,
            qrCode: session.qr,
            subscription: subscriptionInfo
        }, `Device created${panelId ? ' and bound to panel' : ''}${subscriptionInfo?.charged ? `. Monthly subscription: $${subscriptionInfo.subscription?.monthlyFee}` : '. First device is free!'}. Please scan the QR code to connect.`, 201);
    } catch (error) {
        next(error);
    }
});

// DELETE /api/devices/:id - Disconnect and delete device
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const device = await prisma.device.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
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
            await resourceSubscriptionHook.onResourceDeleted(req.user.id, 'DEVICE', device.id);
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
        const device = await prisma.device.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
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
                    userId: req.user.id
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
                        userId: req.user.id
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
        const device = await prisma.device.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
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
        const device = await prisma.device.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
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
        const device = await prisma.device.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
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
        const device = await prisma.device.findFirst({
            where: { id: req.params.id, userId: req.user.id }
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
        const device = await prisma.device.findFirst({
            where: { id: req.params.id, userId: req.user.id }
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

        const device = await prisma.device.findFirst({
            where: { id: req.params.id, userId: req.user.id }
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

        const device = await prisma.device.findFirst({
            where: { id: req.params.id, userId: req.user.id }
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
        const device = await prisma.device.findFirst({
            where: { id: req.params.id, userId: req.user.id }
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

module.exports = router;
