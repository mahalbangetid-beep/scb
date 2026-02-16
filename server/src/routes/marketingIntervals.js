const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { successResponse } = require('../utils/response');

// Apply authentication to all routes
router.use(authenticate);

// GET /api/marketing-intervals — List all marketing intervals for current user
router.get('/', async (req, res, next) => {
    try {
        const intervals = await prisma.marketingInterval.findMany({
            where: { userId: req.user.id },
            include: {
                device: {
                    select: { id: true, name: true, phone: true, status: true }
                }
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
        const { deviceId, groupJid, groupName, interval, message, mediaUrl } = req.body;

        // Validate required fields
        if (!deviceId || !groupJid || !interval || !message) {
            throw new AppError('deviceId, groupJid, interval, and message are required', 400);
        }

        if (typeof interval !== 'number' || isNaN(interval) || interval < 1 || interval > 10000) {
            throw new AppError('Interval must be between 1 and 10000', 400);
        }

        if (message.length > 5000) {
            throw new AppError('Message must be 5000 characters or less', 400);
        }

        // Verify device belongs to user
        const device = await prisma.device.findFirst({
            where: { id: deviceId, userId: req.user.id }
        });
        if (!device) {
            throw new AppError('Device not found', 404);
        }

        // Check for duplicate (same device + group)
        const existing = await prisma.marketingInterval.findUnique({
            where: {
                userId_deviceId_groupJid: {
                    userId: req.user.id,
                    deviceId,
                    groupJid
                }
            }
        });
        if (existing) {
            throw new AppError('A marketing interval already exists for this device and group', 409);
        }

        const created = await prisma.marketingInterval.create({
            data: {
                userId: req.user.id,
                deviceId,
                groupJid,
                groupName: groupName || null,
                interval,
                message,
                mediaUrl: mediaUrl || null
            },
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
        const { interval, message, mediaUrl, groupName } = req.body;

        const existing = await prisma.marketingInterval.findFirst({
            where: { id: req.params.id, userId: req.user.id }
        });
        if (!existing) {
            throw new AppError('Marketing interval not found', 404);
        }

        const updateData = {};
        if (interval !== undefined) {
            if (typeof interval !== 'number' || isNaN(interval) || interval < 1 || interval > 10000) {
                throw new AppError('Interval must be between 1 and 10000', 400);
            }
            updateData.interval = interval;
        }
        if (message !== undefined) {
            if (message.length > 5000) {
                throw new AppError('Message must be 5000 characters or less', 400);
            }
            updateData.message = message;
        }
        if (mediaUrl !== undefined) updateData.mediaUrl = mediaUrl || null;
        if (groupName !== undefined) updateData.groupName = groupName || null;

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
            where: { id: req.params.id, userId: req.user.id }
        });
        if (!existing) {
            throw new AppError('Marketing interval not found', 404);
        }

        const updated = await prisma.marketingInterval.update({
            where: { id: req.params.id },
            data: { isActive: !existing.isActive }
        });

        successResponse(res, updated, `Marketing interval ${updated.isActive ? 'activated' : 'paused'}`);
    } catch (error) {
        next(error);
    }
});

// PATCH /api/marketing-intervals/:id/reset — Reset message counter
router.patch('/:id/reset', async (req, res, next) => {
    try {
        const existing = await prisma.marketingInterval.findFirst({
            where: { id: req.params.id, userId: req.user.id }
        });
        if (!existing) {
            throw new AppError('Marketing interval not found', 404);
        }

        const updated = await prisma.marketingInterval.update({
            where: { id: req.params.id },
            data: { messageCount: 0 }
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
            where: { id: req.params.id, userId: req.user.id }
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

module.exports = router;
