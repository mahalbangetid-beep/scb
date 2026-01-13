const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { successResponse, paginatedResponse, parsePagination } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const adminApiService = require('../services/adminApiService');

// All routes require authentication
router.use(authenticate);

// ==================== ORDER LISTING ====================

// GET /api/orders - List user's orders
router.get('/', async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { panelId, status, search, startDate, endDate } = req.query;

        // Build where clause
        const where = { userId: req.user.id };

        if (panelId) {
            where.panelId = panelId;
        }

        if (status) {
            where.status = status;
        }

        if (search) {
            where.OR = [
                { externalOrderId: { contains: search, mode: 'insensitive' } },
                { link: { contains: search, mode: 'insensitive' } },
                { serviceName: { contains: search, mode: 'insensitive' } }
            ];
        }

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) {
                where.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                where.createdAt.lte = new Date(endDate);
            }
        }

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
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
            prisma.order.count({ where })
        ]);

        paginatedResponse(res, orders, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// GET /api/orders/stats - Get order statistics
router.get('/stats', async (req, res, next) => {
    try {
        const { panelId } = req.query;

        const where = { userId: req.user.id };
        if (panelId) {
            where.panelId = panelId;
        }

        const [total, pending, inProgress, completed, cancelled, partial] = await Promise.all([
            prisma.order.count({ where }),
            prisma.order.count({ where: { ...where, status: 'PENDING' } }),
            prisma.order.count({ where: { ...where, status: 'IN_PROGRESS' } }),
            prisma.order.count({ where: { ...where, status: 'COMPLETED' } }),
            prisma.order.count({ where: { ...where, status: 'CANCELLED' } }),
            prisma.order.count({ where: { ...where, status: 'PARTIAL' } })
        ]);

        successResponse(res, {
            total,
            pending,
            inProgress,
            completed,
            cancelled,
            partial
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/orders/:id - Get order details
router.get('/:id', async (req, res, next) => {
    try {
        const order = await prisma.order.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            },
            include: {
                panel: {
                    select: {
                        id: true,
                        name: true,
                        alias: true
                    }
                },
                commands: {
                    orderBy: { createdAt: 'desc' },
                    take: 20
                }
            }
        });

        if (!order) {
            throw new AppError('Order not found', 404);
        }

        successResponse(res, order);
    } catch (error) {
        next(error);
    }
});

// ==================== ORDER STATUS ====================

// GET /api/orders/:id/status - Check order status from panel Admin API
router.get('/:id/status', async (req, res, next) => {
    try {
        const order = await prisma.order.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            },
            include: {
                panel: true // Include full panel for Admin API
            }
        });

        if (!order) {
            throw new AppError('Order not found', 404);
        }

        if (!order.panel.supportsAdminApi) {
            throw new AppError('Panel does not support Admin API', 400);
        }

        const status = await adminApiService.getOrderStatus(order.panel, order.externalOrderId);

        if (!status.success) {
            throw new AppError(status.error || 'Failed to get status', 500);
        }

        // Update order with new status
        const newStatus = status.status || 'PENDING';
        await prisma.order.update({
            where: { id: order.id },
            data: {
                status: newStatus,
                startCount: status.startCount || order.startCount,
                remains: status.remains || order.remains,
                charge: status.charge || order.charge,
                lastCheckedAt: new Date()
            }
        });

        successResponse(res, {
            orderId: order.externalOrderId,
            status: newStatus,
            apiStatus: status.status,
            startCount: status.startCount,
            remains: status.remains,
            charge: status.charge,
            providerName: status.providerName,
            providerOrderId: status.providerOrderId
        });
    } catch (error) {
        next(error);
    }
});

// ==================== ORDER COMMANDS ====================

// POST /api/orders/:id/refill - Request refill
router.post('/:id/refill', async (req, res, next) => {
    try {
        const order = await prisma.order.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            },
            include: {
                panel: true // Include full panel for Admin API
            }
        });

        if (!order) {
            throw new AppError('Order not found', 404);
        }

        // Check if order is completed (refill only for completed orders)
        if (order.status !== 'COMPLETED') {
            throw new AppError(`Cannot refill order with status: ${order.status}. Only completed orders can be refilled.`, 400);
        }

        // Create command record
        const command = await prisma.orderCommand.create({
            data: {
                orderId: order.id,
                command: 'REFILL',
                status: 'PROCESSING',
                requestedBy: req.user.username
            }
        });

        try {
            // Send refill request to panel Admin API
            const result = await adminApiService.createRefill(order.panel, order.externalOrderId);

            if (!result.success) {
                throw new Error(result.error || 'Refill failed');
            }

            // Update command status
            await prisma.orderCommand.update({
                where: { id: command.id },
                data: {
                    status: 'SUCCESS',
                    response: JSON.stringify(result),
                    processedAt: new Date()
                }
            });

            successResponse(res, {
                success: true,
                orderId: order.externalOrderId,
                refillId: result.refillId,
                message: `Refill request created for order ${order.externalOrderId}`
            });
        } catch (error) {
            // Update command with error
            await prisma.orderCommand.update({
                where: { id: command.id },
                data: {
                    status: 'FAILED',
                    error: error.message,
                    processedAt: new Date()
                }
            });
            throw error;
        }
    } catch (error) {
        next(error);
    }
});

// POST /api/orders/:id/cancel - Request cancel
router.post('/:id/cancel', async (req, res, next) => {
    try {
        const order = await prisma.order.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            },
            include: {
                panel: true // Include full panel for Admin API
            }
        });

        if (!order) {
            throw new AppError('Order not found', 404);
        }

        // Check if order can be cancelled
        if (['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(order.status)) {
            throw new AppError(`Cannot cancel order with status: ${order.status}`, 400);
        }

        // Create command record
        const command = await prisma.orderCommand.create({
            data: {
                orderId: order.id,
                command: 'CANCEL',
                status: 'PROCESSING',
                requestedBy: req.user.username
            }
        });

        try {
            // Send cancel request to panel Admin API
            const result = await adminApiService.createCancel(order.panel, order.externalOrderId);

            if (!result.success) {
                throw new Error(result.error || 'Cancel failed');
            }

            // Update command status
            await prisma.orderCommand.update({
                where: { id: command.id },
                data: {
                    status: 'SUCCESS',
                    response: JSON.stringify(result),
                    processedAt: new Date()
                }
            });

            // Update order status
            await prisma.order.update({
                where: { id: order.id },
                data: { status: 'CANCELLED' }
            });

            successResponse(res, {
                success: true,
                orderId: order.externalOrderId,
                message: `Cancel request sent for order ${order.externalOrderId}`
            });
        } catch (error) {
            // Update command with error
            await prisma.orderCommand.update({
                where: { id: command.id },
                data: {
                    status: 'FAILED',
                    error: error.message,
                    processedAt: new Date()
                }
            });
            throw error;
        }
    } catch (error) {
        next(error);
    }
});

// POST /api/orders/:id/speed-up - Request speed-up (same as refill in most panels)
router.post('/:id/speed-up', async (req, res, next) => {
    try {
        const order = await prisma.order.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            },
            include: {
                panel: {
                    select: { alias: true }
                }
            }
        });

        if (!order) {
            throw new AppError('Order not found', 404);
        }

        // Speed-up only for pending/in-progress orders
        if (!['PENDING', 'IN_PROGRESS', 'PROCESSING'].includes(order.status)) {
            throw new AppError(`Cannot speed-up order with status: ${order.status}`, 400);
        }

        // Create command record
        const command = await prisma.orderCommand.create({
            data: {
                orderId: order.id,
                command: 'SPEED_UP',
                status: 'SUCCESS', // Speed-up is usually just a record/notification
                requestedBy: req.user.username,
                processedAt: new Date()
            }
        });

        successResponse(res, {
            success: true,
            orderId: order.externalOrderId,
            message: `Speed-up request logged for order ${order.externalOrderId}. This will be forwarded to the provider.`
        });
    } catch (error) {
        next(error);
    }
});

// ==================== BULK OPERATIONS ====================

// POST /api/orders/bulk-status - Check multiple orders status
router.post('/bulk-status', async (req, res, next) => {
    try {
        const { orderIds } = req.body;

        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            throw new AppError('Order IDs array is required', 400);
        }

        if (orderIds.length > 100) {
            throw new AppError('Maximum 100 orders per request', 400);
        }

        const orders = await prisma.order.findMany({
            where: {
                id: { in: orderIds },
                userId: req.user.id
            },
            include: {
                panel: true // Include full panel for Admin API
            }
        });

        // Group orders by panel
        const ordersByPanel = orders.reduce((acc, order) => {
            if (!acc[order.panelId]) {
                acc[order.panelId] = [];
            }
            acc[order.panelId].push(order);
            return acc;
        }, {});

        const results = [];

        for (const [panelId, panelOrders] of Object.entries(ordersByPanel)) {
            try {
                const externalIds = panelOrders.map(o => o.externalOrderId);
                const statuses = await adminApiService.getMultipleOrdersStatus(panelOrders[0].panel, externalIds);

                for (const order of panelOrders) {
                    const statusData = statuses.orders?.[order.externalOrderId];
                    if (statusData && !statusData.error) {
                        const newStatus = statusData.status || 'PENDING';

                        await prisma.order.update({
                            where: { id: order.id },
                            data: {
                                status: newStatus,
                                lastCheckedAt: new Date()
                            }
                        });

                        results.push({
                            orderId: order.externalOrderId,
                            status: newStatus,
                            panelAlias: order.panel.alias
                        });
                    } else {
                        results.push({
                            orderId: order.externalOrderId,
                            error: statusData?.error || 'Unknown error',
                            panelAlias: order.panel.alias
                        });
                    }
                }
            } catch (error) {
                for (const order of panelOrders) {
                    results.push({
                        orderId: order.externalOrderId,
                        error: error.message,
                        panelAlias: order.panel.alias
                    });
                }
            }
        }

        successResponse(res, results);
    } catch (error) {
        next(error);
    }
});

// POST /api/orders/bulk-refill - Request refill for multiple orders
router.post('/bulk-refill', async (req, res, next) => {
    try {
        const { orderIds } = req.body;

        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            throw new AppError('Order IDs array is required', 400);
        }

        if (orderIds.length > 100) {
            throw new AppError('Maximum 100 orders per request', 400);
        }

        const orders = await prisma.order.findMany({
            where: {
                id: { in: orderIds },
                userId: req.user.id,
                status: 'COMPLETED' // Only completed orders can be refilled
            },
            include: {
                panel: true // Include full panel for Admin API
            }
        });

        const results = [];

        for (const order of orders) {
            try {
                const command = await prisma.orderCommand.create({
                    data: {
                        orderId: order.id,
                        command: 'REFILL',
                        status: 'PROCESSING',
                        requestedBy: req.user.username
                    }
                });

                const result = await adminApiService.createRefill(order.panel, order.externalOrderId);

                if (!result.success) {
                    throw new Error(result.error || 'Refill failed');
                }

                await prisma.orderCommand.update({
                    where: { id: command.id },
                    data: {
                        status: 'SUCCESS',
                        response: JSON.stringify(result),
                        processedAt: new Date()
                    }
                });

                results.push({
                    orderId: order.externalOrderId,
                    success: true,
                    refillId: result.refillId
                });
            } catch (error) {
                results.push({
                    orderId: order.externalOrderId,
                    success: false,
                    error: error.message
                });
            }
        }

        successResponse(res, results);
    } catch (error) {
        next(error);
    }
});

// GET /api/orders/:id/commands - Get order command history
router.get('/:id/commands', async (req, res, next) => {
    try {
        const order = await prisma.order.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!order) {
            throw new AppError('Order not found', 404);
        }

        const commands = await prisma.orderCommand.findMany({
            where: { orderId: order.id },
            orderBy: { createdAt: 'desc' }
        });

        successResponse(res, commands);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
