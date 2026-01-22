const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { successResponse, createdResponse, paginatedResponse, parsePagination } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const groupForwardingService = require('../services/groupForwarding');
const { safeParseObject } = require('../utils/safeJson');
const logger = require('../utils/logger').service('ProviderGroups');

// All routes require authentication
router.use(authenticate);

// ==================== PROVIDER GROUPS ====================

// GET /api/provider-groups - List user's provider groups
router.get('/', async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { panelId } = req.query;

        // Simple filter by userId (now stored directly on ProviderGroup)
        const where = {
            userId: req.user.id
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
                    },
                    device: {
                        select: {
                            id: true,
                            name: true,
                            status: true
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

// ==================== SERVICE ID ROUTING ====================

// GET /api/provider-groups/:id/service-id-rules - Get service ID routing rules
// NOTE: This MUST be before /:id route (has sub-path)
router.get('/:id/service-id-rules', async (req, res, next) => {
    try {
        const group = await prisma.providerGroup.findFirst({
            where: {
                id: req.params.id,
                panel: {
                    userId: req.user.id
                }
            },
            select: {
                id: true,
                groupName: true,
                serviceIdRules: true
            }
        });

        if (!group) {
            throw new AppError('Provider group not found', 404);
        }

        // Parse rules if stored as string
        let rules = {};
        if (group.serviceIdRules) {
            rules = typeof group.serviceIdRules === 'string'
                ? safeParseObject(group.serviceIdRules)
                : group.serviceIdRules;
        }

        successResponse(res, {
            groupId: group.id,
            groupName: group.name,
            rules: rules,
            ruleCount: Object.keys(rules).length
        });
    } catch (error) {
        next(error);
    }
});

// PUT /api/provider-groups/:id/service-id-rules - Update service ID routing rules
// NOTE: This MUST be before /:id route (has sub-path)
router.put('/:id/service-id-rules', async (req, res, next) => {
    try {
        const { rules } = req.body;

        // Validate rules object
        if (rules === undefined) {
            throw new AppError('Rules object is required', 400);
        }

        if (rules !== null && typeof rules !== 'object') {
            throw new AppError('Rules must be an object mapping serviceId to targetJid', 400);
        }

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

        // Update only the serviceIdRules field
        const group = await prisma.providerGroup.update({
            where: { id: req.params.id },
            data: {
                serviceIdRules: rules
            },
            select: {
                id: true,
                groupName: true,
                serviceIdRules: true
            }
        });

        const ruleCount = rules ? Object.keys(rules).length : 0;
        logger.info(`Updated service ID rules for "${group.name}": ${ruleCount} rules`);

        successResponse(res, {
            groupId: group.id,
            groupName: group.name,
            rules: rules,
            ruleCount: ruleCount
        }, `Service ID rules updated (${ruleCount} rules)`);
    } catch (error) {
        next(error);
    }
});

// POST /api/provider-groups/:id/service-id-rules/add - Add single service ID rule
router.post('/:id/service-id-rules/add', async (req, res, next) => {
    try {
        const { serviceId, targetJid } = req.body;

        if (!serviceId || !targetJid) {
            throw new AppError('serviceId and targetJid are required', 400);
        }

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

        // Parse existing rules
        let rules = {};
        if (existing.serviceIdRules) {
            rules = typeof existing.serviceIdRules === 'string'
                ? safeParseObject(existing.serviceIdRules)
                : existing.serviceIdRules;
        }

        // Add new rule
        const serviceIdStr = String(serviceId);
        const wasExisting = !!rules[serviceIdStr];
        rules[serviceIdStr] = targetJid;

        // Update
        const group = await prisma.providerGroup.update({
            where: { id: req.params.id },
            data: {
                serviceIdRules: rules
            },
            select: {
                id: true,
                groupName: true,
                serviceIdRules: true
            }
        });

        const action = wasExisting ? 'updated' : 'added';
        logger.info(`${action} service ID rule: ${serviceIdStr} -> ${targetJid}`);

        successResponse(res, {
            groupId: group.id,
            serviceId: serviceIdStr,
            targetJid: targetJid,
            action: action,
            totalRules: Object.keys(rules).length
        }, `Service ID rule ${action}`);
    } catch (error) {
        next(error);
    }
});

// DELETE /api/provider-groups/:id/service-id-rules/:serviceId - Remove single service ID rule
router.delete('/:id/service-id-rules/:serviceId', async (req, res, next) => {
    try {
        const { serviceId } = req.params;

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

        // Parse existing rules
        let rules = {};
        if (existing.serviceIdRules) {
            rules = typeof existing.serviceIdRules === 'string'
                ? safeParseObject(existing.serviceIdRules)
                : existing.serviceIdRules;
        }

        const serviceIdStr = String(serviceId);
        if (!rules[serviceIdStr]) {
            throw new AppError(`Service ID ${serviceIdStr} not found in rules`, 404);
        }

        // Remove rule
        delete rules[serviceIdStr];

        // Update
        const group = await prisma.providerGroup.update({
            where: { id: req.params.id },
            data: {
                serviceIdRules: Object.keys(rules).length > 0 ? rules : null
            },
            select: {
                id: true,
                groupName: true,
                serviceIdRules: true
            }
        });

        logger.info(`Removed service ID rule: ${serviceIdStr}`);

        successResponse(res, {
            groupId: group.id,
            removedServiceId: serviceIdStr,
            totalRules: Object.keys(rules).length
        }, `Service ID rule removed`);
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
            providerName,
            deviceId,
            groupType,
            type, // WHATSAPP or TELEGRAM
            groupJid,
            targetNumber,
            newOrderTemplate,
            refillTemplate,
            cancelTemplate,
            speedUpTemplate,
            isActive,
            isManualServiceGroup
        } = req.body;

        if (!name) {
            throw new AppError('Group/Support name is required', 400);
        }

        // Verify panel belongs to user (if provided)
        let panel = null;
        if (panelId) {
            panel = await prisma.smmPanel.findFirst({
                where: {
                    id: panelId,
                    userId: req.user.id
                }
            });

            if (!panel) {
                throw new AppError('Panel not found', 404);
            }
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

        const platformType = type || 'WHATSAPP';
        const provName = providerName || null;

        // Check for existing group with same panelId + providerName + type
        const existing = await prisma.providerGroup.findFirst({
            where: {
                panelId,
                providerName: provName,
                type: platformType
            }
        });

        if (existing) {
            throw new AppError(`A provider support for "${provName || 'default'}" already exists${panelId ? ' for this panel' : ''}.`, 400);
        }

        const group = await prisma.providerGroup.create({
            data: {
                userId: req.user.id,
                panelId: panelId || null,
                deviceId: deviceId || null,
                providerName: provName,
                type: platformType,
                groupId: groupJid || targetNumber,
                groupName: name,
                messageTemplate: newOrderTemplate || refillTemplate || null,
                isActive: isActive !== false,
                isManualServiceGroup: isManualServiceGroup || !panelId // Auto-set if no panel
            },
            include: {
                panel: {
                    select: {
                        alias: true
                    }
                },
                device: {
                    select: {
                        id: true,
                        name: true,
                        status: true
                    }
                }
            }
        });

        createdResponse(res, group, 'Provider support created');
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
            name,           // Will map to groupName
            panelId,
            providerName,
            type,           // WHATSAPP, TELEGRAM
            groupJid,       // Will map to groupId
            targetNumber,   // Alternative to groupJid
            messageTemplate,
            refillTemplate, // Legacy - use messageTemplate
            cancelTemplate,
            speedUpTemplate,
            isActive,
            serviceIdRules,
            isManualServiceGroup,
            deviceId  // NEW: device for sending messages
        } = req.body;

        // Build update data with correct field names from schema
        const updateData = {};

        if (name) updateData.groupName = name;
        if (panelId !== undefined) updateData.panelId = panelId || null;
        if (providerName !== undefined) updateData.providerName = providerName || null;
        if (deviceId !== undefined) updateData.deviceId = deviceId || null;
        if (type) updateData.type = type;
        if (groupJid || targetNumber) updateData.groupId = groupJid || targetNumber;
        if (messageTemplate !== undefined) updateData.messageTemplate = messageTemplate;
        if (refillTemplate !== undefined) updateData.messageTemplate = refillTemplate; // Legacy support
        if (isActive !== undefined) updateData.isActive = isActive;
        if (serviceIdRules !== undefined) updateData.serviceIdRules = serviceIdRules;
        if (isManualServiceGroup !== undefined) updateData.isManualServiceGroup = isManualServiceGroup;

        const group = await prisma.providerGroup.update({
            where: { id: req.params.id },
            data: updateData,
            include: {
                panel: {
                    select: {
                        alias: true,
                        name: true
                    }
                },
                device: {
                    select: {
                        id: true,
                        name: true,
                        status: true
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

// PATCH /api/provider-groups/:id/toggle - Toggle provider group active status
router.patch('/:id/toggle', async (req, res, next) => {
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

        const updated = await prisma.providerGroup.update({
            where: { id: req.params.id },
            data: { isActive: !group.isActive },
            include: {
                panel: { select: { alias: true } }
            }
        });

        logger.info(`Provider group ${req.params.id} toggled to ${updated.isActive ? 'active' : 'inactive'}`);
        successResponse(res, updated, `Provider group ${updated.isActive ? 'activated' : 'deactivated'}`);
    } catch (error) {
        next(error);
    }
});

// POST /api/provider-groups/:id/test - Test sending message to group

router.post('/:id/test', async (req, res, next) => {
    try {
        const group = await prisma.providerGroup.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            },
            include: {
                panel: true,
                device: true
            }
        });

        if (!group) {
            throw new AppError('Provider group not found', 404);
        }

        if (!group.device) {
            throw new AppError('No WhatsApp device linked to this group. Please edit the group and select a device.', 400);
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
Provider Group: ${group.groupName}
Panel: ${group.panel?.alias || 'N/A'}

Timestamp: ${new Date().toLocaleString()}`;

        // Use correct field names: groupId and type
        const targetJid = group.type === 'DIRECT' || !group.groupId.includes('@g.us')
            ? `${group.groupId.replace(/\\D/g, '')}@s.whatsapp.net`
            : group.groupId;

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
