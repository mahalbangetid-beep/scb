const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { successResponse, paginatedResponse, parsePagination } = require('../utils/response');

const validTriggerTypes = ['exact', 'contains', 'startswith', 'regex'];

// GET /api/auto-reply - List all rules for user
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { isActive, deviceId, search } = req.query;

        const where = {
            userId: req.user.id
        };

        if (isActive !== undefined) {
            where.isActive = isActive === 'true';
        }

        // Build AND conditions for multiple filters
        const andConditions = [];

        if (deviceId) {
            andConditions.push({
                OR: [
                    { deviceId: deviceId },
                    { deviceId: null }
                ]
            });
        }

        if (search) {
            andConditions.push({
                OR: [
                    { name: { contains: search } },
                    { keywords: { contains: search } }
                ]
            });
        }

        // Apply AND conditions if any exist
        if (andConditions.length > 0) {
            where.AND = andConditions;
        }

        const [rules, total] = await Promise.all([
            prisma.autoReplyRule.findMany({
                where,
                skip,
                take: limit,
                orderBy: [
                    { priority: 'asc' },
                    { createdAt: 'desc' }
                ],
                include: {
                    device: {
                        select: { name: true }
                    }
                }
            }),
            prisma.autoReplyRule.count({ where })
        ]);

        paginatedResponse(res, rules, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// GET /api/auto-reply/:id
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const rule = await prisma.autoReplyRule.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!rule) {
            throw new AppError('Rule not found', 404);
        }

        successResponse(res, rule);
    } catch (error) {
        next(error);
    }
});

// POST /api/auto-reply
router.post('/', authenticate, async (req, res, next) => {
    try {
        const { name, trigger, triggerType, response, deviceId, priority } = req.body;

        if (!name || !trigger || !triggerType || !response) {
            throw new AppError('name, trigger, triggerType, and response are required', 400);
        }

        if (!validTriggerTypes.includes(triggerType)) {
            throw new AppError(`Invalid triggerType. Must be one of: ${validTriggerTypes.join(', ')}`, 400);
        }

        const rule = await prisma.autoReplyRule.create({
            data: {
                name,
                keywords: trigger,
                triggerType,
                response,
                priority: priority || 0,
                deviceId: deviceId || null,
                userId: req.user.id,
                isActive: true
            }
        });

        successResponse(res, rule, 'Auto-reply rule created', 201);
    } catch (error) {
        next(error);
    }
});

// PUT /api/auto-reply/:id
router.put('/:id', authenticate, async (req, res, next) => {
    try {
        const { name, trigger, triggerType, response, isActive, priority, deviceId } = req.body;

        const existing = await prisma.autoReplyRule.findFirst({
            where: { id: req.params.id, userId: req.user.id }
        });

        if (!existing) {
            throw new AppError('Rule not found', 404);
        }

        if (triggerType && !validTriggerTypes.includes(triggerType)) {
            throw new AppError(`Invalid triggerType. Must be one of: ${validTriggerTypes.join(', ')}`, 400);
        }

        const rule = await prisma.autoReplyRule.update({
            where: { id: req.params.id },
            data: {
                name,
                keywords: trigger,
                triggerType,
                response,
                isActive,
                priority,
                deviceId: deviceId || null
            }
        });

        successResponse(res, rule, 'Rule updated');
    } catch (error) {
        next(error);
    }
});

// PATCH /api/auto-reply/:id/toggle - Toggle active status
router.patch('/:id/toggle', authenticate, async (req, res, next) => {
    try {
        const existing = await prisma.autoReplyRule.findFirst({
            where: { id: req.params.id, userId: req.user.id }
        });

        if (!existing) {
            throw new AppError('Rule not found', 404);
        }

        const rule = await prisma.autoReplyRule.update({
            where: { id: req.params.id },
            data: { isActive: !existing.isActive }
        });

        successResponse(res, rule, `Rule ${rule.isActive ? 'activated' : 'deactivated'}`);
    } catch (error) {
        next(error);
    }
});

// DELETE /api/auto-reply/:id
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const existing = await prisma.autoReplyRule.findFirst({
            where: { id: req.params.id, userId: req.user.id }
        });

        if (!existing) {
            throw new AppError('Rule not found', 404);
        }

        await prisma.autoReplyRule.delete({
            where: { id: req.params.id }
        });

        successResponse(res, { id: req.params.id }, 'Rule deleted');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
