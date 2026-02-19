/**
 * Credit Service
 * 
 * Service untuk mengelola kredit/saldo pengguna
 * Deduct credits for messages, check balance, log transactions
 */

const prisma = require('../utils/prisma');

/**
 * Round to 2 decimal places to prevent floating-point drift.
 * e.g. 10.00 - 0.01 = 9.99 (not 9.990000000000002)
 */
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

class CreditService {
    constructor() {
        // Default rates (can be overridden by SystemConfig)
        this.defaultRates = {
            waMessage: parseFloat(process.env.CREDIT_PER_MESSAGE_WA) || 0.01,
            tgMessage: parseFloat(process.env.CREDIT_PER_MESSAGE_TG) || 0.01,
            groupMessage: parseFloat(process.env.CREDIT_PER_GROUP_MESSAGE) || 0.02,
            waLogin: parseFloat(process.env.WA_LOGIN_FEE) || 5,
            tgLogin: parseFloat(process.env.TG_LOGIN_FEE) || 5
        };

        // Cache for system config
        this.configCache = null;
        this.configCacheTime = 0;
        this.configCacheTTL = 15000; // 15 seconds (reduced from 60s for faster price propagation)
    }

    /**
     * Clear config cache — call after admin updates pricing
     */
    clearCache() {
        this.configCache = null;
        this.configCacheTime = 0;
    }

    /**
     * Get system configuration for rates
     */
    async getConfig() {
        const now = Date.now();

        // Use cache if valid
        if (this.configCache && (now - this.configCacheTime) < this.configCacheTTL) {
            return this.configCache;
        }

        // Fetch from database
        const configs = await prisma.systemConfig.findMany({
            where: { category: 'pricing' }
        });

        this.configCache = {};
        for (const config of configs) {
            try {
                this.configCache[config.key] = JSON.parse(config.value);
            } catch {
                this.configCache[config.key] = config.value;
            }
        }

        this.configCacheTime = now;
        return this.configCache;
    }

    /**
     * Get message rate for a platform
     * @param {string} platform - WHATSAPP or TELEGRAM
     * @param {boolean} isGroup - Is this a group message
     * @param {Object} user - User object with custom rates
     */
    async getMessageRate(platform, isGroup = false, user = null) {
        const config = await this.getConfig();

        let rate;

        if (isGroup) {
            rate = user?.customGroupRate || config.group_message_rate || this.defaultRates.groupMessage;
        } else if (platform === 'TELEGRAM') {
            rate = user?.customTgRate || config.tg_message_rate || this.defaultRates.tgMessage;
        } else {
            rate = user?.customWaRate || config.wa_message_rate || this.defaultRates.waMessage;
        }

        // Apply user discount if any
        if (user?.discountRate && user.discountRate > 0) {
            rate = rate * (1 - user.discountRate / 100);
        }

        return round2(parseFloat(rate));
    }

    /**
     * Get user's current balance
     */
    async getBalance(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { creditBalance: true }
        });

        return user?.creditBalance || 0;
    }

    /**
     * Check if user has sufficient balance
     */
    async hasSufficientBalance(userId, amount) {
        const balance = await this.getBalance(userId);
        return balance >= amount;
    }

    /**
     * Deduct credit from user (ATOMIC - Race condition safe)
     * Uses interactive transaction with optimistic locking pattern
     */
    async deductCredit(userId, amount, description, reference = null) {
        // Use interactive transaction for atomicity
        const result = await prisma.$transaction(async (tx) => {
            // Read current balance INSIDE transaction
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: { creditBalance: true }
            });

            if (!user) {
                throw new Error('User not found');
            }

            const balanceBefore = round2(user.creditBalance || 0);
            const newBalance = round2(balanceBefore - amount);

            if (newBalance < 0) {
                throw new Error('Insufficient balance');
            }

            // Update balance atomically
            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: { creditBalance: newBalance }
            });

            // Create transaction record
            const transaction = await tx.creditTransaction.create({
                data: {
                    userId,
                    type: 'DEBIT',
                    amount,
                    balanceBefore,
                    balanceAfter: newBalance,
                    description,
                    reference
                }
            });

            return {
                success: true,
                balanceBefore,
                balanceAfter: newBalance,
                deducted: amount,
                transaction
            };
        }, {
            // Set isolation level for stronger consistency
            isolationLevel: 'Serializable'
        });

        // Low-credit email alert (non-blocking, fire-and-forget)
        const LOW_CREDIT_THRESHOLD = 5;
        if (result.balanceAfter < LOW_CREDIT_THRESHOLD && result.balanceBefore >= LOW_CREDIT_THRESHOLD) {
            try {
                const emailService = require('./emailService');
                const user = await prisma.user.findUnique({
                    where: { id: userId },
                    select: { email: true, username: true }
                });
                if (user && user.email) {
                    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
                    emailService.sendTemplateEmail('low_credit', user.email, {
                        username: user.username,
                        balance: result.balanceAfter.toFixed(2),
                        topupUrl: `${frontendUrl}/wallet`
                    }, userId).catch(() => { });
                }
            } catch (e) { /* email is non-critical */ }
        }

        return result;
    }

    /**
     * Add credit to user (ATOMIC - Race condition safe)
     * Uses interactive transaction with optimistic locking pattern
     */
    async addCredit(userId, amount, description, reference = null) {
        // Use interactive transaction for atomicity
        return await prisma.$transaction(async (tx) => {
            // Read current balance INSIDE transaction
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: { creditBalance: true }
            });

            if (!user) {
                throw new Error('User not found');
            }

            const balanceBefore = round2(user.creditBalance || 0);
            const newBalance = round2(balanceBefore + amount);

            // Update balance atomically
            await tx.user.update({
                where: { id: userId },
                data: { creditBalance: newBalance }
            });

            // Create transaction record
            const transaction = await tx.creditTransaction.create({
                data: {
                    userId,
                    type: 'CREDIT',
                    amount,
                    balanceBefore,
                    balanceAfter: newBalance,
                    description,
                    reference
                }
            });

            return {
                success: true,
                balanceBefore,
                balanceAfter: newBalance,
                added: amount,
                transaction
            };
        }, {
            isolationLevel: 'Serializable'
        });
    }

    /**
     * Charge for sending a message
     * @returns {Object} - { charged, amount, balance }
     */
    async chargeMessage(userId, platform = 'WHATSAPP', isGroup = false, user = null) {
        // Get user details if not provided
        if (!user) {
            user = await prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    creditBalance: true,
                    customWaRate: true,
                    customTgRate: true,
                    customGroupRate: true,
                    discountRate: true,
                    role: true
                }
            });
        }

        // Skip charging for admin roles
        if (user?.role === 'MASTER_ADMIN' || user?.role === 'ADMIN') {
            return {
                charged: false,
                amount: 0,
                balance: user.creditBalance,
                reason: 'admin_exempt'
            };
        }

        // Get rate
        const rate = await this.getMessageRate(platform, isGroup, user);

        // Check balance
        if ((user?.creditBalance || 0) < rate) {
            return {
                charged: false,
                amount: rate,
                balance: user?.creditBalance || 0,
                reason: 'insufficient_balance'
            };
        }

        // Deduct credit — handle race condition where balance changed between check and deduction
        try {
            const result = await this.deductCredit(
                userId,
                rate,
                `${platform} ${isGroup ? 'group' : 'direct'} message`,
                `MSG_${Date.now()}`
            );

            return {
                charged: true,
                amount: rate,
                balance: result.balanceAfter,
                transactionId: result.transaction.id
            };
        } catch (error) {
            if (error.message === 'Insufficient balance') {
                return {
                    charged: false,
                    amount: rate,
                    balance: 0,
                    reason: 'insufficient_balance'
                };
            }
            throw error;
        }
    }

    /**
     * Charge for device login
     */
    async chargeLogin(userId, deviceType = 'WHATSAPP', isFreeLogin = false) {
        if (isFreeLogin) {
            return {
                charged: false,
                amount: 0,
                reason: 'free_login'
            };
        }

        const config = await this.getConfig();
        let fee;

        if (deviceType === 'TELEGRAM') {
            fee = parseFloat(config.tg_login_fee || this.defaultRates.tgLogin);
        } else {
            fee = parseFloat(config.wa_login_fee || this.defaultRates.waLogin);
        }

        // Check balance
        const balance = await this.getBalance(userId);
        if (balance < fee) {
            return {
                charged: false,
                amount: fee,
                balance,
                reason: 'insufficient_balance'
            };
        }

        // Deduct
        const result = await this.deductCredit(
            userId,
            fee,
            `${deviceType} device login fee`,
            `LOGIN_${Date.now()}`
        );

        return {
            charged: true,
            amount: fee,
            balance: result.balanceAfter
        };
    }

    /**
     * Get transaction history
     */
    async getTransactions(userId, options = {}) {
        const { page = 1, limit = 20, type } = options;
        const skip = (page - 1) * limit;

        const where = { userId };
        if (type) {
            where.type = type;
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

        return {
            transactions,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Check if first device login (for free first login feature)
     */
    async isFirstLogin(userId, deviceType = 'WHATSAPP') {
        const count = await prisma.device.count({
            where: {
                userId,
                type: deviceType
            }
        });

        return count === 0;
    }
}

module.exports = new CreditService();
