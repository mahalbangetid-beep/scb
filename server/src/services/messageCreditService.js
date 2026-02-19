/**
 * Message Credit Service
 * 
 * Service untuk mengelola Message Credits (terpisah dari Dollar balance)
 * - 1 Credit = 1 Message sent by bot
 * - Users get credits by: conversion from dollar, signup bonus, admin grant
 * - Credits are deducted when bot sends messages
 */

const prisma = require('../utils/prisma');

class MessageCreditService {
    constructor() {
        // Default configuration
        this.defaults = {
            freeSignupCredits: parseInt(process.env.FREE_SIGNUP_CREDITS) || 100,
            conversionRate: parseInt(process.env.CREDIT_CONVERSION_RATE) || 100, // $1 = 100 credits
            creditsPerMessage: parseInt(process.env.CREDITS_PER_MESSAGE) || 1
        };

        // Cache for system config
        this.configCache = null;
        this.configCacheTime = 0;
        this.configCacheTTL = 15000; // 15 seconds (reduced from 60s for faster propagation)
    }

    /**
     * Clear config cache — call after admin updates pricing
     */
    clearCache() {
        this.configCache = null;
        this.configCacheTime = 0;
    }

    /**
     * Get system configuration for message credits
     */
    async getConfig() {
        const now = Date.now();

        // Use cache if valid
        if (this.configCache && (now - this.configCacheTime) < this.configCacheTTL) {
            return this.configCache;
        }

        // Fetch from database
        const configs = await prisma.systemConfig.findMany({
            where: {
                OR: [
                    { category: 'message_credits' },
                    { category: 'pricing' }
                ]
            }
        });

        this.configCache = { ...this.defaults };
        for (const config of configs) {
            try {
                if (config.key === 'free_signup_credits') {
                    this.configCache.freeSignupCredits = parseInt(config.value);
                } else if (config.key === 'credit_conversion_rate') {
                    this.configCache.conversionRate = parseInt(config.value);
                } else if (config.key === 'credits_per_message') {
                    this.configCache.creditsPerMessage = parseInt(config.value);
                }
            } catch {
                // Keep default
            }
        }

        this.configCacheTime = now;
        return this.configCache;
    }

    /**
     * Get user's message credits balance
     */
    async getBalance(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { messageCredits: true }
        });

        return user?.messageCredits || 0;
    }

    /**
     * Check if user has sufficient message credits
     */
    async hasSufficientCredits(userId, amount = 1) {
        const balance = await this.getBalance(userId);
        return balance >= amount;
    }

    /**
     * Give free signup credits to new user (ATOMIC)
     * @param {string} userId - User ID
     * @returns {Object} Result with credits added
     */
    async giveSignupCredits(userId) {
        const config = await this.getConfig();
        const freeCredits = config.freeSignupCredits;

        return await prisma.$transaction(async (tx) => {
            // Check if already given
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: { messageCredits: true, freeCreditsGiven: true }
            });

            if (!user) {
                throw new Error('User not found');
            }

            if (user.freeCreditsGiven) {
                return {
                    success: false,
                    reason: 'already_given',
                    balance: user.messageCredits
                };
            }

            const balanceBefore = user.messageCredits || 0;
            const newBalance = balanceBefore + freeCredits;

            // Update user
            await tx.user.update({
                where: { id: userId },
                data: {
                    messageCredits: newBalance,
                    freeCreditsGiven: true
                }
            });

            // Create transaction record
            await tx.messageCreditTransaction.create({
                data: {
                    userId,
                    type: 'SIGNUP_BONUS',
                    amount: freeCredits,
                    balanceBefore,
                    balanceAfter: newBalance,
                    description: `Free signup bonus: ${freeCredits} message credits`,
                    reference: `SIGNUP_${Date.now()}`
                }
            });

            console.log(`[MessageCreditService] Gave ${freeCredits} signup credits to user ${userId}`);

            return {
                success: true,
                creditsAdded: freeCredits,
                balance: newBalance
            };
        }, {
            isolationLevel: 'Serializable'
        });
    }

    /**
     * Convert dollar balance to message credits (ATOMIC)
     * @param {string} userId - User ID
     * @param {number} dollarAmount - Dollar amount to convert
     * @returns {Object} Result with credits added
     */
    async convertDollarToCredits(userId, dollarAmount) {
        if (dollarAmount <= 0) {
            throw new Error('Invalid dollar amount');
        }

        const config = await this.getConfig();
        const creditsToAdd = Math.floor(dollarAmount * config.conversionRate);

        if (creditsToAdd <= 0) {
            throw new Error('Amount too small to convert');
        }

        return await prisma.$transaction(async (tx) => {
            // Get user with both balances
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: { creditBalance: true, messageCredits: true }
            });

            if (!user) {
                throw new Error('User not found');
            }

            if ((user.creditBalance || 0) < dollarAmount) {
                throw new Error('Insufficient dollar balance');
            }

            const dollarBefore = user.creditBalance || 0;
            const creditsBefore = user.messageCredits || 0;
            const dollarAfter = dollarBefore - dollarAmount;
            const creditsAfter = creditsBefore + creditsToAdd;

            // Update user balances
            await tx.user.update({
                where: { id: userId },
                data: {
                    creditBalance: dollarAfter,
                    messageCredits: creditsAfter
                }
            });

            // Create dollar transaction (debit)
            await tx.creditTransaction.create({
                data: {
                    userId,
                    type: 'DEBIT',
                    amount: dollarAmount,
                    balanceBefore: dollarBefore,
                    balanceAfter: dollarAfter,
                    description: `Converted $${dollarAmount} to ${creditsToAdd} message credits`,
                    reference: `CONVERT_${Date.now()}`
                }
            });

            // Create message credit transaction (credit)
            await tx.messageCreditTransaction.create({
                data: {
                    userId,
                    type: 'CONVERSION',
                    amount: creditsToAdd,
                    balanceBefore: creditsBefore,
                    balanceAfter: creditsAfter,
                    description: `Converted from $${dollarAmount} (rate: ${config.conversionRate}/dollar)`,
                    reference: `CONVERT_${Date.now()}`
                }
            });

            console.log(`[MessageCreditService] Converted $${dollarAmount} to ${creditsToAdd} credits for user ${userId}`);

            return {
                success: true,
                dollarDeducted: dollarAmount,
                creditsAdded: creditsToAdd,
                dollarBalance: dollarAfter,
                creditBalance: creditsAfter,
                conversionRate: config.conversionRate
            };
        }, {
            isolationLevel: 'Serializable'
        });
    }

    /**
     * Deduct message credits for sending a message (ATOMIC)
     * @param {string} userId - User ID
     * @param {number} amount - Credits to deduct (default: 1)
     * @param {string} description - Description
     * @param {string} reference - Reference ID
     * @returns {Object} Result
     */
    async deductCredits(userId, amount = 1, description = 'Bot message sent', reference = null) {
        return await prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: { messageCredits: true, role: true }
            });

            if (!user) {
                throw new Error('User not found');
            }

            // Admin exempt
            if (user.role === 'MASTER_ADMIN' || user.role === 'ADMIN') {
                return {
                    success: true,
                    charged: false,
                    amount: 0,
                    balance: user.messageCredits,
                    reason: 'admin_exempt'
                };
            }

            const balanceBefore = user.messageCredits || 0;

            if (balanceBefore < amount) {
                return {
                    success: false,
                    charged: false,
                    amount,
                    balance: balanceBefore,
                    reason: 'insufficient_credits'
                };
            }

            const newBalance = balanceBefore - amount;

            // Update balance
            await tx.user.update({
                where: { id: userId },
                data: { messageCredits: newBalance }
            });

            // Create transaction record
            await tx.messageCreditTransaction.create({
                data: {
                    userId,
                    type: 'DEBIT',
                    amount,
                    balanceBefore,
                    balanceAfter: newBalance,
                    description,
                    reference: reference || `MSG_${Date.now()}`
                }
            });

            return {
                success: true,
                charged: true,
                amount,
                balance: newBalance
            };
        }, {
            isolationLevel: 'Serializable'
        });
    }

    /**
     * Add message credits (admin grant, adjustment, etc) (ATOMIC)
     */
    async addCredits(userId, amount, description, reference = null) {
        if (amount <= 0) {
            throw new Error('Invalid amount');
        }

        return await prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: { messageCredits: true }
            });

            if (!user) {
                throw new Error('User not found');
            }

            const balanceBefore = user.messageCredits || 0;
            const newBalance = balanceBefore + amount;

            await tx.user.update({
                where: { id: userId },
                data: { messageCredits: newBalance }
            });

            await tx.messageCreditTransaction.create({
                data: {
                    userId,
                    type: 'CREDIT',
                    amount,
                    balanceBefore,
                    balanceAfter: newBalance,
                    description,
                    reference: reference || `ADMIN_${Date.now()}`
                }
            });

            return {
                success: true,
                creditsAdded: amount,
                balance: newBalance
            };
        }, {
            isolationLevel: 'Serializable'
        });
    }

    /**
     * Charge for sending a message (wrapper for deductCredits)
     * Can be used as drop-in replacement for creditService.chargeMessage
     */
    async chargeMessage(userId, platform = 'WHATSAPP', isGroup = false, user = null) {
        // Get user config if not provided
        if (!user) {
            user = await prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    messageCredits: true,
                    customCreditRate: true,
                    role: true
                }
            });
        }

        // Admin exempt
        if (user?.role === 'MASTER_ADMIN' || user?.role === 'ADMIN') {
            return {
                charged: false,
                amount: 0,
                balance: user.messageCredits,
                reason: 'admin_exempt'
            };
        }

        // Get credits per message (user custom or system default)
        const config = await this.getConfig();
        const creditsPerMessage = user?.customCreditRate || config.creditsPerMessage;

        // Deduct
        const result = await this.deductCredits(
            userId,
            creditsPerMessage,
            `${platform} ${isGroup ? 'group' : 'direct'} message`,
            `MSG_${Date.now()}`
        );

        return {
            charged: result.charged,
            amount: creditsPerMessage,
            balance: result.balance,
            reason: result.reason
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
            prisma.messageCreditTransaction.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.messageCreditTransaction.count({ where })
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
     * Get both balances for a user
     */
    async getBothBalances(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                creditBalance: true,
                messageCredits: true
            }
        });

        const config = await this.getConfig();

        return {
            dollarBalance: user?.creditBalance || 0,
            messageCredits: user?.messageCredits || 0,
            conversionRate: config.conversionRate,
            creditsPerMessage: config.creditsPerMessage
        };
    }
}

module.exports = new MessageCreditService();
