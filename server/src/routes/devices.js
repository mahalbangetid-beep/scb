const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { successResponse, paginatedResponse, parsePagination } = require('../utils/response');

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
                panelId: device.panelId,
                panel: device.panel,  // Include panel info
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

        successResponse(res, {
            ...device,
            qrCode: session.qr // Note: This might be null if already connected or error
        }, `Device created${panelId ? ' and bound to panel' : ''}. Please scan the QR code to connect.`, 201);
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

        // Delete from database
        await prisma.device.delete({
            where: { id: device.id }
        });

        successResponse(res, { id: req.params.id }, 'Device disconnected and deleted successfully');
    } catch (error) {
        next(error);
    }
});

// POST /api/devices/:id/restart - Restart device session
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

module.exports = router;
