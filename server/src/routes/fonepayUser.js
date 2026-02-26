/**
 * FonePay User Routes
 * 
 * User-level routes for managing FonePay settings on their own panels.
 * These routes are SEPARATE from the admin routes in fonepay.js.
 * Only requires authentication (no admin role).
 * All queries are scoped by req.user.id.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');

// All routes require authentication only (no requireAdmin)
router.use(authenticate);

// ==================== SETTINGS ====================

/**
 * GET /api/fonepay-user/settings
 * Get user's own FonePay settings + their rental panels
 */
router.get('/settings', async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Get user's own FonePay settings from Setting table
        const settings = await prisma.setting.findMany({
            where: {
                userId,
                key: { startsWith: 'fonepay' }
            }
        });

        const settingsMap = {};
        settings.forEach(s => { settingsMap[s.key] = s.value; });

        // Get user's active rental panels with FonePay fields
        const panels = await prisma.smmPanel.findMany({
            where: {
                userId,
                panelType: 'RENTAL',
                isActive: true
            },
            select: {
                id: true,
                name: true,
                alias: true,
                url: true,
                fonepayEnabled: true,
                fonepayVerifyEndpoint: true,
                fonepayAddFundEndpoint: true
            }
        });

        res.json({
            success: true,
            data: {
                global: {
                    enabled: settingsMap.fonepayGlobalEnabled === 'true',
                    maxAttemptsPerHour: parseInt(settingsMap.fonepayMaxAttempts || '5'),
                    paymentExpiryHours: parseInt(settingsMap.fonepayExpiryHours || '24')
                },
                panels
            }
        });
    } catch (error) {
        console.error('[FonePay User] Get settings error:', error.message);
        next(error);
    }
});

/**
 * PATCH /api/fonepay-user/settings
 * Update user's own global FonePay settings
 */
router.patch('/settings', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { enabled, maxAttemptsPerHour, paymentExpiryHours } = req.body;

        const settings = {};
        if (enabled !== undefined) settings.fonepayGlobalEnabled = String(enabled);
        if (maxAttemptsPerHour !== undefined) settings.fonepayMaxAttempts = String(maxAttemptsPerHour);
        if (paymentExpiryHours !== undefined) settings.fonepayExpiryHours = String(paymentExpiryHours);

        // Upsert each setting (scoped to user)
        for (const [key, value] of Object.entries(settings)) {
            await prisma.setting.upsert({
                where: {
                    key_userId: { key, userId }
                },
                update: { value },
                create: { key, value, userId }
            });
        }

        res.json({ success: true, message: 'FonePay settings updated' });
    } catch (error) {
        console.error('[FonePay User] Update settings error:', error.message);
        next(error);
    }
});

// ==================== PANEL TOGGLE ====================

/**
 * PATCH /api/fonepay-user/panels/:panelId/toggle
 * Enable/disable FonePay for user's own rental panel
 */
router.patch('/panels/:panelId/toggle', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { enabled } = req.body;

        // Only allow toggling user's OWN rental panel
        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: req.params.panelId,
                userId,
                panelType: 'RENTAL'
            }
        });

        if (!panel) {
            return res.status(404).json({ success: false, error: 'Rental panel not found' });
        }

        const updatedPanel = await prisma.smmPanel.update({
            where: { id: panel.id },
            data: { fonepayEnabled: !!enabled },
            select: {
                id: true,
                name: true,
                alias: true,
                fonepayEnabled: true
            }
        });

        res.json({
            success: true,
            data: updatedPanel,
            message: `FonePay ${updatedPanel.fonepayEnabled ? 'enabled' : 'disabled'} for ${updatedPanel.alias || updatedPanel.name}`
        });
    } catch (error) {
        console.error('[FonePay User] Toggle error:', error.message);
        next(error);
    }
});

// ==================== TRANSACTIONS (READ-ONLY) ====================

/**
 * GET /api/fonepay-user/transactions
 * List user's own FonePay transactions (read-only, no approve/reject)
 */
router.get('/transactions', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const {
            page = 1,
            limit = 20,
            status,
            panelId,
            search
        } = req.query;

        const skip = (parseInt(page) - 1) * Math.min(parseInt(limit), 100);
        const take = Math.min(parseInt(limit), 100);

        const where = { userId };

        if (status && status !== 'all') {
            where.status = status;
        }

        if (panelId) {
            where.panelId = panelId;
        }

        if (search) {
            where.OR = [
                { txnId: { contains: search, mode: 'insensitive' } },
                { whatsappNumber: { contains: search } },
                { panelUsername: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [transactions, total] = await Promise.all([
            prisma.fonepayTransaction.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    panel: { select: { name: true, alias: true, url: true } }
                }
            }),
            prisma.fonepayTransaction.count({ where })
        ]);

        res.json({
            success: true,
            data: transactions,
            pagination: {
                page: parseInt(page),
                limit: take,
                total,
                totalPages: Math.ceil(total / take)
            }
        });
    } catch (error) {
        console.error('[FonePay User] List transactions error:', error.message);
        next(error);
    }
});

// ==================== STATS ====================

/**
 * GET /api/fonepay-user/stats
 * User's own FonePay stats
 */
router.get('/stats', async (req, res, next) => {
    try {
        const userId = req.user.id;

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(todayStart);
        weekStart.setDate(weekStart.getDate() - 7);
        const monthStart = new Date(todayStart);
        monthStart.setDate(monthStart.getDate() - 30);

        const [todayStats, weekStats, monthStats, statusBreakdown] = await Promise.all([
            prisma.fonepayTransaction.aggregate({
                where: { userId, createdAt: { gte: todayStart } },
                _count: true,
                _sum: { amountEntered: true }
            }),
            prisma.fonepayTransaction.aggregate({
                where: { userId, createdAt: { gte: weekStart } },
                _count: true,
                _sum: { amountEntered: true }
            }),
            prisma.fonepayTransaction.aggregate({
                where: { userId, createdAt: { gte: monthStart } },
                _count: true,
                _sum: { amountEntered: true }
            }),
            prisma.fonepayTransaction.groupBy({
                by: ['status'],
                where: { userId, createdAt: { gte: monthStart } },
                _count: true,
                _sum: { amountEntered: true }
            })
        ]);

        const totalMonth = statusBreakdown.reduce((sum, s) => sum + s._count, 0);
        const creditedMonth = statusBreakdown.find(s => s.status === 'credited')?._count || 0;
        const successRate = totalMonth > 0 ? Math.round((creditedMonth / totalMonth) * 100) : 0;

        res.json({
            success: true,
            data: {
                today: {
                    count: todayStats._count,
                    totalAmount: todayStats._sum.amountEntered || 0
                },
                week: {
                    count: weekStats._count,
                    totalAmount: weekStats._sum.amountEntered || 0
                },
                month: {
                    count: monthStats._count,
                    totalAmount: monthStats._sum.amountEntered || 0
                },
                successRate,
                statusBreakdown: statusBreakdown.map(s => ({
                    status: s.status,
                    count: s._count,
                    totalAmount: s._sum.amountEntered || 0
                }))
            }
        });
    } catch (error) {
        console.error('[FonePay User] Stats error:', error.message);
        next(error);
    }
});

module.exports = router;
