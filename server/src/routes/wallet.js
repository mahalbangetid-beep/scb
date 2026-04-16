const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { successResponse, createdResponse, paginatedResponse, parsePagination } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const { authenticate, requireAdmin, requireMasterAdmin, getEffectiveUserId } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimiter');
const creditService = require('../services/creditService');
const crypto = require('crypto');

// Rate limiter for payment verification (5 attempts per minute per user)
const paymentVerifyLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many payment verification attempts. Please wait before trying again.',
    keyGenerator: 'user'
});

// All routes require authentication
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

// ==================== WALLET ====================

// GET /api/wallet - Get wallet info
router.get('/', async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.effectiveUserId },
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
                userId: req.effectiveUserId,
                type: 'DEBIT',
                createdAt: { gte: today }
            },
            _sum: { amount: true }
        });

        // Get pending payments
        const pendingPayments = await prisma.payment.count({
            where: {
                userId: req.effectiveUserId,
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

        const where = { userId: req.effectiveUserId };

        if (type) {
            const validTypes = ['CREDIT', 'DEBIT'];
            if (!validTypes.includes(type.toUpperCase())) {
                throw new AppError(`Invalid type filter. Valid values: ${validTypes.join(', ')}`, 400);
            }
            where.type = type.toUpperCase();
        }

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) {
                const d = new Date(startDate);
                if (isNaN(d.getTime())) throw new AppError('Invalid startDate format', 400);
                where.createdAt.gte = d;
            }
            if (endDate) {
                const d = new Date(endDate);
                if (isNaN(d.getTime())) throw new AppError('Invalid endDate format', 400);
                where.createdAt.lte = d;
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
                    userId: req.effectiveUserId,
                    type: 'DEBIT',
                    createdAt: { gte: startOfMonth }
                },
                _sum: { amount: true },
                _count: true
            }),
            prisma.creditTransaction.aggregate({
                where: {
                    userId: req.effectiveUserId,
                    type: 'DEBIT',
                    createdAt: { gte: startOfWeek }
                },
                _sum: { amount: true },
                _count: true
            }),
            prisma.creditTransaction.aggregate({
                where: { userId: req.effectiveUserId, type: 'DEBIT' },
                _sum: { amount: true }
            }),
            prisma.creditTransaction.aggregate({
                where: { userId: req.effectiveUserId, type: 'CREDIT' },
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

        const where = { userId: req.effectiveUserId };
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
                userId: req.effectiveUserId,
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
                userId: req.effectiveUserId
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

// ==================== BINANCE PAYMENT ====================

const binancePayService = require('../services/paymentGateway/binancePay');

// GET /api/wallet/binance/info - Get Binance payment info for customer
router.get('/binance/info', async (req, res, next) => {
    try {
        const config = await binancePayService.getUserConfig(req.effectiveUserId);

        if (!config.binanceEnabled) {
            return successResponse(res, {
                available: false,
                message: 'Binance payment is not enabled'
            });
        }

        // Build instructions — prefer admin-configured, fallback to defaults
        const defaultInstructions = [
            '1. Scan the QR code with your Binance app',
            '2. Transfer the exact amount in ' + config.binanceCurrency,
            '3. Copy the Transaction ID after payment',
            '4. Paste the Transaction ID below and click Verify'
        ];
        let instructions = defaultInstructions;
        if (config.binanceInstructions && config.binanceInstructions.trim()) {
            instructions = config.binanceInstructions.split('\n').filter(line => line.trim());
        }

        successResponse(res, {
            available: true,
            name: config.binanceName || 'Binance',
            binanceId: config.binanceId || '',
            qrUrl: config.binanceQrUrl,
            minAmount: config.binanceMinAmount,
            bonus: config.binanceBonus,
            tax: config.binanceTax || 0,
            currency: config.binanceCurrency,
            instructions
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/wallet/binance/create - Create pending Binance payment
router.post('/binance/create', async (req, res, next) => {
    try {
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            throw new AppError('Invalid amount', 400);
        }

        const config = await binancePayService.getUserConfig(req.effectiveUserId);

        if (!config.binanceEnabled) {
            throw new AppError('Binance payment is not enabled', 400);
        }

        if (amount < config.binanceMinAmount) {
            throw new AppError(`Minimum amount is $${config.binanceMinAmount}`, 400);
        }

        const result = await binancePayService.createPendingPayment(
            req.effectiveUserId,
            amount,
            config.binanceCurrency
        );

        successResponse(res, {
            ...result,
            qrUrl: config.binanceQrUrl,
            bonus: config.binanceBonus,
            instructions: 'Scan QR code, transfer ' + amount + ' ' + config.binanceCurrency + ', then verify with Transaction ID'
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/wallet/binance/verify - Verify Binance transaction
router.post('/binance/verify', paymentVerifyLimiter, async (req, res, next) => {
    try {
        const { paymentId, transactionId } = req.body;

        if (!transactionId) {
            throw new AppError('Transaction ID is required', 400);
        }

        // Get payment record
        const payment = await prisma.payment.findFirst({
            where: {
                id: paymentId,
                userId: req.effectiveUserId,
                method: 'BINANCE',
                status: 'PENDING'
            }
        });

        if (!payment) {
            throw new AppError('Payment not found or already processed', 404);
        }

        // Verify transaction via Binance API
        const verifyResult = await binancePayService.verifyTransaction(
            req.effectiveUserId,
            transactionId,
            payment.amount
        );

        if (!verifyResult.success) {
            return res.status(400).json({
                success: false,
                message: verifyResult.error,
                notFound: verifyResult.notFound
            });
        }

        // Double-spend protection: check if this Binance transactionId was already used
        const existingPayment = await prisma.payment.findFirst({
            where: {
                transactionId: verifyResult.transactionId || transactionId,
                status: 'COMPLETED',
                method: 'BINANCE'
            }
        });

        if (existingPayment) {
            throw new AppError('This Binance transaction has already been used for a previous payment', 400);
        }

        // Complete payment and credit balance
        const completeResult = await binancePayService.completePayment(
            paymentId,
            verifyResult
        );

        successResponse(res, {
            success: true,
            message: completeResult.message,
            credited: completeResult.credited,
            bonus: completeResult.bonus,
            transactionId: verifyResult.transactionId
        });
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

        // Use transaction for atomicity to prevent race condition on usage count
        const result = await prisma.$transaction(async (tx) => {
            // Find voucher inside transaction
            const voucher = await tx.voucher.findUnique({
                where: { code: code.toUpperCase() }
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
                const existingUsage = await tx.creditTransaction.findFirst({
                    where: {
                        userId: req.effectiveUserId,
                        reference: `VOUCHER_${voucher.id}`
                    }
                });

                if (existingUsage) {
                    throw new AppError('You have already used this voucher', 400);
                }
            }

            // Get current user balance
            const user = await tx.user.findUnique({ where: { id: req.effectiveUserId }, select: { creditBalance: true } });
            const balanceBefore = user.creditBalance;
            const balanceAfter = balanceBefore + voucher.amount;

            // Add credit
            await tx.user.update({
                where: { id: req.effectiveUserId },
                data: { creditBalance: { increment: voucher.amount } }
            });

            // Create credit transaction
            await tx.creditTransaction.create({
                data: {
                    userId: req.effectiveUserId,
                    type: 'CREDIT',
                    amount: voucher.amount,
                    balanceBefore,
                    balanceAfter,
                    description: `Voucher redeemed: ${voucher.code}`,
                    reference: `VOUCHER_${voucher.id}`
                }
            });

            // Update voucher usage count atomically
            await tx.voucher.update({
                where: { id: voucher.id },
                data: { usageCount: { increment: 1 } }
            });

            return { amount: voucher.amount, balanceAfter };
        }, {
            isolationLevel: 'Serializable'
        });

        successResponse(res, {
            success: true,
            amount: result.amount,
            newBalance: result.balanceAfter,
            message: `Successfully redeemed $${result.amount.toFixed(2)}`
        });
    } catch (error) {
        next(error);
    }
});

// ==================== ADMIN PAYMENT MANAGEMENT ====================

// GET /api/wallet/admin/payments - List all payments (Admin)
// Merges Payment table (Binance, Manual, etc) + WalletTransaction table (eSewa)
router.get('/admin/payments', requireAdmin, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { status, userId } = req.query;

        // Build filters for Payment table
        const paymentWhere = {};
        if (status) paymentWhere.status = status;
        if (userId) paymentWhere.userId = userId;

        // Build filters for WalletTransaction table
        const walletWhere = {};
        if (status) walletWhere.status = status;
        if (userId) walletWhere.userId = userId;

        // Fetch from both tables in parallel
        const [payments, paymentCount, walletTxs, walletCount] = await Promise.all([
            prisma.payment.findMany({
                where: paymentWhere,
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
                take: limit * 2, // Fetch extra to merge
                skip: 0
            }),
            prisma.payment.count({ where: paymentWhere }),
            prisma.walletTransaction.findMany({
                where: walletWhere,
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
                take: limit * 2,
                skip: 0
            }),
            prisma.walletTransaction.count({ where: walletWhere })
        ]);

        // Normalize WalletTransaction records to match Payment shape
        const normalizedWalletTxs = walletTxs.map(wt => {
            let parsedMeta = {};
            try { parsedMeta = JSON.parse(wt.metadata || '{}'); } catch { parsedMeta = {}; }

            return {
                id: wt.id,
                userId: wt.userId,
                amount: wt.amount,
                currency: 'USD',
                method: wt.gateway || 'UNKNOWN',
                status: wt.status,
                reference: wt.gatewayRef || null,
                transactionId: parsedMeta.refId || wt.gatewayRef || null,
                notes: wt.description || null,
                metadata: wt.metadata,
                completedAt: wt.status === 'COMPLETED' ? wt.updatedAt : null,
                createdAt: wt.createdAt,
                updatedAt: wt.updatedAt,
                user: wt.user,
                // eSewa-specific parsed fields for admin display
                _source: 'wallet_transaction',
                _esewaDetails: wt.gateway === 'ESEWA' ? {
                    transactionCode: parsedMeta.refId || null,
                    nprAmount: parsedMeta.nprAmount || null,
                    usdAmount: parsedMeta.usdAmount || wt.amount,
                    exchangeRate: parsedMeta.exchangeRate || null,
                    taxPercent: parsedMeta.taxPercent || 0,
                    bonusPercent: parsedMeta.bonusPercent || 0,
                    memo: parsedMeta.memo || null,
                    verificationData: parsedMeta.verificationData || null
                } : null
            };
        });

        // Tag Payment records with source
        const taggedPayments = payments.map(p => ({
            ...p,
            _source: 'payment',
            _esewaDetails: null
        }));

        // Merge and sort by createdAt descending
        const merged = [...taggedPayments, ...normalizedWalletTxs]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Apply pagination to merged results
        const total = paymentCount + walletCount;
        const paginatedData = merged.slice(skip, skip + limit);

        paginatedResponse(res, paginatedData, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// GET /api/wallet/admin/payments/export - Export payments as CSV (Section 4.3)
router.get('/admin/payments/export', requireAdmin, async (req, res, next) => {
    try {
        const { status, dateFrom, dateTo, username } = req.query;

        // Build filter for Payment table
        const paymentWhere = {};
        if (status) paymentWhere.status = status;
        if (username) {
            paymentWhere.user = {
                OR: [
                    { username: { contains: username, mode: 'insensitive' } },
                    { name: { contains: username, mode: 'insensitive' } },
                    { email: { contains: username, mode: 'insensitive' } }
                ]
            };
        }
        if (dateFrom || dateTo) {
            paymentWhere.createdAt = {};
            if (dateFrom) paymentWhere.createdAt.gte = new Date(dateFrom);
            if (dateTo) {
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                paymentWhere.createdAt.lte = to;
            }
        }

        // Build same filter for WalletTransaction
        const walletWhere = {};
        if (status) walletWhere.status = status;
        if (username) {
            walletWhere.user = {
                OR: [
                    { username: { contains: username, mode: 'insensitive' } },
                    { name: { contains: username, mode: 'insensitive' } },
                    { email: { contains: username, mode: 'insensitive' } }
                ]
            };
        }
        if (dateFrom || dateTo) {
            walletWhere.createdAt = {};
            if (dateFrom) walletWhere.createdAt.gte = new Date(dateFrom);
            if (dateTo) {
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                walletWhere.createdAt.lte = to;
            }
        }

        const [payments, walletTxs] = await Promise.all([
            prisma.payment.findMany({
                where: paymentWhere,
                include: { user: { select: { username: true, name: true, email: true } } },
                orderBy: { createdAt: 'desc' },
                take: 5000
            }),
            prisma.walletTransaction.findMany({
                where: walletWhere,
                include: { user: { select: { username: true, name: true, email: true } } },
                orderBy: { createdAt: 'desc' },
                take: 5000
            })
        ]);

        // Merge and sort
        const allRecords = [
            ...payments.map(p => ({
                date: new Date(p.createdAt).toISOString(),
                username: p.user?.username || p.user?.name || '',
                email: p.user?.email || '',
                amount: p.amount,
                method: p.method || '',
                status: p.status,
                reference: p.reference || '',
                transactionId: p.transactionId || '',
                source: 'Payment'
            })),
            ...walletTxs.map(w => {
                let meta = {};
                try { meta = JSON.parse(w.metadata || '{}'); } catch {}
                return {
                    date: new Date(w.createdAt).toISOString(),
                    username: w.user?.username || w.user?.name || '',
                    email: w.user?.email || '',
                    amount: w.amount,
                    method: w.gateway || '',
                    status: w.status,
                    reference: w.gatewayRef || '',
                    transactionId: meta.refId || w.gatewayRef || '',
                    source: 'WalletTransaction'
                };
            })
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        // Build CSV
        const csvHeader = 'Date,Username,Email,Amount,Method,Status,Reference,TransactionID,Source\n';
        const csvRows = allRecords.map(r =>
            `"${r.date}","${r.username}","${r.email}",${r.amount},"${r.method}","${r.status}","${r.reference}","${r.transactionId}","${r.source}"`
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="payments_export_${new Date().toISOString().slice(0,10)}.csv"`);
        res.send(csvHeader + csvRows);
    } catch (error) {
        next(error);
    }
});

// POST /api/wallet/admin/manual-adjustment - Manual credit/debit (Section 4.3)
router.post('/admin/manual-adjustment', requireMasterAdmin, async (req, res, next) => {
    try {
        const { userId, amount, type, walletType, description } = req.body;

        if (!userId) throw new AppError('userId is required', 400);
        if (!amount || amount <= 0) throw new AppError('amount must be a positive number', 400);
        if (!type || !['credit', 'debit'].includes(type)) throw new AppError('type must be credit or debit', 400);

        const validWalletTypes = ['USD', 'SUPPORT', 'TELEGRAM', 'WHATSAPP'];
        const wallet = (walletType || 'USD').toUpperCase();
        if (!validWalletTypes.includes(wallet)) throw new AppError(`walletType must be one of: ${validWalletTypes.join(', ')}`, 400);

        // Verify user exists
        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, creditBalance: true }
        });
        if (!targetUser) throw new AppError('User not found', 404);

        // For now, only USD wallet is supported (main creditBalance)
        const balanceBefore = targetUser.creditBalance || 0;
        const adjustmentAmount = type === 'debit' ? -amount : amount;
        const balanceAfter = balanceBefore + adjustmentAmount;

        if (balanceAfter < 0) throw new AppError('Insufficient balance for deduction', 400);

        const result = await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: userId },
                data: { creditBalance: balanceAfter }
            });

            const txRecord = await tx.creditTransaction.create({
                data: {
                    userId,
                    type: type === 'credit' ? 'CREDIT' : 'DEBIT',
                    amount: amount,
                    balanceBefore,
                    balanceAfter,
                    description: description || `Manual ${type} by admin (${req.user.username})`,
                    reference: `MANUAL_${req.user.id}_${Date.now()}`
                }
            });

            // Also create a Payment record so it shows in payment management
            const paymentRecord = await tx.payment.create({
                data: {
                    userId,
                    amount: type === 'credit' ? amount : -amount,
                    method: 'MANUAL',
                    status: 'COMPLETED',
                    reference: txRecord.reference,
                    transactionId: `MANUAL-${Date.now()}`,
                    completedAt: new Date(),
                    processedAt: new Date(),
                    processedBy: req.user.id,
                    notes: description || `Manual ${type} by ${req.user.username}`
                }
            });

            return { txRecord, paymentRecord, balanceAfter };
        });

        // Send payment notification (fire-and-forget)
        try {
            const userNotificationService = require('../services/userNotificationService');
            userNotificationService.sendPaymentNotification(req.effectiveUserId, targetUser.username, {
                amount, type, method: 'Manual Admin',
                newBalance: result.balanceAfter, currency: 'USD'
            }).catch(() => {});
        } catch {}

        successResponse(res, {
            success: true,
            user: targetUser.username,
            type,
            amount,
            walletType: wallet,
            balanceBefore,
            balanceAfter: result.balanceAfter,
            transactionId: result.txRecord.id
        }, `Manual ${type} of $${amount.toFixed(2)} applied to ${targetUser.username}`);
    } catch (error) {
        next(error);
    }
});

// GET /api/wallet/admin/transaction-logs - Credit transaction logs (Section 4.4)
router.get('/admin/transaction-logs', requireAdmin, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { type, startDate, endDate } = req.query;

        const where = {};
        if (type && ['CREDIT', 'DEBIT'].includes(type.toUpperCase())) {
            where.type = type.toUpperCase();
        }
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const [transactions, total, creditSum, debitSum] = await Promise.all([
            prisma.creditTransaction.findMany({
                where,
                include: {
                    user: {
                        select: { id: true, username: true, name: true, email: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.creditTransaction.count({ where }),
            prisma.creditTransaction.aggregate({
                where: { ...where, type: 'CREDIT' },
                _sum: { amount: true }
            }),
            prisma.creditTransaction.aggregate({
                where: { ...where, type: 'DEBIT' },
                _sum: { amount: true }
            })
        ]);

        res.json({
            success: true,
            data: transactions,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            stats: {
                totalCredit: creditSum._sum.amount || 0,
                totalDebit: debitSum._sum.amount || 0,
                count: total
            }
        });
    } catch (error) {
        next(error);
    }
});

// PUT /api/wallet/admin/payments/:id/approve - Approve payment (Admin)
router.put('/admin/payments/:id/approve', requireAdmin, async (req, res, next) => {
    try {
        // Use transaction for atomicity to prevent double-credit
        const result = await prisma.$transaction(async (tx) => {
            const payment = await tx.payment.findUnique({
                where: { id: req.params.id }
            });

            if (!payment) {
                throw new AppError('Payment not found', 404);
            }

            if (payment.status !== 'PENDING') {
                throw new AppError('Payment is not pending', 400);
            }

            // Update payment status FIRST to prevent re-approval
            await tx.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'COMPLETED',
                    completedAt: new Date(),
                    processedAt: new Date(),
                    processedBy: req.effectiveUserId
                }
            });

            // Then add credit to user (within the same transaction)
            const user = await tx.user.findUnique({
                where: { id: payment.userId },
                select: { creditBalance: true }
            });

            const balanceBefore = user?.creditBalance || 0;
            const balanceAfter = balanceBefore + payment.amount;

            await tx.user.update({
                where: { id: payment.userId },
                data: { creditBalance: { increment: payment.amount } }
            });

            await tx.creditTransaction.create({
                data: {
                    userId: payment.userId,
                    type: 'CREDIT',
                    amount: payment.amount,
                    balanceBefore,
                    balanceAfter,
                    description: `Payment approved: ${payment.reference}`,
                    reference: `PAYMENT_${payment.id}`
                }
            });

            return { payment, balanceAfter };
        });

        successResponse(res, {
            success: true,
            payment: { ...result.payment, status: 'COMPLETED' },
            userBalance: result.balanceAfter
        });

        // Section 5.3: Send payment notification to user (fire-and-forget)
        try {
            const userNotificationService = require('../services/userNotificationService');
            // Use admin's userId (req.effectiveUserId) for device & mapping lookup
            // The admin owns the devices and mappings, not the payment recipient
            const payUser = await prisma.user.findUnique({ where: { id: result.payment.userId }, select: { username: true } });
            if (payUser) {
                userNotificationService.sendPaymentNotification(req.effectiveUserId, payUser.username, {
                    amount: result.payment.amount, type: 'credit',
                    method: result.payment.method || 'Manual', newBalance: result.balanceAfter, currency: 'USD'
                }).catch(e => console.log('[Wallet] Payment notification failed:', e.message));
            }
        } catch (notifErr) { /* non-critical */ }
    } catch (error) {
        next(error);
    }
});

// PUT /api/wallet/admin/payments/:id/reject - Reject payment (Admin)
router.put('/admin/payments/:id/reject', requireAdmin, async (req, res, next) => {
    try {
        const { reason } = req.body;

        await prisma.$transaction(async (tx) => {
            const payment = await tx.payment.findUnique({
                where: { id: req.params.id }
            });

            if (!payment) {
                throw new AppError('Payment not found', 404);
            }

            if (payment.status !== 'PENDING') {
                throw new AppError('Payment is not pending', 400);
            }

            // Safe parse existing metadata
            let existingMeta = {};
            try {
                existingMeta = JSON.parse(payment.metadata || '{}');
            } catch {
                existingMeta = {};
            }

            await tx.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'REJECTED',
                    processedAt: new Date(),
                    processedBy: req.effectiveUserId,
                    metadata: JSON.stringify({
                        ...existingMeta,
                        rejectReason: reason
                    })
                }
            });
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

        if (typeof amount !== 'number' || amount <= 0) {
            throw new AppError('Amount must be a positive number', 400);
        }

        // Check if code exists (normalize to uppercase to match storage format)
        const normalizedCode = code.toUpperCase();
        const existing = await prisma.voucher.findUnique({ where: { code: normalizedCode } });
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
        // Handle unique constraint violation (TOCTOU race condition)
        if (error.code === 'P2002') {
            return next(new AppError('Voucher code already exists', 400));
        }
        next(error);
    }
});

// PUT /api/wallet/admin/vouchers/:id - Update voucher (Admin)
router.put('/admin/vouchers/:id', requireAdmin, async (req, res, next) => {
    try {
        const { amount, maxUsage, expiresAt, isActive, singleUsePerUser } = req.body;

        if (amount !== undefined && (typeof amount !== 'number' || amount <= 0)) {
            throw new AppError('Amount must be a positive number', 400);
        }

        if (maxUsage !== undefined && maxUsage !== null && (typeof maxUsage !== 'number' || maxUsage < 1)) {
            throw new AppError('Max usage must be at least 1', 400);
        }

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

        if (typeof amount !== 'number' || amount <= 0) {
            throw new AppError('Amount must be a positive number', 400);
        }

        if (count < 1 || count > 100) {
            throw new AppError('Count must be between 1 and 100', 400);
        }

        // Generate unique codes with collision protection
        const codePrefix = prefix || 'VOUCHER';
        const generatedCodes = new Set();
        const maxRetries = 3;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            generatedCodes.clear();

            // Generate codes ensuring no in-batch duplicates
            while (generatedCodes.size < count) {
                const code = `${codePrefix}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
                generatedCodes.add(code);
            }

            // Check for existing codes in database
            const codes = Array.from(generatedCodes);
            const existingCodes = await prisma.voucher.findMany({
                where: { code: { in: codes } },
                select: { code: true }
            });

            if (existingCodes.length === 0) {
                // No collisions — proceed with creation
                const voucherCreateOps = codes.map(code =>
                    prisma.voucher.create({
                        data: {
                            code,
                            amount,
                            maxUsage: maxUsagePerVoucher || 1,
                            expiresAt: expiresAt ? new Date(expiresAt) : null,
                            singleUsePerUser: singleUsePerUser !== false,
                            isActive: true,
                            createdBy: req.user.id
                        }
                    })
                );

                const vouchers = await prisma.$transaction(voucherCreateOps);

                return createdResponse(res, {
                    count: vouchers.length,
                    vouchers: vouchers.map(v => ({ code: v.code, amount: v.amount }))
                }, `Generated ${vouchers.length} vouchers`);
            }

            // Collision found — retry with new codes
            console.warn(`[Voucher] Code collision on attempt ${attempt + 1}, retrying...`);
        }

        throw new AppError('Failed to generate unique voucher codes after retries. Please try again.', 500);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
