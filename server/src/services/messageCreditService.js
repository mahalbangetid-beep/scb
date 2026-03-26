/**
 * Message Credit Service
 * 
 * Service untuk mengelola Message Credits (terpisah dari Dollar balance)
 * - 1 Credit = 1 Message sent by bot
 * - Users get credits by: conversion from dollar, signup bonus, admin grant
 * - Credits are deducted when bot sends messages
 * 
 * CREDIT CATEGORIES:
 * - 'support'              → supportCredits (bot auto-reply, support messages)
 * - 'whatsapp_marketing'   → whatsappCredits (WhatsApp broadcast/marketing)
 * - 'telegram_marketing'   → telegramCredits (Telegram broadcast/marketing)
 */

const prisma = require('../utils/prisma');

// Category → DB field mapping
const CATEGORY_FIELDS = {
    'support': 'supportCredits',
    'whatsapp_marketing': 'whatsappCredits',
    'telegram_marketing': 'telegramCredits'
};

// Category → free-given-flag mapping
const CATEGORY_FREE_FLAGS = {
    'support': 'freeSupportGiven',
    'whatsapp_marketing': 'freeWhatsappGiven',
    'telegram_marketing': 'freeTelegramGiven'
};

// Platform → credit category mapping for chargeMessage
const PLATFORM_CATEGORY = {
    'WHATSAPP': 'support',      // Bot replies = support
    'TELEGRAM': 'support',      // Bot replies = support
};

/**
 * Get the DB field name for a category.
 * Falls back to 'supportCredits' for unknown categories.
 */
function getCreditField(category) {
    return CATEGORY_FIELDS[category] || 'supportCredits';
}

class MessageCreditService {
    constructor() {
        // Default configuration
        this.defaults = {
            freeSignupCredits: parseInt(process.env.FREE_SIGNUP_CREDITS) || 0,
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
                } else if (config.key === 'free_signup_support_credits') {
                    this.configCache.freeSupportCredits = parseInt(config.value);
                } else if (config.key === 'free_signup_whatsapp_credits') {
                    this.configCache.freeWhatsappCredits = parseInt(config.value);
                } else if (config.key === 'free_signup_telegram_credits') {
                    this.configCache.freeTelegramCredits = parseInt(config.value);
                } else if (config.key === 'credit_conversion_rate') {
                    this.configCache.conversionRate = parseInt(config.value);
                } else if (config.key === 'credits_per_message') {
                    this.configCache.creditsPerMessage = parseInt(config.value);
                }
            } catch {
                // Keep default
            }
        }

        // Set category-specific free credits (fallback to global)
        if (this.configCache.freeSupportCredits === undefined) {
            this.configCache.freeSupportCredits = this.configCache.freeSignupCredits;
        }
        if (this.configCache.freeWhatsappCredits === undefined) {
            this.configCache.freeWhatsappCredits = 0; // No default WA free credits
        }
        if (this.configCache.freeTelegramCredits === undefined) {
            this.configCache.freeTelegramCredits = 0; // No default TG free credits
        }

        this.configCacheTime = now;
        return this.configCache;
    }

    /**
     * Get user's message credits balance for a specific category
     * @param {string} userId - User ID
     * @param {string} category - Credit category (default: 'support')
     * @returns {number} Balance
     */
    async getBalance(userId, category = 'support') {
        const field = getCreditField(category);
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { [field]: true, messageCredits: true }
        });

        return user?.[field] ?? 0;
    }

    /**
     * Check if user has sufficient message credits
     * @param {string} userId
     * @param {number} amount
     * @param {string} category - Credit category (default: 'support')
     */
    async hasSufficientCredits(userId, amount = 1, category = 'support') {
        const balance = await this.getBalance(userId, category);
        return balance >= amount;
    }

    /**
     * Give free signup credits to new user (ATOMIC)
     * Now gives credits to ALL 3 categories based on config
     * @param {string} userId - User ID
     * @returns {Object} Result with credits added
     */
    async giveSignupCredits(userId) {
        const config = await this.getConfig();

        return await prisma.$transaction(async (tx) => {
            // Check if already given (use legacy flag for backward compat)
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: {
                    supportCredits: true,
                    whatsappCredits: true,
                    telegramCredits: true,
                    messageCredits: true,
                    freeCreditsGiven: true,
                    freeSupportGiven: true,
                    freeWhatsappGiven: true,
                    freeTelegramGiven: true
                }
            });

            if (!user) {
                throw new Error('User not found');
            }

            // If legacy flag already set, don't give again
            if (user.freeCreditsGiven) {
                return {
                    success: false,
                    reason: 'already_given',
                    balance: user.supportCredits
                };
            }

            const supportCredits = config.freeSupportCredits || 0;
            const whatsappCredits = config.freeWhatsappCredits || 0;
            const telegramCredits = config.freeTelegramCredits || 0;
            const totalCredits = supportCredits + whatsappCredits + telegramCredits;

            const supportBefore = user.supportCredits || 0;
            const whatsappBefore = user.whatsappCredits || 0;
            const telegramBefore = user.telegramCredits || 0;
            const legacyBefore = user.messageCredits || 0;

            // Build update data
            const updateData = {
                freeCreditsGiven: true,
                freeSupportGiven: true,
                freeWhatsappGiven: true,
                freeTelegramGiven: true,
            };

            if (supportCredits > 0) {
                updateData.supportCredits = supportBefore + supportCredits;
            }
            if (whatsappCredits > 0) {
                updateData.whatsappCredits = whatsappBefore + whatsappCredits;
            }
            if (telegramCredits > 0) {
                updateData.telegramCredits = telegramBefore + telegramCredits;
            }

            // Keep messageCredits in sync (sum of all 3)
            updateData.messageCredits = (updateData.supportCredits || supportBefore) +
                (updateData.whatsappCredits || whatsappBefore) +
                (updateData.telegramCredits || telegramBefore);

            // Update user
            await tx.user.update({
                where: { id: userId },
                data: updateData
            });

            // Create transaction records for each category that got credits
            const txRecords = [];
            if (supportCredits > 0) {
                txRecords.push({
                    userId,
                    type: 'SIGNUP_BONUS',
                    amount: supportCredits,
                    balanceBefore: supportBefore,
                    balanceAfter: supportBefore + supportCredits,
                    description: `Free signup bonus: ${supportCredits} support credits`,
                    reference: `SIGNUP_SUPPORT_${Date.now()}`,
                    creditCategory: 'support'
                });
            }
            if (whatsappCredits > 0) {
                txRecords.push({
                    userId,
                    type: 'SIGNUP_BONUS',
                    amount: whatsappCredits,
                    balanceBefore: whatsappBefore,
                    balanceAfter: whatsappBefore + whatsappCredits,
                    description: `Free signup bonus: ${whatsappCredits} WhatsApp credits`,
                    reference: `SIGNUP_WA_${Date.now()}`,
                    creditCategory: 'whatsapp_marketing'
                });
            }
            if (telegramCredits > 0) {
                txRecords.push({
                    userId,
                    type: 'SIGNUP_BONUS',
                    amount: telegramCredits,
                    balanceBefore: telegramBefore,
                    balanceAfter: telegramBefore + telegramCredits,
                    description: `Free signup bonus: ${telegramCredits} Telegram credits`,
                    reference: `SIGNUP_TG_${Date.now()}`,
                    creditCategory: 'telegram_marketing'
                });
            }

            for (const rec of txRecords) {
                await tx.messageCreditTransaction.create({ data: rec });
            }

            console.log(`[MessageCreditService] Gave signup credits to user ${userId}: support=${supportCredits}, wa=${whatsappCredits}, tg=${telegramCredits}`);

            return {
                success: true,
                creditsAdded: totalCredits,
                balance: (updateData.supportCredits || supportBefore),
                supportCredits: supportCredits,
                whatsappCredits: whatsappCredits,
                telegramCredits: telegramCredits
            };
        }, {
            isolationLevel: 'Serializable'
        });
    }

    /**
     * Convert dollar balance to message credits (ATOMIC)
     * @param {string} userId - User ID
     * @param {number} dollarAmount - Dollar amount to convert
     * @param {string} category - Target credit category (default: 'support')
     * @returns {Object} Result with credits added
     */
    async convertDollarToCredits(userId, dollarAmount, category = 'support') {
        if (dollarAmount <= 0) {
            throw new Error('Invalid dollar amount');
        }

        const config = await this.getConfig();
        const creditsToAdd = Math.floor(dollarAmount * config.conversionRate);
        const field = getCreditField(category);

        if (creditsToAdd <= 0) {
            throw new Error('Amount too small to convert');
        }

        return await prisma.$transaction(async (tx) => {
            // Get user with both balances
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: { creditBalance: true, messageCredits: true, [field]: true }
            });

            if (!user) {
                throw new Error('User not found');
            }

            if ((user.creditBalance || 0) < dollarAmount) {
                throw new Error('Insufficient dollar balance');
            }

            const dollarBefore = user.creditBalance || 0;
            const creditsBefore = user[field] ?? 0;
            const dollarAfter = dollarBefore - dollarAmount;
            const creditsAfter = creditsBefore + creditsToAdd;

            // Update user balances
            await tx.user.update({
                where: { id: userId },
                data: {
                    creditBalance: dollarAfter,
                    [field]: creditsAfter,
                    // Sync legacy messageCredits
                    messageCredits: { increment: creditsToAdd }
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
                    description: `Converted $${dollarAmount} to ${creditsToAdd} ${category} credits`,
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
                    reference: `CONVERT_${Date.now()}`,
                    creditCategory: category
                }
            });

            console.log(`[MessageCreditService] Converted $${dollarAmount} to ${creditsToAdd} ${category} credits for user ${userId}`);

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
     * @param {string} category - Credit category (default: 'support')
     * @returns {Object} Result
     */
    async deductCredits(userId, amount = 1, description = 'Bot message sent', reference = null, category = 'support') {
        const field = getCreditField(category);

        const result = await prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: { [field]: true, messageCredits: true, role: true }
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
                    balance: user[field],
                    reason: 'admin_exempt'
                };
            }

            const balanceBefore = user[field] ?? 0;

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

            // Update category-specific balance + legacy messageCredits
            await tx.user.update({
                where: { id: userId },
                data: {
                    [field]: newBalance,
                    messageCredits: { decrement: amount }
                }
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
                    reference: reference || `MSG_${Date.now()}`,
                    creditCategory: category
                }
            });

            return {
                success: true,
                charged: true,
                amount,
                balance: newBalance,
                _balanceBefore: balanceBefore  // Internal: for notification check
            };
        }, {
            isolationLevel: 'Serializable'
        });

        // Low-credit notification hook (Section 2.2) — fire-and-forget
        if (result.charged && result._balanceBefore !== undefined) {
            setImmediate(() => {
                const creditService = require('./creditService');
                creditService.sendLowCreditNotification(userId, result.balance, result._balanceBefore, 'credits').catch(() => {});
            });
            delete result._balanceBefore; // Clean internal field
        }

        return result;
    }

    /**
     * Add message credits (admin grant, adjustment, etc) (ATOMIC)
     * @param {string} userId
     * @param {number} amount
     * @param {string} description
     * @param {string} reference
     * @param {string} category - Credit category (default: 'support')
     */
    async addCredits(userId, amount, description, reference = null, category = 'support') {
        if (amount <= 0) {
            throw new Error('Invalid amount');
        }

        const field = getCreditField(category);

        return await prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: { [field]: true, messageCredits: true }
            });

            if (!user) {
                throw new Error('User not found');
            }

            const balanceBefore = user[field] ?? 0;
            const newBalance = balanceBefore + amount;

            // Update category-specific balance + legacy messageCredits
            await tx.user.update({
                where: { id: userId },
                data: {
                    [field]: newBalance,
                    messageCredits: { increment: amount }
                }
            });

            await tx.messageCreditTransaction.create({
                data: {
                    userId,
                    type: 'CREDIT',
                    amount,
                    balanceBefore,
                    balanceAfter: newBalance,
                    description,
                    reference: reference || `ADMIN_${Date.now()}`,
                    creditCategory: category
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
     * 
     * NOTE: chargeMessage is for BOT REPLIES (support category).
     * For broadcast charges, callers should use deductCredits with the correct category directly.
     */
    async chargeMessage(userId, platform = 'WHATSAPP', isGroup = false, user = null) {
        // Get user config if not provided
        if (!user) {
            user = await prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    supportCredits: true,
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
                balance: user.supportCredits || user.messageCredits,
                reason: 'admin_exempt'
            };
        }

        // Get credits per message (user custom or system default)
        const config = await this.getConfig();
        const creditsPerMessage = user?.customCreditRate || config.creditsPerMessage;

        // chargeMessage is always 'support' category (bot replies, auto-replies, keyword responses)
        const category = 'support';

        // Deduct
        const result = await this.deductCredits(
            userId,
            creditsPerMessage,
            `${platform} ${isGroup ? 'group' : 'direct'} message`,
            `MSG_${Date.now()}`,
            category
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
     * @param {string} userId
     * @param {Object} options - { page, limit, type, category }
     */
    async getTransactions(userId, options = {}) {
        const { page = 1, limit = 20, type, category } = options;
        const skip = (page - 1) * limit;

        const where = { userId };
        if (type) {
            where.type = type;
        }
        if (category) {
            where.creditCategory = category;
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
     * Get both/all balances for a user
     * Returns legacy format PLUS new categorical balances for backward compat
     */
    async getBothBalances(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                creditBalance: true,
                messageCredits: true,
                supportCredits: true,
                whatsappCredits: true,
                telegramCredits: true
            }
        });

        const config = await this.getConfig();

        return {
            // Legacy format (backward compat — existing callers rely on these)
            dollarBalance: user?.creditBalance || 0,
            messageCredits: user?.messageCredits || 0,
            conversionRate: config.conversionRate,
            creditsPerMessage: config.creditsPerMessage,
            // New categorical balances
            supportCredits: user?.supportCredits || 0,
            whatsappCredits: user?.whatsappCredits || 0,
            telegramCredits: user?.telegramCredits || 0
        };
    }

    /**
     * Get all categorical balances (convenience method)
     */
    async getAllBalances(userId) {
        return await this.getBothBalances(userId);
    }

    // ==================== PER-MESSAGE TYPE CHARGE (Section 2.1) ====================

    /**
     * Charge for a message with per-type rate (credits mode companion).
     * Uses creditService.getMessageTypeRate() for rate lookup (shared config).
     * Deducts from 'support' category (same as chargeMessage).
     * Does NOT replace chargeMessage().
     *
     * @param {string} userId
     * @param {string} messageType - e.g. 'wa_keyword_response'
     * @param {string} platform - WHATSAPP or TELEGRAM
     * @param {boolean} isGroup
     * @param {Object} user
     * @returns {Object} { charged, amount, balance, reason }
     */
    async chargeMessageByType(userId, messageType, platform = 'WHATSAPP', isGroup = false, user = null) {
        // Get user config if not provided
        if (!user) {
            user = await prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    supportCredits: true,
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
                balance: user.supportCredits || user.messageCredits,
                reason: 'admin_exempt'
            };
        }

        // Get per-type rate from shared creditService config
        const creditService = require('./creditService');
        const { rate, enabled } = await creditService.getMessageTypeRate(messageType, platform, isGroup);

        // If disabled or zero rate, skip
        if (!enabled || rate <= 0) {
            return {
                charged: false,
                amount: 0,
                balance: user?.supportCredits || user?.messageCredits || 0,
                reason: enabled ? 'zero_rate' : 'type_disabled'
            };
        }

        // Deduct from support category
        const result = await this.deductCredits(
            userId,
            rate,
            `${platform} ${messageType.replace(/_/g, ' ')}`,
            `MSG_${Date.now()}`,
            'support'
        );

        return {
            charged: result.charged,
            amount: rate,
            balance: result.balance,
            reason: result.reason,
            messageType
        };
    }
}

module.exports = new MessageCreditService();

