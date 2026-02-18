/**
 * Support Groups Routes
 *
 * Section 7: Support Group Page
 * 
 * Dedicated page where users can manage reusable WhatsApp groups:
 * - Add Group ID + Group Name
 * - Select groups for Marketing (Section 6.4) or Support forwarding
 * - Fetch live groups from connected devices for easy selection
 */

const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { successResponse, paginatedResponse, parsePagination } = require('../utils/response');

// All routes require authentication
router.use(authenticate);

// ==================== NAMED ROUTES FIRST (before /:id) ====================

/**
 * GET /api/support-groups/for/marketing
 * Get all groups available for marketing (purpose = marketing or both).
 * Returns a flat list for broadcast selection.
 * NOTE: This MUST be before /:id route
 */
router.get('/for/marketing', async (req, res, next) => {
    try {
        const { deviceId } = req.query;

        const where = {
            userId: req.user.id,
            isActive: true,
            purpose: { in: ['marketing', 'both'] }
        };

        if (deviceId) where.deviceId = deviceId;

        const groups = await prisma.supportGroup.findMany({
            where,
            select: {
                id: true,
                groupJid: true,
                groupName: true,
                deviceId: true,
                purpose: true,
                device: {
                    select: { id: true, name: true, status: true }
                }
            },
            orderBy: { groupName: 'asc' }
        });

        successResponse(res, groups, `${groups.length} marketing groups available`);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/support-groups/for/support
 * Get all groups available for support forwarding (purpose = support or both).
 * NOTE: This MUST be before /:id route
 */
router.get('/for/support', async (req, res, next) => {
    try {
        const { deviceId } = req.query;

        const where = {
            userId: req.user.id,
            isActive: true,
            purpose: { in: ['support', 'both'] }
        };

        if (deviceId) where.deviceId = deviceId;

        const groups = await prisma.supportGroup.findMany({
            where,
            select: {
                id: true,
                groupJid: true,
                groupName: true,
                deviceId: true,
                purpose: true,
                device: {
                    select: { id: true, name: true, status: true }
                }
            },
            orderBy: { groupName: 'asc' }
        });

        successResponse(res, groups, `${groups.length} support groups available`);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/support-groups/bulk
 * Add multiple groups at once (e.g., from live group fetch).
 * Body: { groups: [{ groupJid, groupName }], deviceId?, purpose? }
 * NOTE: This MUST be before /:id route
 */
router.post('/bulk', async (req, res, next) => {
    try {
        const { groups, deviceId, purpose } = req.body;

        if (!groups || !Array.isArray(groups) || groups.length === 0) {
            throw new AppError('groups must be a non-empty array', 400);
        }

        const validPurposes = ['marketing', 'support', 'both'];
        const effectivePurpose = purpose && validPurposes.includes(purpose) ? purpose : 'both';

        // Verify device ownership if deviceId provided
        if (deviceId) {
            const device = await prisma.device.findFirst({
                where: { id: deviceId, userId: req.user.id }
            });
            if (!device) {
                throw new AppError('Device not found', 404);
            }
        }

        let added = 0, skipped = 0;
        const results = [];

        for (const g of groups) {
            if (!g.groupJid || !g.groupName) {
                skipped++;
                continue;
            }

            const normalizedJid = g.groupJid.includes('@') ? g.groupJid : `${g.groupJid}@g.us`;

            try {
                const group = await prisma.supportGroup.upsert({
                    where: {
                        userId_groupJid: {
                            userId: req.user.id,
                            groupJid: normalizedJid
                        }
                    },
                    update: {
                        groupName: g.groupName.trim(),
                        deviceId: deviceId || undefined,
                        purpose: effectivePurpose
                    },
                    create: {
                        userId: req.user.id,
                        deviceId: deviceId || null,
                        groupJid: normalizedJid,
                        groupName: g.groupName.trim(),
                        purpose: effectivePurpose
                    }
                });
                results.push(group);
                added++;
            } catch (e) {
                skipped++;
            }
        }

        successResponse(res, {
            added,
            skipped,
            total: results.length,
            groups: results
        }, `${added} groups added/updated, ${skipped} skipped`);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/support-groups/import/:deviceId
 * Fetch all WhatsApp groups from a connected device and import them.
 * This fulfills "one-click add all groups" from a device.
 * NOTE: This MUST be before /:id route
 */
router.post('/import/:deviceId', async (req, res, next) => {
    try {
        const { deviceId } = req.params;
        const { purpose } = req.body;

        // Verify device ownership
        const device = await prisma.device.findFirst({
            where: { id: deviceId, userId: req.user.id }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        if (device.status !== 'connected') {
            throw new AppError('Device must be connected to import groups', 400);
        }

        // Fetch live groups from WhatsApp
        const whatsappService = req.app.get('whatsapp');
        if (!whatsappService) {
            throw new AppError('WhatsApp service not available', 500);
        }

        const socket = whatsappService.getSession(deviceId);
        if (!socket || typeof socket.groupFetchAllParticipating !== 'function') {
            throw new AppError('WhatsApp session not available for this device', 400);
        }

        const liveGroups = await socket.groupFetchAllParticipating();
        const groupList = Object.values(liveGroups);

        if (groupList.length === 0) {
            return successResponse(res, { added: 0, total: 0, groups: [] }, 'No groups found on device');
        }

        const validPurposes = ['marketing', 'support', 'both'];
        const effectivePurpose = purpose && validPurposes.includes(purpose) ? purpose : 'both';

        let added = 0;
        const results = [];

        for (const g of groupList) {
            const groupJid = g.id;
            const groupName = g.subject || g.id;

            try {
                const group = await prisma.supportGroup.upsert({
                    where: {
                        userId_groupJid: {
                            userId: req.user.id,
                            groupJid
                        }
                    },
                    update: {
                        groupName,
                        deviceId
                    },
                    create: {
                        userId: req.user.id,
                        deviceId,
                        groupJid,
                        groupName,
                        purpose: effectivePurpose
                    }
                });
                results.push(group);
                added++;
            } catch (e) {
                // Skip duplicates or errors
            }
        }

        successResponse(res, {
            added,
            totalOnDevice: groupList.length,
            groups: results
        }, `Imported ${added} groups from device ${device.name}`);
    } catch (error) {
        next(error);
    }
});

// ==================== LIST SUPPORT GROUPS ====================

/**
 * GET /api/support-groups
 * List all support groups for the authenticated user.
 * Query params:
 *   - purpose: filter by purpose (marketing, support, both)
 *   - deviceId: filter by device
 *   - search: search by group name or JID
 *   - page, limit: pagination
 */
router.get('/', async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { purpose, deviceId, search } = req.query;

        const where = { userId: req.user.id };

        // Filter by purpose
        if (purpose && ['marketing', 'support', 'both'].includes(purpose)) {
            if (purpose === 'marketing') {
                where.purpose = { in: ['marketing', 'both'] };
            } else if (purpose === 'support') {
                where.purpose = { in: ['support', 'both'] };
            } else {
                where.purpose = purpose;
            }
        }

        // Filter by device
        if (deviceId) {
            where.deviceId = deviceId;
        }

        // Search by name or JID
        if (search) {
            where.OR = [
                { groupName: { contains: search, mode: 'insensitive' } },
                { groupJid: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [groups, total] = await Promise.all([
            prisma.supportGroup.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    device: {
                        select: { id: true, name: true, phone: true, status: true }
                    }
                }
            }),
            prisma.supportGroup.count({ where })
        ]);

        paginatedResponse(res, groups, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// ==================== CREATE GROUP ====================

/**
 * POST /api/support-groups
 * Add a new support group.
 * Body: { groupJid, groupName, deviceId?, purpose?, notes? }
 */
router.post('/', async (req, res, next) => {
    try {
        const { groupJid, groupName, deviceId, purpose, notes } = req.body;

        if (!groupJid || !groupName) {
            throw new AppError('groupJid and groupName are required', 400);
        }

        // Validate groupJid format (should end with @g.us for WhatsApp groups)
        const normalizedJid = groupJid.includes('@') ? groupJid : `${groupJid}@g.us`;

        // Validate purpose
        const validPurposes = ['marketing', 'support', 'both'];
        const effectivePurpose = purpose && validPurposes.includes(purpose) ? purpose : 'both';

        // Verify device ownership if deviceId provided
        if (deviceId) {
            const device = await prisma.device.findFirst({
                where: { id: deviceId, userId: req.user.id }
            });
            if (!device) {
                throw new AppError('Device not found', 404);
            }
        }

        // Check for duplicate (userId + groupJid unique constraint)
        const existing = await prisma.supportGroup.findUnique({
            where: {
                userId_groupJid: {
                    userId: req.user.id,
                    groupJid: normalizedJid
                }
            }
        });

        if (existing) {
            throw new AppError('This group is already registered. Use PUT to update it.', 409);
        }

        const group = await prisma.supportGroup.create({
            data: {
                userId: req.user.id,
                deviceId: deviceId || null,
                groupJid: normalizedJid,
                groupName: groupName.trim(),
                purpose: effectivePurpose,
                notes: notes ? notes.trim() : null
            },
            include: {
                device: {
                    select: { id: true, name: true, phone: true, status: true }
                }
            }
        });

        successResponse(res, group, 'Support group added', 201);
    } catch (error) {
        next(error);
    }
});

// ==================== PARAMETERIZED ROUTES (after named routes) ====================

/**
 * GET /api/support-groups/:id
 * Get a single support group by ID.
 */
router.get('/:id', async (req, res, next) => {
    try {
        const group = await prisma.supportGroup.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            },
            include: {
                device: {
                    select: { id: true, name: true, phone: true, status: true }
                }
            }
        });

        if (!group) {
            throw new AppError('Support group not found', 404);
        }

        successResponse(res, group);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/support-groups/:id
 * Update a support group.
 * Body: { groupName?, purpose?, notes?, deviceId?, isActive? }
 */
router.put('/:id', async (req, res, next) => {
    try {
        const { groupName, purpose, notes, deviceId, isActive } = req.body;

        // Verify ownership
        const existing = await prisma.supportGroup.findFirst({
            where: { id: req.params.id, userId: req.user.id }
        });

        if (!existing) {
            throw new AppError('Support group not found', 404);
        }

        // Build update data
        const data = {};
        if (groupName !== undefined) data.groupName = groupName.trim();
        if (purpose !== undefined) {
            const validPurposes = ['marketing', 'support', 'both'];
            if (!validPurposes.includes(purpose)) {
                throw new AppError('purpose must be marketing, support, or both', 400);
            }
            data.purpose = purpose;
        }
        if (notes !== undefined) data.notes = notes ? notes.trim() : null;
        if (isActive !== undefined) data.isActive = Boolean(isActive);
        if (deviceId !== undefined) {
            if (deviceId === null) {
                data.deviceId = null;
            } else {
                const device = await prisma.device.findFirst({
                    where: { id: deviceId, userId: req.user.id }
                });
                if (!device) {
                    throw new AppError('Device not found', 404);
                }
                data.deviceId = deviceId;
            }
        }

        const group = await prisma.supportGroup.update({
            where: { id: req.params.id },
            data,
            include: {
                device: {
                    select: { id: true, name: true, phone: true, status: true }
                }
            }
        });

        successResponse(res, group, 'Support group updated');
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/support-groups/:id
 * Delete a support group.
 */
router.delete('/:id', async (req, res, next) => {
    try {
        const existing = await prisma.supportGroup.findFirst({
            where: { id: req.params.id, userId: req.user.id }
        });

        if (!existing) {
            throw new AppError('Support group not found', 404);
        }

        await prisma.supportGroup.delete({
            where: { id: req.params.id }
        });

        successResponse(res, { id: req.params.id }, 'Support group deleted');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
