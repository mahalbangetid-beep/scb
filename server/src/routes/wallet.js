const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { successResponse, createdResponse, paginatedResponse, parsePagination } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const { authenticate, requireAdmin, requireMasterAdmin } = require('../middleware/auth');
const creditService = require('../services/creditService');
const crypto = require('crypto');

// All routes require authentication
router.use(authenticate);

// ==================== WALLET ====================

// GET /api/wallet - Get wallet info
router.get('/', async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                creditBalance: true,
                discountRate: true,
                customWaRate: true,
                customTgRate: true,
                customGroupRate: true
            }
        });

        const rates = {
            waMessage: await creditService.getMessageRate('WHATSAPP', false, user),
            tgMessage: await creditService.getMessageRate('TELEGRAM', false, user),
            groupMessage: await creditService.getMessageRate('WHATSAPP', true, user)
        };

        // Get today's usage
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayUsage = await prisma.creditTransaction.aggregate({
            where: {
                userId: req.user.id,
                type: 'DEBIT',
                createdAt: { gte: today }
            },
            _sum: { amount: true }
        });

        // Get pending payments
        const pendingPayments = await prisma.payment.count({
            where: {
                userId: req.user.id,
                status: 'PENDING'
            }
        });

        successResponse(res, {
            balance: user.creditBalance || 0,
            discountRate: user.discountRate || 0,
            rates,
            todayUsage: todayUsage._sum.amount || 0,
            pendingPayments
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/wallet/transactions - Get transaction history
router.get('/transactions', async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { type, startDate, endDate } = req.query;

        const where = { userId: req.user.id };

        if (type) {
            where.type = type;
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

        const [transactions, total] = await Promise.all([
            prisma.creditTransaction.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.creditTransaction.count({ where })
        ]);

        paginatedResponse(res, transactions, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// GET /api/wallet/summary - Get usage summary
router.get('/summary', async (req, res, next) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const [monthlyUsage, weeklyUsage, totalDebit, totalCredit] = await Promise.all([
            prisma.creditTransaction.aggregate({
                where: {
                    userId: req.user.id,
                    type: 'DEBIT',
                    createdAt: { gte: startOfMonth }
                },
                _sum: { amount: true },
                _count: true
            }),
            prisma.creditTransaction.aggregate({
                where: {
                    userId: req.user.id,
                    type: 'DEBIT',
                    createdAt: { gte: startOfWeek }
                },
                _sum: { amount: true },
                _count: true
            }),
            prisma.creditTransaction.aggregate({
                where: { userId: req.user.id, type: 'DEBIT' },
                _sum: { amount: true }
            }),
            prisma.creditTransaction.aggregate({
                where: { userId: req.user.id, type: 'CREDIT' },
                _sum: { amount: true }
            })
        ]);

        successResponse(res, {
            monthly: {
                amount: monthlyUsage._sum.amount || 0,
                transactions: monthlyUsage._count
            },
            weekly: {
                amount: weeklyUsage._sum.amount || 0,
                transactions: weeklyUsage._count
            },
            allTime: {
                totalSpent: totalDebit._sum.amount || 0,
                totalDeposited: totalCredit._sum.amount || 0
            }
        });
    } catch (error) {
        next(error);
    }
});

// ==================== PAYMENTS ====================

// GET /api/wallet/payments - Get payment history
router.get('/payments', async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { status } = req.query;

        const where = { userId: req.user.id };
        if (status) {
            where.status = status;
        }

        const [payments, total] = await Promise.all([
            prisma.payment.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.payment.count({ where })
        ]);

        paginatedResponse(res, payments, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// POST /api/wallet/payments - Create payment request
router.post('/payments', async (req, res, next) => {
    try {
        const { amount, method, metadata } = req.body;

        if (!amount || amount <= 0) {
            throw new AppError('Invalid amount', 400);
        }

        if (!method) {
            throw new AppError('Payment method is required', 400);
        }

        const validMethods = ['BANK_TRANSFER', 'CRYPTO', 'BINANCE', 'CRYPTOMUS', 'MANUAL'];
        if (!validMethods.includes(method)) {
            throw new AppError('Invalid payment method', 400);
        }

        // Generate payment reference
        const reference = `PAY-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        const payment = await prisma.payment.create({
            data: {
                userId: req.user.id,
                amount,
                method,
                status: 'PENDING',
                reference,
                metadata: metadata ? JSON.stringify(metadata) : null
            }
        });

        // TODO: Integrate with payment gateways based on method
        // For now, payments are manual approval

        createdResponse(res, payment, 'Payment request created');
    } catch (error) {
        next(error);
    }
});

// GET /api/wallet/payments/:id - Get payment details
router.get('/payments/:id', async (req, res, next) => {
    try {
        const payment = await prisma.payment.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!payment) {
            throw new AppError('Payment not found', 404);
        }

        successResponse(res, payment);
    } catch (error) {
        next(error);
    }
});

// ==================== VOUCHERS ====================

// POST /api/wallet/vouchers/redeem - Redeem voucher
router.post('/vouchers/redeem', async (req, res, next) => {
    try {
        const { code } = req.body;

        if (!code) {
            throw new AppError('Voucher code is required', 400);
        }

        // Find voucher
        const voucher = await prisma.voucher.findUnique({
            where: { code }
        });

        if (!voucher) {
            throw new AppError('Invalid voucher code', 400);
        }

        if (!voucher.isActive) {
            throw new AppError('This voucher is no longer active', 400);
        }

        if (voucher.expiresAt && voucher.expiresAt < new Date()) {
            throw new AppError('This voucher has expired', 400);
        }

        if (voucher.maxUsage && voucher.usageCount >= voucher.maxUsage) {
            throw new AppError('This voucher has reached its usage limit', 400);
        }

        // Check if user already used this voucher (if single use per user)
        if (voucher.singleUsePerUser) {
            const existingUsage = await prisma.creditTransaction.findFirst({
                where: {
                    userId: req.user.id,
                    reference: `VOUCHER_${voucher.id}`
                }
            });

            if (existingUsage) {
                throw new AppError('You have already used this voucher', 400);
            }
        }

        // Add credit
        const result = await creditService.addCredit(
            req.user.id,
            voucher.amount,
            `Voucher redeemed: ${voucher.code}`,
            `VOUCHER_${voucher.id}`
        );

        // Update voucher usage
        await prisma.voucher.update({
            where: { id: voucher.id },
            data: {
                usageCount: { increment: 1 }
            }
        });

        successResponse(res, {
            success: true,
            amount: voucher.amount,
            newBalance: result.balanceAfter,
            message: `Successfully redeemed $${voucher.amount.toFixed(2)}`
        });
    } catch (error) {
        next(error);
    }
});

// ==================== ADMIN PAYMENT MANAGEMENT ====================

// GET /api/wallet/admin/payments - List all payments (Admin)
router.get('/admin/payments', requireAdmin, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { status, userId } = req.query;

        const where = {};
        if (status) where.status = status;
        if (userId) where.userId = userId;

        const [payments, total] = await Promise.all([
            prisma.payment.findMany({
                where,
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            name: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.payment.count({ where })
        ]);

        paginatedResponse(res, payments, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// PUT /api/wallet/admin/payments/:id/approve - Approve payment (Admin)
router.put('/admin/payments/:id/approve', requireAdmin, async (req, res, next) => {
    try {
        const payment = await prisma.payment.findUnique({
            where: { id: req.params.id }
        });

        if (!payment) {
            throw new AppError('Payment not found', 404);
        }

        if (payment.status !== 'PENDING') {
            throw new AppError('Payment is not pending', 400);
        }

        // Add credit to user
        const result = await creditService.addCredit(
            payment.userId,
            payment.amount,
            `Payment approved: ${payment.reference}`,
            `PAYMENT_${payment.id}`
        );

        // Update payment status
        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: 'COMPLETED',
                processedAt: new Date(),
                processedBy: req.user.id
            }
        });

        successResponse(res, {
            success: true,
            payment: { ...payment, status: 'COMPLETED' },
            userBalance: result.balanceAfter
        });
    } catch (error) {
        next(error);
    }
});

// PUT /api/wallet/admin/payments/:id/reject - Reject payment (Admin)
router.put('/admin/payments/:id/reject', requireAdmin, async (req, res, next) => {
    try {
        const { reason } = req.body;

        const payment = await prisma.payment.findUnique({
            where: { id: req.params.id }
        });

        if (!payment) {
            throw new AppError('Payment not found', 404);
        }

        if (payment.status !== 'PENDING') {
            throw new AppError('Payment is not pending', 400);
        }

        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: 'REJECTED',
                processedAt: new Date(),
                processedBy: req.user.id,
                metadata: JSON.stringify({
                    ...JSON.parse(payment.metadata || '{}'),
                    rejectReason: reason
                })
            }
        });

        successResponse(res, null, 'Payment rejected');
    } catch (error) {
        next(error);
    }
});

// ==================== ADMIN VOUCHER MANAGEMENT ====================

// GET /api/wallet/admin/vouchers - List vouchers (Admin)
router.get('/admin/vouchers', requireAdmin, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const [vouchers, total] = await Promise.all([
            prisma.voucher.findMany({
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.voucher.count()
        ]);

        paginatedResponse(res, vouchers, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// POST /api/wallet/admin/vouchers - Create voucher (Admin)
router.post('/admin/vouchers', requireAdmin, async (req, res, next) => {
    try {
        const { code, amount, maxUsage, expiresAt, singleUsePerUser } = req.body;

        if (!code || !amount) {
            throw new AppError('Code and amount are required', 400);
        }

        // Check if code exists
        const existing = await prisma.voucher.findUnique({ where: { code } });
        if (existing) {
            throw new AppError('Voucher code already exists', 400);
        }

        const voucher = await prisma.voucher.create({
            data: {
                code: code.toUpperCase(),
                amount,
                maxUsage: maxUsage || null,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                singleUsePerUser: singleUsePerUser === true,
                isActive: true,
                createdBy: req.user.id
            }
        });

        createdResponse(res, voucher, 'Voucher created');
    } catch (error) {
        next(error);
    }
});

// PUT /api/wallet/admin/vouchers/:id - Update voucher (Admin)
router.put('/admin/vouchers/:id', requireAdmin, async (req, res, next) => {
    try {
        const { amount, maxUsage, expiresAt, isActive, singleUsePerUser } = req.body;

        const voucher = await prisma.voucher.update({
            where: { id: req.params.id },
            data: {
                ...(amount !== undefined && { amount }),
                ...(maxUsage !== undefined && { maxUsage }),
                ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
                ...(isActive !== undefined && { isActive }),
                ...(singleUsePerUser !== undefined && { singleUsePerUser })
            }
        });

        successResponse(res, voucher, 'Voucher updated');
    } catch (error) {
        next(error);
    }
});

// DELETE /api/wallet/admin/vouchers/:id - Delete voucher (Admin)
router.delete('/admin/vouchers/:id', requireAdmin, async (req, res, next) => {
    try {
        await prisma.voucher.delete({
            where: { id: req.params.id }
        });

        successResponse(res, null, 'Voucher deleted');
    } catch (error) {
        next(error);
    }
});

// POST /api/wallet/admin/vouchers/generate - Generate bulk vouchers (Admin)
router.post('/admin/vouchers/generate', requireAdmin, async (req, res, next) => {
    try {
        const { prefix, amount, count, maxUsagePerVoucher, expiresAt, singleUsePerUser } = req.body;

        if (!amount || !count) {
            throw new AppError('Amount and count are required', 400);
        }

        if (count > 100) {
            throw new AppError('Maximum 100 vouchers per batch', 400);
        }

        const vouchers = [];
        for (let i = 0; i < count; i++) {
            const code = `${prefix || 'VOUCHER'}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

            const voucher = await prisma.voucher.create({
                data: {
                    code,
                    amount,
                    maxUsage: maxUsagePerVoucher || 1,
                    expiresAt: expiresAt ? new Date(expiresAt) : null,
                    singleUsePerUser: singleUsePerUser !== false,
                    isActive: true,
                    createdBy: req.user.id
                }
            });
            vouchers.push(voucher);
        }

        createdResponse(res, {
            count: vouchers.length,
            vouchers: vouchers.map(v => ({ code: v.code, amount: v.amount }))
        }, `Generated ${vouchers.length} vouchers`);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
