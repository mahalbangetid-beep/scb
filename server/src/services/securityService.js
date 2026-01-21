/**
 * Security Service
 * 
 * Service for handling order ownership validation, rate limiting,
 * and security checks for bot commands.
 * 
 * Features:
 * - Order claim system (first-claim verification)
 * - Rate limiting per sender
 * - Command cooldown per order
 * - Group security modes
 */

const prisma = require('../utils/prisma');

class SecurityService {
    constructor() {
        // In-memory rate limit tracking (use Redis in production)
        this.senderRateLimits = new Map();
        this.RATE_LIMIT_WINDOW = 60000; // 1 minute
    }

    // ==================== USER SETTINGS ====================

    /**
     * Get user's bot security settings
     * @param {string} userId - User ID
     * @returns {Object} User bot settings
     */
    async getUserSettings(userId) {
        let settings = await prisma.userBotSettings.findUnique({
            where: { userId }
        });

        // Create default settings if not exists
        if (!settings) {
            settings = await prisma.userBotSettings.create({
                data: {
                    userId,
                    orderClaimMode: 'disabled',
                    groupSecurityMode: 'none',
                    usernameValidationMode: 'disabled',
                    maxCommandsPerMinute: 10,
                    commandCooldownSecs: 300,
                    showProviderInResponse: false,
                    showDetailedStatus: false,
                    privateReplyInGroups: false,
                    // Action modes
                    refillActionMode: 'forward',
                    cancelActionMode: 'forward',
                    speedupActionMode: 'forward',
                    statusResponseMode: 'standard'
                }
            });
        }


        return settings;
    }


    /**
     * Update user's bot security settings
     * @param {string} userId - User ID
     * @param {Object} updates - Settings to update
     */
    async updateUserSettings(userId, updates) {
        return await prisma.userBotSettings.upsert({
            where: { userId },
            update: updates,
            create: {
                userId,
                ...updates
            }
        });
    }

    // ==================== ORDER CLAIM SYSTEM ====================

    /**
     * Check if order command should proceed based on claim status
     * @param {Object} order - Order object
     * @param {string} senderNumber - Sender's WhatsApp number
     * @param {boolean} isGroup - Whether message is from a group
     * @param {Object} settings - User bot settings
     * @returns {Object} { allowed, message, shouldClaim }
     */
    async checkClaimStatus(order, senderNumber, isGroup, settings) {
        // If claim mode is disabled, allow all
        if (settings.orderClaimMode === 'disabled') {
            return { allowed: true };
        }

        // Check if order is already claimed
        if (order.claimedByPhone) {
            // Verify sender is the claimer
            if (order.claimedByPhone === senderNumber) {
                return { allowed: true };
            } else {
                // Someone else claimed this order
                return {
                    allowed: false,
                    message: '❌ This order has already been claimed by another number.'
                };
            }
        }

        // Order not claimed yet
        if (isGroup) {
            // In group: must claim via DM first
            return {
                allowed: false,
                message: '⚠️ This order is not yet verified.\n\nPlease DM me with the same command to verify your order first.'
            };
        }

        // In DM: can start claim process
        if (settings.orderClaimMode === 'auto') {
            return {
                allowed: true,
                shouldClaim: true
            };
        }

        // Email verification mode (more complex, can be added later)
        if (settings.orderClaimMode === 'email') {
            return {
                allowed: false,
                message: '📧 Please send the email you used when ordering for verification.\n\nFormat: `verify [ORDER_ID] [EMAIL]`'
            };
        }

        return { allowed: true };
    }

    /**
     * Claim an order for a sender
     * @param {Object} order - Order object
     * @param {string} senderNumber - Sender's WhatsApp number
     * @returns {Object} Updated order
     */
    async claimOrder(order, senderNumber) {
        const updated = await prisma.order.update({
            where: { id: order.id },
            data: {
                claimedByPhone: senderNumber,
                claimedAt: new Date(),
                isVerified: true
            }
        });

        console.log(`[Security] Order ${order.externalOrderId} claimed by ${senderNumber}`);

        return updated;
    }

    /**
     * Verify email for order claim (email mode)
     * @param {Object} order - Order object
     * @param {string} senderNumber - Sender's WhatsApp number
     * @param {string} email - Email to verify
     * @returns {Object} { success, message }
     */
    async verifyEmailClaim(order, senderNumber, email) {
        // Check if order's customer email matches
        if (!order.customerEmail) {
            return {
                success: false,
                message: '❌ Cannot verify. Email information is not available for this order.'
            };
        }

        // Case-insensitive email comparison
        if (order.customerEmail.toLowerCase() !== email.toLowerCase()) {
            return {
                success: false,
                message: '❌ Email does not match order data. Please try again.'
            };
        }

        // Email matches - claim the order
        await this.claimOrder(order, senderNumber);

        return {
            success: true,
            message: '✅ Verification successful! This order is now linked to your number.'
        };
    }

    // ==================== RATE LIMITING ====================

    /**
     * Check rate limit for a sender
     * @param {string} senderNumber - Sender's WhatsApp number
     * @param {string} userId - Panel owner's user ID
     * @param {Object} settings - User bot settings
     * @returns {Object} { limited, message, remainingSeconds }
     */
    async checkSenderRateLimit(senderNumber, userId, settings) {
        const key = `${userId}:${senderNumber}`;
        const now = Date.now();
        const maxCommands = settings.maxCommandsPerMinute || 10;

        // Get or create tracker
        if (!this.senderRateLimits.has(key)) {
            this.senderRateLimits.set(key, {
                count: 0,
                windowStart: now
            });
        }

        const tracker = this.senderRateLimits.get(key);

        // Reset window if expired
        if (now - tracker.windowStart >= this.RATE_LIMIT_WINDOW) {
            tracker.count = 0;
            tracker.windowStart = now;
        }

        // Check if at limit
        if (tracker.count >= maxCommands) {
            const remainingMs = this.RATE_LIMIT_WINDOW - (now - tracker.windowStart);
            const remainingSecs = Math.ceil(remainingMs / 1000);

            return {
                limited: true,
                message: `⏳ Too many commands. Please wait ${remainingSecs} seconds.`,
                remainingSeconds: remainingSecs
            };
        }

        // Increment counter
        tracker.count++;

        return { limited: false };
    }

    /**
     * Check command cooldown for a specific order
     * @param {string} orderId - Internal order ID
     * @param {string} command - Command type (refill, cancel, etc)
     * @param {string} senderNumber - Sender's phone number
     * @param {string} userId - Panel owner's user ID
     * @param {Object} settings - User bot settings
     * @returns {Object} { limited, message, remainingSeconds }
     */
    async checkCommandCooldown(orderId, command, senderNumber, userId, settings) {
        const cooldownSecs = settings.commandCooldownSecs || 300; // Default 5 minutes

        // Find active cooldown
        const cooldown = await prisma.commandCooldown.findFirst({
            where: {
                orderId,
                command: command.toUpperCase(),
                expiresAt: { gt: new Date() }
            }
        });

        if (cooldown) {
            const remainingMs = cooldown.expiresAt.getTime() - Date.now();
            const remainingSecs = Math.ceil(remainingMs / 1000);
            const remainingMins = Math.ceil(remainingSecs / 60);

            return {
                limited: true,
                message: `⏳ ${command.toUpperCase()} command for this order has already been processed.\n\nPlease wait ${remainingMins} minutes before trying again.`,
                remainingSeconds: remainingSecs
            };
        }

        return { limited: false };
    }

    /**
     * Create cooldown entry after successful command
     * @param {string} orderId - Internal order ID
     * @param {string} command - Command type
     * @param {string} senderNumber - Sender's phone number
     * @param {string} userId - Panel owner's user ID
     * @param {number} durationSecs - Cooldown duration in seconds
     */
    async createCommandCooldown(orderId, command, senderNumber, userId, durationSecs = 300) {
        await prisma.commandCooldown.create({
            data: {
                orderId,
                command: command.toUpperCase(),
                senderPhone: senderNumber,
                userId,
                expiresAt: new Date(Date.now() + durationSecs * 1000)
            }
        });

        console.log(`[Security] Cooldown created for ${command} on order ${orderId}`);
    }

    /**
     * Cleanup expired cooldowns
     * Should be called periodically (e.g., via cron job)
     */
    async cleanupExpiredCooldowns() {
        const result = await prisma.commandCooldown.deleteMany({
            where: {
                expiresAt: { lt: new Date() }
            }
        });

        if (result.count > 0) {
            console.log(`[Security] Cleaned up ${result.count} expired cooldowns`);
        }

        return result.count;
    }

    // ==================== GROUP SECURITY ====================

    /**
     * Check if command is allowed in group
     * @param {Object} order - Order object
     * @param {boolean} isGroup - Whether message is from a group
     * @param {Object} settings - User bot settings
     * @returns {Object} { allowed, message }
     */
    async checkGroupSecurity(order, isGroup, settings) {
        // If not in group, always allow
        if (!isGroup) {
            return { allowed: true };
        }

        // Check group security mode
        switch (settings.groupSecurityMode) {
            case 'disabled':
                return {
                    allowed: false,
                    message: '🔒 Group commands are disabled.\n\nPlease DM me to use commands.'
                };

            case 'verified':
                if (!order.claimedByPhone) {
                    return {
                        allowed: false,
                        message: '⚠️ This order is not yet verified.\n\nPlease DM me to verify your order first before using commands in groups.'
                    };
                }
                return { allowed: true };

            case 'none':
            default:
                return { allowed: true };
        }
    }

    // ==================== USERNAME VALIDATION ====================

    /**
     * Check if username validation is required
     * @param {Object} order - Order object
     * @param {string} senderNumber - Sender's WhatsApp number
     * @param {boolean} isGroup - Whether message is from a group
     * @param {Object} settings - User bot settings
     * @returns {Object} { required, verified, message, needsVerification }
     */
    async checkUsernameValidation(order, senderNumber, isGroup, settings) {
        const mode = settings.usernameValidationMode || 'disabled';

        // If disabled, no validation required
        if (mode === 'disabled') {
            return { required: false, verified: true };
        }

        // If order has no customerUsername, we can't validate
        if (!order.customerUsername) {
            console.log(`[Security] Order ${order.externalOrderId} has no customerUsername, skipping validation`);
            return { required: false, verified: true };
        }

        // If already claimed/verified by this sender, consider verified
        if (order.claimedByPhone === senderNumber && order.isVerified) {
            return { required: false, verified: true };
        }

        // In group chat, username validation must be done via DM first
        if (isGroup) {
            if (mode === 'strict' || mode === 'ask') {
                // Check if order was already verified by this sender
                if (order.claimedByPhone === senderNumber) {
                    return { required: false, verified: true };
                }

                return {
                    required: true,
                    verified: false,
                    needsVerification: false, // Can't verify in group
                    message: '🔐 *Username Verification Required*\n\nPlease DM me first to verify your username before using commands in groups.'
                };
            }
        }

        // In DM - check modes
        if (mode === 'ask') {
            // Ask mode: Only verify on first command for unclaimed orders
            if (order.claimedByPhone === senderNumber) {
                return { required: false, verified: true };
            }

            return {
                required: true,
                verified: false,
                needsVerification: true,
                orderUsername: order.customerUsername
            };
        }

        if (mode === 'strict') {
            // Strict mode: Always verify username
            // Check if we already verified in this session (via claim)
            if (order.claimedByPhone === senderNumber) {
                return { required: false, verified: true };
            }

            return {
                required: true,
                verified: false,
                needsVerification: true,
                orderUsername: order.customerUsername
            };
        }

        return { required: false, verified: true };
    }

    /**
     * Verify username matches order record
     * @param {Object} order - Order object
     * @param {string} providedUsername - Username provided by user
     * @returns {Object} { success, message }
     */
    verifyUsername(order, providedUsername) {
        if (!order.customerUsername) {
            return {
                success: false,
                message: '❌ Cannot verify. Username information not available for this order.'
            };
        }

        // Normalize for comparison
        const expected = (order.customerUsername || '').trim().toLowerCase();
        const provided = (providedUsername || '').trim().toLowerCase();

        if (expected === provided) {
            return {
                success: true,
                message: '✅ Username verified successfully!'
            };
        }

        return {
            success: false,
            message: '❌ Username does not match our records.'
        };
    }

    // ==================== COMBINED SECURITY CHECK ====================


    /**
     * Perform all security checks for a command
     * @param {Object} params - { order, senderNumber, isGroup, userId, command }
     * @returns {Object} { allowed, message, shouldClaim, needsUsernameVerification, settings }
     */
    async performSecurityChecks(params) {
        const { order, senderNumber, isGroup, userId, command } = params;

        // Get user settings
        const settings = await this.getUserSettings(userId);

        // 1. Check sender rate limit
        const rateCheck = await this.checkSenderRateLimit(senderNumber, userId, settings);
        if (rateCheck.limited) {
            return { allowed: false, message: rateCheck.message, settings };
        }

        // 2. Check command cooldown (for repeat commands on same order)
        const cooldownCheck = await this.checkCommandCooldown(
            order.id, command, senderNumber, userId, settings
        );
        if (cooldownCheck.limited) {
            return { allowed: false, message: cooldownCheck.message, settings };
        }

        // 3. Check group security
        const groupCheck = await this.checkGroupSecurity(order, isGroup, settings);
        if (!groupCheck.allowed) {
            return { allowed: false, message: groupCheck.message, settings };
        }

        // 4. Check claim status
        const claimCheck = await this.checkClaimStatus(order, senderNumber, isGroup, settings);
        if (!claimCheck.allowed) {
            return { allowed: false, message: claimCheck.message, settings };
        }

        // 5. Check username validation
        const usernameCheck = await this.checkUsernameValidation(order, senderNumber, isGroup, settings);
        if (usernameCheck.required && !usernameCheck.verified) {
            if (usernameCheck.needsVerification) {
                // Need to start username verification flow
                return {
                    allowed: false,
                    needsUsernameVerification: true,
                    orderUsername: usernameCheck.orderUsername,
                    settings
                };
            } else {
                // Can't verify (e.g., in group)
                return { allowed: false, message: usernameCheck.message, settings };
            }
        }

        return {
            allowed: true,
            shouldClaim: claimCheck.shouldClaim,
            settings
        };
    }


    // ==================== ERROR MESSAGE SANITIZATION ====================

    /**
     * Sanitize error message to not leak sensitive info
     * @param {string} originalError - Original error message
     * @param {string} context - Error context (order, panel, etc)
     * @returns {string} Sanitized error message
     */
    sanitizeErrorMessage(originalError, context = 'order') {
        const genericMessages = {
            order: 'Order not found or you do not have access.',
            panel: 'Panel is currently unavailable.',
            api: 'An error occurred. Please try again later.',
            auth: 'Access denied.',
            rate: 'Too many requests. Please wait a moment.'
        };

        return genericMessages[context] || genericMessages.api;
    }
}

// Export singleton instance
module.exports = new SecurityService();
