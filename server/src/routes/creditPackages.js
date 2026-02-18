/**
 * Credit Package Routes
 * 
 * API endpoints for credit package management
 * From clientupdate2.md: Message credit packages
 */

const express = require('express');
const router = express.Router();
const creditPackageService = require('../services/creditPackageService');
const { authenticate, requireRole } = require('../middleware/auth');
const { successResponse, createdResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');

// All routes require authentication
router.use(authenticate);

// ==================== USER ROUTES ====================

/**
 * GET /api/credit-packages
 * Get all active credit packages (for purchase)
 * Query: ?category=support|whatsapp_marketing|telegram_marketing (optional filter)
 */
router.get('/', async (req, res, next) => {
    try {
        const { category } = req.query;
        // Validate category if provided
        const validCategories = ['support', 'whatsapp_marketing', 'telegram_marketing'];
        const validatedCategory = category && validCategories.includes(category) ? category : null;
        const packages = await creditPackageService.getPackagesWithValues(validatedCategory);
        successResponse(res, packages);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/credit-packages/featured
 * Get featured package
 */
router.get('/featured', async (req, res, next) => {
    try {
        const pkg = await creditPackageService.getFeatured();
        if (pkg) {
            successResponse(res, {
                ...pkg,
                ...creditPackageService.calculateValue(pkg)
            });
        } else {
            successResponse(res, null);
        }
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/credit-packages/:id
 * Get a single package details
 */
router.get('/:id', async (req, res, next) => {
    try {
        const pkg = await creditPackageService.getById(req.params.id);

        if (!pkg) {
            throw new AppError('Package not found', 404);
        }

        successResponse(res, {
            ...pkg,
            ...creditPackageService.calculateValue(pkg)
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/credit-packages/:id/purchase
 * Purchase a credit package — deducts from wallet balance and grants message credits atomically
 */
router.post('/:id/purchase', async (req, res, next) => {
    try {
        const { quantity } = req.body;
        const packageId = req.params.id;
        const userId = req.user.id;

        const pkg = await creditPackageService.getById(packageId);
        if (!pkg) {
            throw new AppError('Package not found', 404);
        }

        if (!pkg.isActive) {
            throw new AppError('This package is no longer available', 400);
        }

        const qty = quantity || 1;

        // Validate quantity limits
        if (qty < (pkg.minPurchase || 1)) {
            throw new AppError(`Minimum purchase quantity is ${pkg.minPurchase}`, 400);
        }
        if (pkg.maxPurchase && qty > pkg.maxPurchase) {
            throw new AppError(`Maximum purchase quantity is ${pkg.maxPurchase}`, 400);
        }

        const totalPrice = pkg.price * qty;
        const baseCredits = pkg.credits * qty;
        const bonusCredits = (pkg.bonusCredits || 0) * qty;
        const totalCredits = baseCredits + bonusCredits;

        const prisma = require('../utils/prisma');

        // Atomic transaction: check balance → deduct → grant credits → log
        const result = await prisma.$transaction(async (tx) => {
            // 1. Read balance inside transaction for atomicity
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: { creditBalance: true, messageCredits: true }
            });

            if (!user) {
                throw new AppError('User not found', 404);
            }

            const walletBalance = user.creditBalance || 0;
            if (walletBalance < totalPrice) {
                throw new AppError(
                    `Insufficient wallet balance. You need $${totalPrice.toFixed(2)} but have $${walletBalance.toFixed(2)}. Please top up first.`,
                    400
                );
            }

            const balanceBefore = walletBalance;
            const balanceAfter = balanceBefore - totalPrice;
            const creditsBefore = user.messageCredits || 0;
            const creditsAfter = creditsBefore + totalCredits;

            // 2. Deduct wallet balance
            await tx.user.update({
                where: { id: userId },
                data: {
                    creditBalance: { decrement: totalPrice },
                    messageCredits: { increment: totalCredits }
                }
            });

            // 3. Log the wallet deduction transaction
            await tx.creditTransaction.create({
                data: {
                    userId,
                    type: 'DEBIT',
                    amount: totalPrice,
                    description: `Purchased ${qty}x ${pkg.name} Package (${pkg.category || 'support'}) — ${totalCredits.toLocaleString()} credits`,
                    balanceBefore,
                    balanceAfter
                }
            });

            // 4. Log the credit addition (if MessageCreditTransaction model exists)
            try {
                await tx.messageCreditTransaction.create({
                    data: {
                        userId,
                        type: 'CREDIT',
                        amount: totalCredits,
                        description: `${qty}x ${pkg.name} Package — ${baseCredits.toLocaleString()} base + ${bonusCredits.toLocaleString()} bonus`,
                        balanceBefore: creditsBefore,
                        balanceAfter: creditsAfter,
                        reference: `PKG_${packageId}_${Date.now()}`
                    }
                });
            } catch (e) {
                // MessageCreditTransaction model may not exist yet
                console.log('[CreditPackage] MessageCreditTransaction logging skipped:', e.message);
            }

            // 5. Create completed payment record
            const payment = await tx.payment.create({
                data: {
                    userId,
                    amount: totalPrice,
                    method: 'WALLET',
                    status: 'COMPLETED',
                    completedAt: new Date(),
                    reference: `PKG-${packageId.slice(-6)}-${Date.now()}`,
                    metadata: JSON.stringify({
                        type: 'CREDIT_PACKAGE',
                        packageId,
                        packageName: pkg.name,
                        category: pkg.category || 'support',
                        quantity: qty,
                        totalCredits,
                        baseCredits,
                        bonusCredits
                    })
                }
            });

            return {
                paymentId: payment.id,
                packageName: pkg.name,
                quantity: qty,
                totalPrice,
                baseCredits,
                bonusCredits,
                totalCredits,
                newWalletBalance: balanceAfter,
                newCreditBalance: creditsAfter
            };
        }, {
            isolationLevel: 'Serializable'
        });

        console.log(`[CreditPackage] User ${userId} purchased ${qty}x ${pkg.name}: -$${totalPrice} → +${totalCredits} credits`);

        successResponse(res, {
            ...result,
            message: `Successfully purchased ${pkg.name}! ${totalCredits.toLocaleString()} credits added to your account.`
        });
    } catch (error) {
        next(error);
    }
});


// ==================== ADMIN ROUTES ====================

/**
 * GET /api/credit-packages/admin/all
 * Get all packages including inactive (admin only)
 */
router.get('/admin/all', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const packages = await creditPackageService.getAllPackages();

        // Add calculated values
        const packagesWithValues = packages.map(pkg => ({
            ...pkg,
            ...creditPackageService.calculateValue(pkg)
        }));

        successResponse(res, packagesWithValues);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/credit-packages/admin
 * Create a new package (admin only)
 */
router.post('/admin', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const pkg = await creditPackageService.create(req.body, req.user.id);
        createdResponse(res, pkg, 'Package created successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/credit-packages/admin/:id
 * Update a package (admin only)
 */
router.put('/admin/:id', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const pkg = await creditPackageService.update(req.params.id, req.body);
        successResponse(res, pkg, 'Package updated successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/credit-packages/admin/:id
 * Delete a package (admin only)
 */
router.delete('/admin/:id', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        await creditPackageService.delete(req.params.id);
        successResponse(res, null, 'Package deleted successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/credit-packages/admin/:id/toggle
 * Toggle package active status (admin only)
 */
router.post('/admin/:id/toggle', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const pkg = await creditPackageService.toggleActive(req.params.id);
        successResponse(res, pkg, `Package ${pkg.isActive ? 'activated' : 'deactivated'}`);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/credit-packages/admin/:id/feature
 * Toggle featured status (admin only)
 */
router.post('/admin/:id/feature', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const pkg = await creditPackageService.toggleFeatured(req.params.id);
        successResponse(res, pkg, `Package ${pkg.isFeatured ? 'featured' : 'unfeatured'}`);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/credit-packages/admin/:id/grant
 * Grant package credits to a user (admin only)
 */
router.post('/admin/:id/grant', requireRole(['ADMIN', 'MASTER_ADMIN']), async (req, res, next) => {
    try {
        const { userId, quantity, note } = req.body;

        if (!userId) {
            throw new AppError('User ID is required', 400);
        }

        const result = await creditPackageService.purchase(
            userId,
            req.params.id,
            quantity || 1,
            `ADMIN_GRANT_${req.user.id}_${Date.now()}`
        );

        // Log activity
        const prisma = require('../utils/prisma');
        await prisma.activityLog.create({
            data: {
                userId: req.user.id,
                action: 'CREDIT_GRANTED',
                category: 'ADMIN',
                details: JSON.stringify({
                    targetUser: userId,
                    packageId: req.params.id,
                    packageName: result.packageName,
                    credits: result.totalCredits,
                    note: note || null
                }),
                ipAddress: req.ip
            }
        });

        successResponse(res, result, `Granted ${result.totalCredits} credits to user`);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
