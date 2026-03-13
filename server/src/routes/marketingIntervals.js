const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate, getEffectiveUserId } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { successResponse } = require('../utils/response');

// Apply authentication to all routes
router.use(authenticate);
// Resolve effective userId (staff → owner's ID, others → own ID)
router.use(async (req, res, next) => {
    try {
        req.effectiveUserId = await getEffectiveUserId(req);
        next();
    } catch (err) {
        next(err);
    }
});

// GET /api/marketing-intervals — List all marketing intervals for current user
router.get('/', async (req, res, next) => {
    try {
        const { type } = req.query; // Optional filter: 'counter' or 'time'
        const where = { userId: req.effectiveUserId };
        if (type === 'counter' || type === 'time') {
            where.scheduleType = type;
        }

        const intervals = await prisma.marketingInterval.findMany({
            where,
            include: {
                device: {
                    select: { id: true, name: true, phone: true, status: true }
                },
                _count: { select: { logs: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        successResponse(res, intervals);
    } catch (error) {
        next(error);
    }
});

// POST /api/marketing-intervals — Create a new marketing interval
router.post('/', async (req, res, next) => {
    try {
        const {
            deviceId, groupJid, groupName, interval, message, mediaUrl,
            scheduleType, timeInterval, repeatCount, scheduledAt
        } = req.body;

        const mode = scheduleType || 'counter';

        // Validate required fields (shared)
        if (!deviceId || !groupJid || !message) {
            throw new AppError('deviceId, groupJid, and message are required', 400);
        }

        if (message.length > 5000) {
            throw new AppError('Message must be 5000 characters or less', 400);
        }

        // Mode-specific validation
        if (mode === 'counter') {
            if (!interval || typeof interval !== 'number' || isNaN(interval) || interval < 1 || interval > 10000) {
                throw new AppError('Interval must be between 1 and 10000 for counter mode', 400);
            }
        } else if (mode === 'time') {
            if (!timeInterval || typeof timeInterval !== 'number' || timeInterval < 1 || timeInterval > 43200) {
                throw new AppError('Time interval must be between 1 and 43200 minutes', 400);
            }
            if (repeatCount !== undefined && repeatCount !== null) {
                if (typeof repeatCount !== 'number' || repeatCount < 1 || repeatCount > 10000) {
                    throw new AppError('Repeat count must be between 1 and 10000', 400);
                }
            }
        } else {
            throw new AppError('scheduleType must be "counter" or "time"', 400);
        }

        // Verify device belongs to user
        const device = await prisma.device.findFirst({
            where: { id: deviceId, userId: req.effectiveUserId }
        });
        if (!device) {
            throw new AppError('Device not found', 404);
        }

        // Check for duplicate (same device + group)
        const existing = await prisma.marketingInterval.findUnique({
            where: {
                userId_deviceId_groupJid: {
                    userId: req.effectiveUserId,
                    deviceId,
                    groupJid
                }
            }
        });
        if (existing) {
            throw new AppError('A marketing interval already exists for this device and group', 409);
        }

        // Build create data
        const createData = {
            userId: req.effectiveUserId,
            deviceId,
            groupJid,
            groupName: groupName || null,
            scheduleType: mode,
            interval: mode === 'counter' ? interval : 50, // Default for counter field
            message,
            mediaUrl: mediaUrl || null
        };

        // Time-mode specific fields
        if (mode === 'time') {
            createData.timeInterval = timeInterval;
            createData.repeatCount = repeatCount || null;
            createData.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
            // Set first run time
            if (scheduledAt) {
                createData.nextRunAt = new Date(scheduledAt);
            } else {
                // Start immediately: first run = now + timeInterval minutes
                createData.nextRunAt = new Date(Date.now() + timeInterval * 60000);
            }
        }

        const created = await prisma.marketingInterval.create({
            data: createData,
            include: {
                device: {
                    select: { id: true, name: true, phone: true, status: true }
                }
            }
        });

        successResponse(res, created, 'Marketing interval created');
    } catch (error) {
        next(error);
    }
});

// PUT /api/marketing-intervals/:id — Update a marketing interval
router.put('/:id', async (req, res, next) => {
    try {
        const { interval, message, mediaUrl, groupName, timeInterval, repeatCount, scheduledAt } = req.body;

        const existing = await prisma.marketingInterval.findFirst({
            where: { id: req.params.id, userId: req.effectiveUserId }
        });
        if (!existing) {
            throw new AppError('Marketing interval not found', 404);
        }

        const updateData = {};

        // Counter-mode field
        if (interval !== undefined) {
            if (typeof interval !== 'number' || isNaN(interval) || interval < 1 || interval > 10000) {
                throw new AppError('Interval must be between 1 and 10000', 400);
            }
            updateData.interval = interval;
        }

        // Shared fields
        if (message !== undefined) {
            if (message.length > 5000) {
                throw new AppError('Message must be 5000 characters or less', 400);
            }
            updateData.message = message;
        }
        if (mediaUrl !== undefined) updateData.mediaUrl = mediaUrl || null;
        if (groupName !== undefined) updateData.groupName = groupName || null;

        // Time-mode fields (only apply if this is a time-based interval)
        if (existing.scheduleType === 'time') {
            if (timeInterval !== undefined) {
                if (typeof timeInterval !== 'number' || timeInterval < 1 || timeInterval > 43200) {
                    throw new AppError('Time interval must be between 1 and 43200 minutes', 400);
                }
                updateData.timeInterval = timeInterval;
            }
            if (repeatCount !== undefined) {
                updateData.repeatCount = repeatCount || null;
            }
            if (scheduledAt !== undefined) {
                updateData.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
                // Recalculate nextRunAt if scheduled time changed
                if (scheduledAt && new Date(scheduledAt) > new Date()) {
                    updateData.nextRunAt = new Date(scheduledAt);
                }
            }
        }

        const updated = await prisma.marketingInterval.update({
            where: { id: req.params.id },
            data: updateData,
            include: {
                device: {
                    select: { id: true, name: true, phone: true, status: true }
                }
            }
        });

        successResponse(res, updated, 'Marketing interval updated');
    } catch (error) {
        next(error);
    }
});

// PATCH /api/marketing-intervals/:id/toggle — Toggle active status
router.patch('/:id/toggle', async (req, res, next) => {
    try {
        const existing = await prisma.marketingInterval.findFirst({
            where: { id: req.params.id, userId: req.effectiveUserId }
        });
        if (!existing) {
            throw new AppError('Marketing interval not found', 404);
        }

        const newActive = !existing.isActive;
        const updateData = { isActive: newActive };

        // For time-based: recalculate nextRunAt when re-activating
        if (newActive && existing.scheduleType === 'time' && existing.timeInterval) {
            updateData.nextRunAt = new Date(Date.now() + existing.timeInterval * 60000);
        }
        // When pausing time-based: clear nextRunAt
        if (!newActive && existing.scheduleType === 'time') {
            updateData.nextRunAt = null;
        }

        const updated = await prisma.marketingInterval.update({
            where: { id: req.params.id },
            data: updateData
        });

        successResponse(res, updated, `Marketing interval ${updated.isActive ? 'activated' : 'paused'}`);
    } catch (error) {
        next(error);
    }
});

// PATCH /api/marketing-intervals/:id/reset — Reset counters
router.patch('/:id/reset', async (req, res, next) => {
    try {
        const existing = await prisma.marketingInterval.findFirst({
            where: { id: req.params.id, userId: req.effectiveUserId }
        });
        if (!existing) {
            throw new AppError('Marketing interval not found', 404);
        }

        const resetData = { messageCount: 0 };

        // For time-based: also reset repeatsDone and recalculate nextRunAt
        if (existing.scheduleType === 'time') {
            resetData.repeatsDone = 0;
            if (existing.isActive && existing.timeInterval) {
                resetData.nextRunAt = new Date(Date.now() + existing.timeInterval * 60000);
            }
        }

        const updated = await prisma.marketingInterval.update({
            where: { id: req.params.id },
            data: resetData
        });

        successResponse(res, updated, 'Counter reset');
    } catch (error) {
        next(error);
    }
});

// DELETE /api/marketing-intervals/:id — Delete a marketing interval
router.delete('/:id', async (req, res, next) => {
    try {
        const existing = await prisma.marketingInterval.findFirst({
            where: { id: req.params.id, userId: req.effectiveUserId }
        });
        if (!existing) {
            throw new AppError('Marketing interval not found', 404);
        }

        await prisma.marketingInterval.delete({
            where: { id: req.params.id }
        });

        successResponse(res, null, 'Marketing interval deleted');
    } catch (error) {
        next(error);
    }
});

// GET /api/marketing-intervals/:id/logs — Get sending logs for an interval
router.get('/:id/logs', async (req, res, next) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Verify ownership
        const existing = await prisma.marketingInterval.findFirst({
            where: { id: req.params.id, userId: req.effectiveUserId }
        });
        if (!existing) {
            throw new AppError('Marketing interval not found', 404);
        }

        const [logs, total] = await Promise.all([
            prisma.marketingIntervalLog.findMany({
                where: { intervalId: req.params.id },
                orderBy: { createdAt: 'desc' },
                take: parseInt(limit),
                skip
            }),
            prisma.marketingIntervalLog.count({
                where: { intervalId: req.params.id }
            })
        ]);

        successResponse(res, {
            logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;

