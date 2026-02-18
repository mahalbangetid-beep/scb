/**
 * FonePay REST API Routes
 * 
 * Admin routes for managing FonePay transactions, audit logs, and settings.
 * All routes require authentication + admin role.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');

// All routes require authentication + admin
router.use(authenticate);
router.use(requireAdmin);

// ==================== TRANSACTIONS ====================

/**
 * GET /api/fonepay/transactions
 * List all FonePay transactions (paginated)
 */
router.get('/transactions', async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            panelId,
            startDate,
            endDate,
            search
        } = req.query;

        const skip = (parseInt(page) - 1) * Math.min(parseInt(limit), 100);
        const take = Math.min(parseInt(limit), 100);

        // Build where clause
        const where = {};

        // Only show transactions for this user's panels
        where.userId = req.user.id;

        if (status && status !== 'all') {
            where.status = status;
        }

        if (panelId) {
            where.panelId = panelId;
        }

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
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
        console.error('[FonePay API] List transactions error:', error.message);
        next(error);
    }
});

/**
 * GET /api/fonepay/transactions/:id
 * Get single transaction details
 */
router.get('/transactions/:id', async (req, res, next) => {
    try {
        const transaction = await prisma.fonepayTransaction.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            },
            include: {
                panel: { select: { name: true, alias: true, url: true } }
            }
        });

        if (!transaction) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        // Also get related audit logs
        const auditLogs = await prisma.fonepayAuditLog.findMany({
            where: {
                txnId: transaction.txnId,
                panelId: transaction.panelId
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({
            success: true,
            data: {
                ...transaction,
                auditLogs
            }
        });
    } catch (error) {
        console.error('[FonePay API] Get transaction error:', error.message);
        next(error);
    }
});

/**
 * POST /api/fonepay/transactions/:id/approve
 * Manual approve — MUST log admin ID + timestamp + note
 */
router.post('/transactions/:id/approve', async (req, res, next) => {
    try {
        const { note } = req.body;

        const transaction = await prisma.fonepayTransaction.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            },
            include: {
                panel: true
            }
        });

        if (!transaction) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        if (transaction.status === 'credited') {
            return res.status(400).json({ success: false, error: 'Transaction already credited' });
        }

        if (transaction.status === 'credit_unconfirmed') {
            return res.status(400).json({ success: false, error: 'Transaction funds were already credited (DB sync issue). Do NOT approve again to avoid double-credit.' });
        }

        // Check if panel still exists (could be null if panel was deleted)
        if (!transaction.panel) {
            return res.status(400).json({
                success: false,
                error: 'Panel has been deleted. Cannot credit funds — no API endpoint available.'
            });
        }

        // Try to credit funds via Admin API
        let creditSuccess = false;
        let creditError = null;

        try {
            const adminApiService = require('../services/adminApiService');
            const creditResult = await adminApiService.addFundToUser(
                transaction.panel,
                transaction.panelUsername,
                transaction.amountEntered
            );
            creditSuccess = creditResult.success;
            if (!creditSuccess) creditError = creditResult.error;
        } catch (err) {
            creditError = err.message;
        }

        if (!creditSuccess) {
            // Credit API failed - safe to mark as failed
            await prisma.fonepayTransaction.update({
                where: { id: transaction.id },
                data: {
                    status: 'failed',
                    adminActionBy: req.user.id,
                    adminActionAt: new Date(),
                    adminNote: note || 'Manual approval by admin',
                    rejectionReason: `Manual approve failed: ${creditError}`
                }
            });

            // Audit log
            await prisma.fonepayAuditLog.create({
                data: {
                    whatsappNumber: transaction.whatsappNumber,
                    panelUsername: transaction.panelUsername,
                    panelId: transaction.panelId,
                    userId: transaction.userId,
                    txnId: transaction.txnId,
                    amountEntered: transaction.amountEntered,
                    amountFromApi: transaction.amountVerified,
                    verificationResult: 'manual_approve_credit_failed',
                    failureReason: creditError || null,
                    transactionId: transaction.id
                }
            });

            return res.json({
                success: false,
                data: null,
                message: `Approved but credit failed: ${creditError}`
            });
        }

        // Credit succeeded — update DB (separate try/catch for double-credit protection)
        try {
            const updatedTransaction = await prisma.fonepayTransaction.update({
                where: { id: transaction.id },
                data: {
                    status: 'credited',
                    adminActionBy: req.user.id,
                    adminActionAt: new Date(),
                    adminNote: note || 'Manual approval by admin',
                    creditedAt: new Date(),
                    rejectionReason: null
                }
            });

            // Section 8.2: Create internal wallet record
            try {
                await prisma.walletTransaction.create({
                    data: {
                        userId: transaction.userId,
                        type: 'TOPUP',
                        amount: transaction.amountEntered,
                        status: 'COMPLETED',
                        gateway: 'FONEPAY_WHATSAPP',
                        gatewayRef: transaction.txnId,
                        description: `FonePay Manual Approve — TXN: ${transaction.txnId}, Panel user: ${transaction.panelUsername}`,
                        metadata: JSON.stringify({
                            source: 'WHATSAPP_FONEPAY',
                            txnId: transaction.txnId,
                            panelUsername: transaction.panelUsername,
                            panelId: transaction.panelId,
                            whatsappNumber: transaction.whatsappNumber,
                            fonepayTransactionId: transaction.id,
                            approvedBy: req.user.id
                        })
                    }
                });
            } catch (walletErr) {
                console.error(`[FonePay API] Failed to create wallet record:`, walletErr.message);
            }

            // Audit log: success
            await prisma.fonepayAuditLog.create({
                data: {
                    whatsappNumber: transaction.whatsappNumber,
                    panelUsername: transaction.panelUsername,
                    panelId: transaction.panelId,
                    userId: transaction.userId,
                    txnId: transaction.txnId,
                    amountEntered: transaction.amountEntered,
                    amountFromApi: transaction.amountVerified,
                    verificationResult: 'manual_approve_credited',
                    failureReason: null,
                    transactionId: transaction.id
                }
            });

            res.json({
                success: true,
                data: updatedTransaction,
                message: `Transaction approved and ${transaction.amountEntered} credited to ${transaction.panelUsername}`
            });
        } catch (dbError) {
            // CRITICAL: Funds credited via API but DB update failed
            console.error(`[FonePay API] CRITICAL: Manual approve - funds credited but DB update failed:`, dbError.message);

            try {
                await prisma.fonepayTransaction.update({
                    where: { id: transaction.id },
                    data: {
                        status: 'credit_unconfirmed',
                        adminActionBy: req.user.id,
                        adminActionAt: new Date(),
                        adminNote: note || 'Manual approval by admin',
                        creditedAt: new Date(),
                        rejectionReason: `CRITICAL: Funds credited via API but DB update failed: ${dbError.message}`
                    }
                });
            } catch (e) {
                console.error(`[FonePay API] DOUBLE CRITICAL: Cannot update transaction status:`, e.message);
            }

            try {
                await prisma.fonepayAuditLog.create({
                    data: {
                        whatsappNumber: transaction.whatsappNumber,
                        panelUsername: transaction.panelUsername,
                        panelId: transaction.panelId,
                        userId: transaction.userId,
                        txnId: transaction.txnId,
                        amountEntered: transaction.amountEntered,
                        amountFromApi: transaction.amountVerified,
                        verificationResult: 'credit_unconfirmed',
                        failureReason: `CRITICAL: Manual approve - funds credited but DB failed: ${dbError.message}`,
                        transactionId: transaction.id
                    }
                });
            } catch (auditErr) {
                console.error(`[FonePay API] TRIPLE CRITICAL: Audit log also failed:`, auditErr.message);
            }

            // Still report success since funds WERE credited
            res.json({
                success: true,
                data: null,
                message: `Funds credited but database sync failed. Please check transaction status.`
            });
        }
    } catch (error) {
        console.error('[FonePay API] Approve error:', error.message);
        next(error);
    }
});

/**
 * POST /api/fonepay/transactions/:id/reject
 * Manual reject — MUST log admin ID + timestamp + reason
 */
router.post('/transactions/:id/reject', async (req, res, next) => {
    try {
        const { reason } = req.body;

        if (!reason) {
            return res.status(400).json({ success: false, error: 'Rejection reason is required' });
        }

        const transaction = await prisma.fonepayTransaction.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!transaction) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        if (transaction.status === 'credited') {
            return res.status(400).json({ success: false, error: 'Cannot reject already credited transaction' });
        }

        if (transaction.status === 'credit_unconfirmed') {
            return res.status(400).json({ success: false, error: 'Cannot reject — funds were already credited (DB sync issue). Rejecting would hide the credit.' });
        }

        const updatedTransaction = await prisma.fonepayTransaction.update({
            where: { id: transaction.id },
            data: {
                status: 'rejected',
                adminActionBy: req.user.id,
                adminActionAt: new Date(),
                adminNote: reason,
                rejectionReason: `Manually rejected: ${reason}`
            }
        });

        // Create audit log
        await prisma.fonepayAuditLog.create({
            data: {
                whatsappNumber: transaction.whatsappNumber,
                panelUsername: transaction.panelUsername,
                panelId: transaction.panelId,
                userId: transaction.userId,
                txnId: transaction.txnId,
                amountEntered: transaction.amountEntered,
                amountFromApi: transaction.amountVerified,
                verificationResult: 'manual_reject',
                failureReason: reason,
                transactionId: transaction.id
            }
        });

        res.json({
            success: true,
            data: updatedTransaction,
            message: 'Transaction rejected successfully'
        });
    } catch (error) {
        console.error('[FonePay API] Reject error:', error.message);
        next(error);
    }
});

// ==================== AUDIT LOGS ====================

/**
 * GET /api/fonepay/audit-logs
 * List all audit logs (filterable)
 */
router.get('/audit-logs', async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 50,
            panelId,
            result,
            startDate,
            endDate,
            search
        } = req.query;

        const skip = (parseInt(page) - 1) * Math.min(parseInt(limit), 100);
        const take = Math.min(parseInt(limit), 100);

        const where = { userId: req.user.id };

        if (panelId) where.panelId = panelId;
        if (result && result !== 'all') where.verificationResult = result;

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        if (search) {
            where.OR = [
                { txnId: { contains: search, mode: 'insensitive' } },
                { whatsappNumber: { contains: search } },
                { panelUsername: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [logs, total] = await Promise.all([
            prisma.fonepayAuditLog.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    panel: { select: { name: true, alias: true } }
                }
            }),
            prisma.fonepayAuditLog.count({ where })
        ]);

        res.json({
            success: true,
            data: logs,
            pagination: {
                page: parseInt(page),
                limit: take,
                total,
                totalPages: Math.ceil(total / take)
            }
        });
    } catch (error) {
        console.error('[FonePay API] Audit logs error:', error.message);
        next(error);
    }
});

// ==================== STATS ====================

/**
 * GET /api/fonepay/stats
 * Dashboard stats (today/week/month)
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

        // Get stats for different periods
        const [todayStats, weekStats, monthStats, statusBreakdown, recentFailures] = await Promise.all([
            // Today
            prisma.fonepayTransaction.aggregate({
                where: { userId, createdAt: { gte: todayStart } },
                _count: true,
                _sum: { amountEntered: true }
            }),
            // Week
            prisma.fonepayTransaction.aggregate({
                where: { userId, createdAt: { gte: weekStart } },
                _count: true,
                _sum: { amountEntered: true }
            }),
            // Month
            prisma.fonepayTransaction.aggregate({
                where: { userId, createdAt: { gte: monthStart } },
                _count: true,
                _sum: { amountEntered: true }
            }),
            // Status breakdown (month)
            prisma.fonepayTransaction.groupBy({
                by: ['status'],
                where: { userId, createdAt: { gte: monthStart } },
                _count: true,
                _sum: { amountEntered: true }
            }),
            // Recent failures (for alerts)
            prisma.fonepayAuditLog.count({
                where: {
                    userId,
                    verificationResult: { not: 'success' },
                    createdAt: { gte: todayStart }
                }
            })
        ]);

        // Calculate success rate
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
                })),
                recentFailures
            }
        });
    } catch (error) {
        console.error('[FonePay API] Stats error:', error.message);
        next(error);
    }
});

// ==================== SETTINGS ====================

/**
 * PATCH /api/fonepay/settings
 * Global FonePay settings (via SystemConfig)
 */
router.patch('/settings', async (req, res, next) => {
    try {
        const { enabled, maxAttemptsPerHour, paymentExpiryHours } = req.body;

        const settings = {};
        if (enabled !== undefined) settings.fonepayGlobalEnabled = String(enabled);
        if (maxAttemptsPerHour !== undefined) settings.fonepayMaxAttempts = String(maxAttemptsPerHour);
        if (paymentExpiryHours !== undefined) settings.fonepayExpiryHours = String(paymentExpiryHours);

        // Upsert each setting
        for (const [key, value] of Object.entries(settings)) {
            await prisma.setting.upsert({
                where: {
                    key_userId: { key, userId: req.user.id }
                },
                update: { value },
                create: { key, value, userId: req.user.id }
            });
        }

        res.json({ success: true, message: 'Settings updated' });
    } catch (error) {
        console.error('[FonePay API] Settings error:', error.message);
        next(error);
    }
});

/**
 * GET /api/fonepay/settings
 * Get current FonePay settings
 */
router.get('/settings', async (req, res, next) => {
    try {
        const settings = await prisma.setting.findMany({
            where: {
                userId: req.user.id,
                key: { startsWith: 'fonepay' }
            }
        });

        const settingsMap = {};
        settings.forEach(s => { settingsMap[s.key] = s.value; });

        // Also get per-panel FonePay status
        const panels = await prisma.smmPanel.findMany({
            where: {
                userId: req.user.id,
                panelType: 'RENTAL',
                isActive: true
            },
            select: {
                id: true,
                name: true,
                alias: true,
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
        console.error('[FonePay API] Get settings error:', error.message);
        next(error);
    }
});

/**
 * PATCH /api/fonepay/panels/:panelId/toggle
 * Enable/disable FonePay for a specific panel
 */
router.patch('/panels/:panelId/toggle', async (req, res, next) => {
    try {
        const { enabled, verifyEndpoint, addFundEndpoint } = req.body;

        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: req.params.panelId,
                userId: req.user.id,
                panelType: 'RENTAL'
            }
        });

        if (!panel) {
            return res.status(404).json({ success: false, error: 'Rental panel not found' });
        }

        const updateData = {};
        if (enabled !== undefined) updateData.fonepayEnabled = enabled;
        if (verifyEndpoint !== undefined) updateData.fonepayVerifyEndpoint = verifyEndpoint || null;
        if (addFundEndpoint !== undefined) updateData.fonepayAddFundEndpoint = addFundEndpoint || null;

        const updatedPanel = await prisma.smmPanel.update({
            where: { id: panel.id },
            data: updateData,
            select: {
                id: true,
                name: true,
                alias: true,
                fonepayEnabled: true,
                fonepayVerifyEndpoint: true,
                fonepayAddFundEndpoint: true
            }
        });

        res.json({
            success: true,
            data: updatedPanel,
            message: `FonePay ${updatedPanel.fonepayEnabled ? 'enabled' : 'disabled'} for ${updatedPanel.alias || updatedPanel.name}`
        });
    } catch (error) {
        console.error('[FonePay API] Toggle error:', error.message);
        next(error);
    }
});

module.exports = router;
