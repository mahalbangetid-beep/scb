const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { successResponse, paginatedResponse, parsePagination } = require('../utils/response');

// GET /api/messages - List messages for current user's devices
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { type, status, deviceId, search } = req.query;

        const where = {
            device: {
                userId: req.user.id
            }
        };

        if (type) where.type = type;
        if (status) where.status = status;
        if (deviceId) where.deviceId = deviceId;
        if (search) {
            where.OR = [
                { message: { contains: search, mode: 'insensitive' } },
                { from: { contains: search, mode: 'insensitive' } },
                { to: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [messages, total] = await Promise.all([
            prisma.message.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    device: {
                        select: { name: true }
                    }
                }
            }),
            prisma.message.count({ where })
        ]);

        paginatedResponse(res, messages, {
            page,
            limit,
            total
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/messages/:id - Get message by ID
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const message = await prisma.message.findFirst({
            where: {
                id: req.params.id,
                device: {
                    userId: req.user.id
                }
            },
            include: {
                device: {
                    select: { name: true }
                }
            }
        });

        if (!message) {
            throw new AppError('Message not found', 404);
        }

        successResponse(res, message);
    } catch (error) {
        next(error);
    }
});

// POST /api/messages/send - Send text message
router.post('/send', authenticate, async (req, res, next) => {
    try {
        const { deviceId, to, message: content } = req.body;

        if (!deviceId || !to || !content) {
            throw new AppError('deviceId, to, and message are required', 400);
        }

        // Verify device ownership
        const device = await prisma.device.findFirst({
            where: { id: deviceId, userId: req.user.id }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        if (device.status !== 'connected') {
            throw new AppError('Device is not connected to WhatsApp', 400);
        }

        const whatsapp = req.app.get('whatsapp');

        // Save message as pending
        const msgRecord = await prisma.message.create({
            data: {
                type: 'outgoing',
                content,
                to,
                status: 'pending',
                deviceId: device.id
            }
        });

        // Send via WhatsApp service
        try {
            await whatsapp.sendMessage(device.id, to, content);

            // Update to sent
            const updatedMsg = await prisma.message.update({
                where: { id: msgRecord.id },
                data: { status: 'sent' }
            });

            successResponse(res, updatedMsg, 'Message sent successfully', 201);
        } catch (sendError) {
            // Update to failed
            await prisma.message.update({
                where: { id: msgRecord.id },
                data: { status: 'failed' }
            });
            throw sendError;
        }
    } catch (error) {
        next(error);
    }
});

// POST /api/messages/send-media - Send media message (Draft)
router.post('/send-media', authenticate, async (req, res, next) => {
    try {
        const { deviceId, to, type, mediaUrl, caption } = req.body;

        if (!deviceId || !to || !mediaUrl) {
            throw new AppError('deviceId, to, and mediaUrl are required', 400);
        }

        // Verify device ownership
        const device = await prisma.device.findFirst({
            where: { id: deviceId, userId: req.user.id }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        // Placeholder for real media sending
        const msgRecord = await prisma.message.create({
            data: {
                type: 'outgoing',
                content: caption || `Media: ${type || 'image'}`,
                to,
                status: 'pending',
                deviceId: device.id
            }
        });

        const whatsapp = req.app.get('whatsapp');

        try {
            if (type === 'image') {
                await whatsapp.sendImage(device.id, to, mediaUrl, caption);
            } else {
                // Fallback for document
                await whatsapp.sendDocument(device.id, to, mediaUrl, 'media', caption);
            }

            const updatedMsg = await prisma.message.update({
                where: { id: msgRecord.id },
                data: { status: 'sent' }
            });

            successResponse(res, updatedMsg, 'Media sent successfully', 201);
        } catch (sendError) {
            await prisma.message.update({
                where: { id: msgRecord.id },
                data: { status: 'failed' }
            });
            throw sendError;
        }
    } catch (error) {
        next(error);
    }
});

module.exports = router;
