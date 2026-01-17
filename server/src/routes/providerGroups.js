const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { successResponse, createdResponse, paginatedResponse, parsePagination } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const groupForwardingService = require('../services/groupForwarding');

// All routes require authentication
router.use(authenticate);

// ==================== PROVIDER GROUPS ====================

// GET /api/provider-groups - List user's provider groups
router.get('/', async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { panelId } = req.query;

        // Filter through panel relation since ProviderGroup doesn't have userId
        const where = {
            panel: {
                userId: req.user.id
            }
        };

        if (panelId) {
            where.panelId = panelId;
        }

        const [groups, total] = await Promise.all([
            prisma.providerGroup.findMany({
                where,
                include: {
                    panel: {
                        select: {
                            id: true,
                            name: true,
                            alias: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.providerGroup.count({ where })
        ]);

        paginatedResponse(res, groups, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// ==================== NAMED ROUTES (BEFORE /:id) ====================

// POST /api/provider-groups/forward - Forward command to provider group
// NOTE: This MUST be before /:id route
router.post('/forward', async (req, res, next) => {
    try {
        const { orderId, command, deviceId } = req.body;

        if (!orderId || !command) {
            throw new AppError('Order ID and command are required', 400);
        }

        // Set dependencies if not already set
        const io = req.app.get('io');
        const whatsappService = req.app.get('whatsapp');
        groupForwardingService.setDependencies(io, whatsappService);

        const result = await groupForwardingService.forwardToGroup({
            orderId,
            command,
            userId: req.user.id,
            deviceId
        });

        successResponse(res, result);
    } catch (error) {
        next(error);
    }
});

// GET /api/provider-groups/whatsapp-groups/:deviceId - List WhatsApp groups
// NOTE: This MUST be before /:id route
router.get('/whatsapp-groups/:deviceId', async (req, res, next) => {
    try {
        const device = await prisma.device.findFirst({
            where: {
                id: req.params.deviceId,
                userId: req.user.id
            }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        if (device.status !== 'connected') {
            throw new AppError('Device is not connected', 400);
        }

        const whatsappService = req.app.get('whatsapp');
        if (!whatsappService) {
            throw new AppError('WhatsApp service not available', 500);
        }

        // Get groups from WhatsApp
        const groups = await whatsappService.getGroups(device.id);

        successResponse(res, groups || []);
    } catch (error) {
        next(error);
    }
});

// GET /api/provider-groups/:id - Get provider group details
router.get('/:id', async (req, res, next) => {
    try {
        const group = await prisma.providerGroup.findFirst({
            where: {
                id: req.params.id,
                panel: {
                    userId: req.user.id
                }
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

        if (!group) {
            throw new AppError('Provider group not found', 404);
        }

        successResponse(res, group);
    } catch (error) {
        next(error);
    }
});

// POST /api/provider-groups - Create provider group
router.post('/', async (req, res, next) => {
    try {
        const {
            name,
            panelId,
            deviceId,
            groupType,
            groupJid,
            targetNumber,
            refillTemplate,
            cancelTemplate,
            speedUpTemplate,
            isActive
        } = req.body;

        if (!name || !panelId) {
            throw new AppError('Name and panel ID are required', 400);
        }

        // Verify panel belongs to user
        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: panelId,
                userId: req.user.id
            }
        });

        if (!panel) {
            throw new AppError('Panel not found', 404);
        }

        // Verify device if provided
        if (deviceId) {
            const device = await prisma.device.findFirst({
                where: {
                    id: deviceId,
                    userId: req.user.id
                }
            });

            if (!device) {
                throw new AppError('Device not found', 404);
            }
        }

        // Validate group type specific fields
        if (groupType === 'GROUP' && !groupJid) {
            throw new AppError('Group JID is required for group type', 400);
        }

        if (groupType === 'DIRECT' && !targetNumber) {
            throw new AppError('Target number is required for direct type', 400);
        }

        const group = await prisma.providerGroup.create({
            data: {
                name,
                panelId,
                groupType: groupType || 'GROUP',
                groupId: groupJid || targetNumber,
                groupName: name,
                messageTemplate: refillTemplate, // Use first template as default
                isActive: isActive !== false
            },
            include: {
                panel: {
                    select: {
                        alias: true
                    }
                }
            }
        });

        createdResponse(res, group, 'Provider group created');
    } catch (error) {
        next(error);
    }
});

// PUT /api/provider-groups/:id - Update provider group
router.put('/:id', async (req, res, next) => {
    try {
        const existing = await prisma.providerGroup.findFirst({
            where: {
                id: req.params.id,
                panel: {
                    userId: req.user.id
                }
            }
        });

        if (!existing) {
            throw new AppError('Provider group not found', 404);
        }

        const {
            name,
            deviceId,
            groupType,
            groupJid,
            targetNumber,
            refillTemplate,
            cancelTemplate,
            speedUpTemplate,
            isActive
        } = req.body;

        // Verify device if changed
        if (deviceId && deviceId !== existing.deviceId) {
            const device = await prisma.device.findFirst({
                where: {
                    id: deviceId,
                    userId: req.user.id
                }
            });

            if (!device) {
                throw new AppError('Device not found', 404);
            }
        }

        const group = await prisma.providerGroup.update({
            where: { id: req.params.id },
            data: {
                ...(name && { name }),
                ...(deviceId && { deviceId }),
                ...(groupType && { groupType }),
                ...(groupJid !== undefined && { groupJid }),
                ...(targetNumber !== undefined && { targetNumber }),
                ...(refillTemplate !== undefined && { refillTemplate }),
                ...(cancelTemplate !== undefined && { cancelTemplate }),
                ...(speedUpTemplate !== undefined && { speedUpTemplate }),
                ...(isActive !== undefined && { isActive })
            },
            include: {
                panel: {
                    select: {
                        alias: true
                    }
                }
            }
        });

        successResponse(res, group, 'Provider group updated');
    } catch (error) {
        next(error);
    }
});

// DELETE /api/provider-groups/:id - Delete provider group
router.delete('/:id', async (req, res, next) => {
    try {
        const group = await prisma.providerGroup.findFirst({
            where: {
                id: req.params.id,
                panel: {
                    userId: req.user.id
                }
            }
        });

        if (!group) {
            throw new AppError('Provider group not found', 404);
        }

        await prisma.providerGroup.delete({
            where: { id: req.params.id }
        });

        successResponse(res, null, 'Provider group deleted');
    } catch (error) {
        next(error);
    }
});

// ==================== GROUP OPERATIONS ====================

// POST /api/provider-groups/:id/test - Test sending message to group
router.post('/:id/test', async (req, res, next) => {
    try {
        const group = await prisma.providerGroup.findFirst({
            where: {
                id: req.params.id,
                panel: {
                    userId: req.user.id
                }
            },
            include: {
                panel: true
            }
        });

        if (!group) {
            throw new AppError('Provider group not found', 404);
        }

        if (!group.device) {
            throw new AppError('No WhatsApp device linked to this group', 400);
        }

        if (group.device.status !== 'connected') {
            throw new AppError('WhatsApp device is not connected', 400);
        }

        // Get WhatsApp service
        const whatsappService = req.app.get('whatsapp');
        if (!whatsappService) {
            throw new AppError('WhatsApp service not available', 500);
        }

        // Send test message
        const testMessage = `🧪 *TEST MESSAGE*

This is a test message from DICREWA Bot.
Provider Group: ${group.name}
Panel: ${group.panel?.alias || 'N/A'}

Timestamp: ${new Date().toLocaleString()}`;

        const targetJid = group.groupType === 'DIRECT'
            ? `${group.targetNumber.replace(/\D/g, '')}@s.whatsapp.net`
            : group.groupJid;

        await whatsappService.sendMessage(group.device.id, targetJid, testMessage);

        successResponse(res, {
            success: true,
            message: 'Test message sent successfully',
            target: targetJid
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
