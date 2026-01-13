const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { successResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const { authenticate, requireAdmin } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// ==================== USER REPORTS ====================

// GET /api/reports/dashboard - Dashboard overview stats
router.get('/dashboard', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const [
            totalOrders,
            todayOrders,
            monthOrders,
            completedOrders,
            pendingOrders,
            failedOrders,
            totalCommands,
            todayCommands,
            creditBalance,
            monthlySpent,
            activeDevices,
            activePanels
        ] = await Promise.all([
            // Orders
            prisma.order.count({ where: { userId } }),
            prisma.order.count({ where: { userId, createdAt: { gte: today } } }),
            prisma.order.count({ where: { userId, createdAt: { gte: thisMonth } } }),
            prisma.order.count({ where: { userId, status: 'COMPLETED' } }),
            prisma.order.count({ where: { userId, status: { in: ['PENDING', 'IN_PROGRESS', 'PROCESSING'] } } }),
            prisma.order.count({ where: { userId, status: { in: ['CANCELLED', 'REFUNDED'] } } }),

            // Commands
            prisma.orderCommand.count({
                where: { order: { userId } }
            }),
            prisma.orderCommand.count({
                where: { order: { userId }, createdAt: { gte: today } }
            }),

            // Credit
            prisma.user.findUnique({
                where: { id: userId },
                select: { creditBalance: true }
            }),
            prisma.creditTransaction.aggregate({
                where: {
                    userId,
                    type: 'DEBIT',
                    createdAt: { gte: thisMonth }
                },
                _sum: { amount: true }
            }),

            // Resources
            prisma.device.count({ where: { userId, status: 'connected' } }),
            prisma.smmPanel.count({ where: { userId, isActive: true } })
        ]);

        successResponse(res, {
            orders: {
                total: totalOrders,
                today: todayOrders,
                thisMonth: monthOrders,
                completed: completedOrders,
                pending: pendingOrders,
                failed: failedOrders,
                successRate: totalOrders > 0
                    ? ((completedOrders / totalOrders) * 100).toFixed(1)
                    : 0
            },
            commands: {
                total: totalCommands,
                today: todayCommands
            },
            credit: {
                balance: creditBalance?.creditBalance || 0,
                monthlySpent: monthlySpent._sum.amount || 0
            },
            resources: {
                connectedDevices: activeDevices,
                activePanels: activePanels
            }
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/reports/orders - Order statistics
router.get('/orders', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { startDate, endDate, panelId } = req.query;

        const where = { userId };

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        if (panelId) {
            where.panelId = panelId;
        }

        const [byStatus, byPanel, dailyTrend] = await Promise.all([
            // Group by status
            prisma.order.groupBy({
                by: ['status'],
                where,
                _count: true
            }),

            // Group by panel
            prisma.order.groupBy({
                by: ['panelId'],
                where,
                _count: true
            }),

            // Daily trend (last 7 days) - use Prisma instead of raw SQL for DB compatibility
            (async () => {
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

                const orders = await prisma.order.findMany({
                    where: {
                        userId,
                        createdAt: { gte: sevenDaysAgo }
                    },
                    select: { createdAt: true }
                });

                // Group by date in JS
                const dateMap = {};
                orders.forEach(o => {
                    const date = o.createdAt.toISOString().split('T')[0];
                    dateMap[date] = (dateMap[date] || 0) + 1;
                });

                return Object.entries(dateMap)
                    .map(([date, count]) => ({ date, count }))
                    .sort((a, b) => b.date.localeCompare(a.date));
            })()
        ]);

        // Get panel details
        const panelIds = byPanel.map(p => p.panelId);
        const panels = await prisma.smmPanel.findMany({
            where: { id: { in: panelIds } },
            select: { id: true, alias: true }
        });

        const panelMap = panels.reduce((acc, p) => {
            acc[p.id] = p.alias;
            return acc;
        }, {});

        successResponse(res, {
            byStatus: byStatus.map(s => ({
                status: s.status,
                count: s._count
            })),
            byPanel: byPanel.map(p => ({
                panelId: p.panelId,
                panelAlias: panelMap[p.panelId] || 'Unknown',
                count: p._count
            })),
            dailyTrend
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/reports/commands - Command statistics
router.get('/commands', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { startDate, endDate } = req.query;

        const where = { order: { userId } };

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const [byCommand, byStatus, recent] = await Promise.all([
            // Group by command type
            prisma.orderCommand.groupBy({
                by: ['command'],
                where,
                _count: true
            }),

            // Group by status
            prisma.orderCommand.groupBy({
                by: ['status'],
                where,
                _count: true
            }),

            // Recent commands
            prisma.orderCommand.findMany({
                where,
                take: 10,
                orderBy: { createdAt: 'desc' },
                include: {
                    order: {
                        select: {
                            externalOrderId: true,
                            panel: { select: { alias: true } }
                        }
                    }
                }
            })
        ]);

        successResponse(res, {
            byCommand: byCommand.map(c => ({
                command: c.command,
                count: c._count
            })),
            byStatus: byStatus.map(s => ({
                status: s.status,
                count: s._count
            })),
            recent: recent.map(r => ({
                id: r.id,
                command: r.command,
                status: r.status,
                orderId: r.order?.externalOrderId,
                panelAlias: r.order?.panel?.alias,
                createdAt: r.createdAt
            }))
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/reports/credits - Credit usage report
router.get('/credits', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { startDate, endDate } = req.query;

        const where = { userId };

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const [totals, byType, recent] = await Promise.all([
            // Total debit and credit
            prisma.creditTransaction.groupBy({
                by: ['type'],
                where,
                _sum: { amount: true },
                _count: true
            }),

            // Group by description prefix (type of charge)
            prisma.creditTransaction.findMany({
                where: { ...where, type: 'DEBIT' },
                select: { description: true, amount: true }
            }),

            // Recent transactions
            prisma.creditTransaction.findMany({
                where,
                take: 20,
                orderBy: { createdAt: 'desc' }
            })
        ]);

        // Categorize debit transactions
        const categories = {};
        for (const tx of byType) {
            const category = tx.description?.split(' ')[0] || 'Other';
            if (!categories[category]) {
                categories[category] = { count: 0, amount: 0 };
            }
            categories[category].count++;
            categories[category].amount += tx.amount || 0;
        }

        successResponse(res, {
            summary: {
                totalDebit: totals.find(t => t.type === 'DEBIT')?._sum.amount || 0,
                totalCredit: totals.find(t => t.type === 'CREDIT')?._sum.amount || 0,
                debitCount: totals.find(t => t.type === 'DEBIT')?._count || 0,
                creditCount: totals.find(t => t.type === 'CREDIT')?._count || 0
            },
            byCategory: Object.entries(categories).map(([category, data]) => ({
                category,
                ...data
            })),
            recent
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/reports/messages - Message statistics
router.get('/messages', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { startDate, endDate } = req.query;

        // Use direct relation filter (more efficient than two-step query)
        const where = {
            device: { userId }
        };

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const [total, byType, byStatus, byPlatform] = await Promise.all([
            prisma.message.count({ where }),

            prisma.message.groupBy({
                by: ['type'],
                where,
                _count: true
            }),

            prisma.message.groupBy({
                by: ['status'],
                where,
                _count: true
            }),

            prisma.message.groupBy({
                by: ['platform'],
                where,
                _count: true
            })
        ]);

        successResponse(res, {
            total,
            byType: byType.map(t => ({ type: t.type, count: t._count })),
            byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
            byPlatform: byPlatform.map(p => ({ platform: p.platform, count: p._count }))
        });
    } catch (error) {
        next(error);
    }
});

// ==================== ADMIN REPORTS ====================

// GET /api/reports/admin/overview - System-wide statistics (Admin only)
router.get('/admin/overview', requireAdmin, async (req, res, next) => {
    try {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [
            totalUsers,
            activeUsers,
            newUsersToday,
            newUsersMonth,
            totalDevices,
            connectedDevices,
            totalOrders,
            ordersToday,
            totalCommands,
            commandsToday,
            totalRevenue,
            revenueMonth,
            totalMessages,
            messagesMonth
        ] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { status: 'ACTIVE' } }),
            prisma.user.count({ where: { createdAt: { gte: today } } }),
            prisma.user.count({ where: { createdAt: { gte: thisMonth } } }),
            prisma.device.count(),
            prisma.device.count({ where: { status: 'connected' } }),
            prisma.order.count(),
            prisma.order.count({ where: { createdAt: { gte: today } } }),
            prisma.orderCommand.count(),
            prisma.orderCommand.count({ where: { createdAt: { gte: today } } }),
            prisma.creditTransaction.aggregate({
                where: { type: 'CREDIT' },
                _sum: { amount: true }
            }),
            prisma.creditTransaction.aggregate({
                where: { type: 'CREDIT', createdAt: { gte: thisMonth } },
                _sum: { amount: true }
            }),
            prisma.message.count(),
            prisma.message.count({ where: { createdAt: { gte: thisMonth } } })
        ]);

        successResponse(res, {
            users: {
                total: totalUsers,
                active: activeUsers,
                newToday: newUsersToday,
                newThisMonth: newUsersMonth
            },
            devices: {
                total: totalDevices,
                connected: connectedDevices
            },
            orders: {
                total: totalOrders,
                today: ordersToday
            },
            commands: {
                total: totalCommands,
                today: commandsToday
            },
            revenue: {
                allTime: totalRevenue._sum.amount || 0,
                thisMonth: revenueMonth._sum.amount || 0
            },
            messages: {
                total: totalMessages,
                thisMonth: messagesMonth
            }
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/reports/admin/top-users - Top users by usage (Admin only)
router.get('/admin/top-users', requireAdmin, async (req, res, next) => {
    try {
        const { metric = 'orders', limit = 10 } = req.query;

        let topUsers;

        switch (metric) {
            case 'credit':
                topUsers = await prisma.user.findMany({
                    where: { role: 'USER' },
                    orderBy: { creditBalance: 'desc' },
                    take: parseInt(limit),
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        creditBalance: true,
                        createdAt: true
                    }
                });
                break;
            case 'orders':
            default:
                topUsers = await prisma.user.findMany({
                    where: { role: 'USER' },
                    take: parseInt(limit),
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        creditBalance: true,
                        createdAt: true,
                        _count: {
                            select: { orders: true }
                        }
                    },
                    orderBy: {
                        orders: { _count: 'desc' }
                    }
                });
        }

        successResponse(res, topUsers);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
