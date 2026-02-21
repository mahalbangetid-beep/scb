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
                    statusResponseMode: 'standard',
                    // Staff Override Group (Section 5)
                    staffOverrideEnabled: false,
                    staffOverrideGroups: []
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
     * @param {Object} params - { order, senderNumber, isGroup, userId, command, isStaffOverride, groupJid }
     * @returns {Object} { allowed, message, shouldClaim, needsUsernameVerification, settings }
     */
    async performSecurityChecks(params) {
        const { order, senderNumber, isGroup, userId, command, isStaffOverride = false, groupJid } = params;

        // Get user settings
        const settings = await this.getUserSettings(userId);

        // ==================== STAFF OVERRIDE (Section 5) ====================
        // If sender is from a staff override group, bypass ALL validation checks.
        // Staff can send any order ID, any command, no restrictions.
        if (isStaffOverride) {
            console.log(`[Security] Staff override: bypassing all validation for ${senderNumber}`);
            return {
                allowed: true,
                shouldClaim: false,
                isStaffOverride: true,
                settings
            };
        }

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

        // 4. Check User Mapping FIRST - if mapping validates ownership, skip claim & username checks
        // This allows mapped users to use commands in groups without needing to claim first
        let mappingVerified = false;
        if (settings.userMappingEnabled !== false) { // Default enabled
            const userMappingCheck = await this.checkUserMappingOwnership(order, senderNumber, userId, isGroup, groupJid);
            if (userMappingCheck.allowed) {
                mappingVerified = true;
                console.log(`[Security] User mapping verified (case: ${userMappingCheck.case}) — skipping claim & username checks`);
            } else {
                // Forward needsRegistration flag so command handler can trigger registration flow
                return {
                    allowed: false,
                    message: userMappingCheck.message,
                    needsRegistration: userMappingCheck.needsRegistration || false,
                    settings
                };
            }
        }

        // 5. Check claim status (only if mapping didn't verify)
        let claimCheck = { allowed: true };
        if (!mappingVerified) {
            claimCheck = await this.checkClaimStatus(order, senderNumber, isGroup, settings);
            if (!claimCheck.allowed) {
                return { allowed: false, message: claimCheck.message, settings };
            }
        }

        // 6. Check username validation (only if mapping didn't verify)
        if (!mappingVerified) {
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
        }

        return {
            allowed: true,
            shouldClaim: claimCheck.shouldClaim,
            settings
        };
    }

    /**
     * WA-FIRST MODE: Check order ownership via WA Number → Mapping → Username → Order
     * 
     * Flow:
     * 1. Find mapping by sender's WA number (or group JID)
     * 2. If not found → return needsRegistration (user must register first)
     * 3. If found → get mapped username
     * 4. Get order's customerUsername (from DB or Admin API)
     * 5. Check if order's username matches mapped username
     * 
     * Cases:
     * - Case 1: WA registered + order belongs to mapped username → ALLOWED
     * - Case 2: WA registered + order does NOT belong → BLOCKED ("not yours")
     * - Case 3: WA NOT registered → BLOCKED (needsRegistration)
     * - Case 4: Order has no customerUsername → FALLBACK (allow with warning)
     * 
     * @param {Object} order - Order object with customerUsername
     * @param {string} senderNumber - Sender's WhatsApp number  
     * @param {string} userId - Panel owner's user ID
     * @param {boolean} isGroup - Whether message is from a group
     * @param {string} groupJid - Group JID (if from a group)
     * @returns {Object} { allowed, message, case, needsRegistration }
     */
    async checkUserMappingOwnership(order, senderNumber, userId, isGroup, groupJid = null) {
        try {
            const userMappingService = require('./userMappingService');

            // Normalize sender's phone number
            const normalizedSender = userMappingService.normalizePhone(senderNumber);

            console.log(`[Security] WA-FIRST MODE - Checking registration for sender: ${normalizedSender}`);

            // ==================== STEP 1: Find mapping by WA number ====================
            let mapping = await userMappingService.findByPhone(userId, normalizedSender);

            // If not found by phone and in a group, try by group JID
            if (!mapping && isGroup && groupJid) {
                mapping = await userMappingService.findByGroup(userId, groupJid);
                if (mapping) {
                    console.log(`[Security] Found mapping via group JID ${groupJid}: username="${mapping.panelUsername}"`);
                }
            }

            // ==================== CASE 3: WA NOT registered ====================
            if (!mapping) {
                console.log(`[Security] CASE 3: WA ${normalizedSender} NOT registered in any mapping`);

                if (isGroup) {
                    // In group: don't trigger registration, just block
                    return {
                        allowed: false,
                        message: '❌ Your number is not registered. Please DM the bot to register first.',
                        case: 'NOT_REGISTERED_GROUP'
                    };
                }

                // In DM: trigger registration flow
                return {
                    allowed: false,
                    needsRegistration: true,
                    message: '📝 Your number is not registered.\n\nPlease send your *panel username* to register.',
                    case: 'NOT_REGISTERED'
                };
            }

            console.log(`[Security] Found mapping for WA ${normalizedSender}: username="${mapping.panelUsername}", ID: ${mapping.id}`);

            // Check if bot is enabled for this mapping
            if (!mapping.isBotEnabled) {
                return {
                    allowed: false,
                    message: '🔒 Bot is disabled for your account. Please contact admin.',
                    case: 'BOT_DISABLED'
                };
            }

            // Check if mapping is suspended
            if (mapping.isAutoSuspended) {
                return {
                    allowed: false,
                    message: '⛔ Your account has been suspended due to too many violations.',
                    case: 'SUSPENDED'
                };
            }

            // ==================== STEP 2: Get order's customerUsername ====================
            let orderUsername = order.customerUsername;

            // If customerUsername is missing, try to fetch from Admin API
            if (!orderUsername) {
                console.log(`[Security] Order ${order.externalOrderId} has no customerUsername, fetching from Admin API...`);

                try {
                    const adminApiService = require('./adminApiService');

                    let panel = order.panel;
                    if (!panel || !panel.adminApiKey) {
                        panel = await prisma.smmPanel.findUnique({
                            where: { id: order.panelId }
                        });
                    }

                    if (panel && panel.adminApiKey) {
                        const orderData = await adminApiService.getOrderWithProvider(panel, order.externalOrderId);
                        if (orderData.success && orderData.data?.customerUsername) {
                            orderUsername = orderData.data.customerUsername;

                            // Save to DB for future lookups
                            await prisma.order.update({
                                where: { id: order.id },
                                data: { customerUsername: orderUsername }
                            });
                            console.log(`[Security] Fetched and saved customerUsername: ${orderUsername}`);
                        }
                    }
                } catch (fetchError) {
                    console.error(`[Security] Failed to fetch customerUsername:`, fetchError.message);
                }
            }

            // ==================== CASE 4: No customerUsername available ====================
            if (!orderUsername) {
                console.log(`[Security] Order ${order.externalOrderId} has no customerUsername — fallback allow for registered user`);
                // User IS registered, but order has no username to verify against
                // Allow with warning (better UX than blocking registered users)
                return {
                    allowed: true,
                    mapping,
                    case: 'FALLBACK_NO_USERNAME',
                    warning: 'customerUsername not available for ownership check'
                };
            }

            // ==================== STEP 3: Check ownership ====================
            // Compare order's username with mapped username
            const mappedUsername = (mapping.panelUsername || '').trim().toLowerCase();
            const orderUser = (orderUsername || '').trim().toLowerCase();

            console.log(`[Security] Ownership check: mapped="${mappedUsername}" vs order="${orderUser}"`);

            if (mappedUsername !== orderUser) {
                // ==================== CASE 2: Order doesn't belong to this user ====================
                console.log(`[Security] CASE 2: Order ${order.externalOrderId} belongs to "${orderUsername}", not "${mapping.panelUsername}"`);
                return {
                    allowed: false,
                    message: '❌ This order does not belong to you.',
                    case: 'ORDER_NOT_YOURS'
                };
            }

            // ==================== CASE 1: Verified — WA registered + order matches ====================
            console.log(`[Security] CASE 1: Order ownership VERIFIED — Username: ${orderUsername}, WA: ${normalizedSender}`);

            // Auto-verify mapping on first successful validation
            if (!mapping.isVerified) {
                try {
                    await userMappingService.verifyMapping(mapping.id, userId, 'WHATSAPP');
                    console.log(`[Security] Auto-verified mapping ${mapping.id} via WhatsApp`);
                } catch (verifyErr) {
                    console.error(`[Security] Auto-verify failed:`, verifyErr.message);
                }
            }

            // Record activity
            await userMappingService.recordActivity(mapping.id);

            return {
                allowed: true,
                mapping,
                case: 'VERIFIED'
            };

        } catch (error) {
            console.error(`[Security] User mapping check error:`, error.message);
            // STRICT MODE: On error, DENY access (fail close)
            return {
                allowed: false,
                message: '⚠️ Unable to verify your account. Please try again later.',
                case: 'ERROR'
            };
        }
    }


    // ==================== STAFF OVERRIDE GROUP (Section 5) ====================

    /**
     * Check if a group JID is a staff override group for this user
     * @param {string} userId - Panel owner's user ID
     * @param {string} groupJid - WhatsApp group JID or Telegram chat ID
     * @returns {boolean} True if this is a staff override group
     */
    async isStaffOverrideGroup(userId, groupJid) {
        if (!groupJid) return false;

        try {
            const settings = await this.getUserSettings(userId);

            // Must be enabled
            if (!settings.staffOverrideEnabled) return false;

            // Parse staffOverrideGroups (JSON array)
            let groups = settings.staffOverrideGroups;
            if (!groups) return false;
            if (typeof groups === 'string') {
                try { groups = JSON.parse(groups); } catch { return false; }
            }

            if (!Array.isArray(groups)) return false;

            return groups.includes(groupJid);
        } catch (error) {
            console.error('[Security] Staff override group check error:', error.message);
            return false;
        }
    }

    /**
     * Get staff override groups for a user
     * @param {string} userId - User ID
     * @returns {Object} { enabled, groups }
     */
    async getStaffOverrideConfig(userId) {
        const settings = await this.getUserSettings(userId);
        let groups = settings.staffOverrideGroups || [];
        if (typeof groups === 'string') {
            try { groups = JSON.parse(groups); } catch { groups = []; }
        }
        return {
            enabled: settings.staffOverrideEnabled || false,
            groups: Array.isArray(groups) ? groups : []
        };
    }

    /**
     * Update staff override group config
     * @param {string} userId - User ID
     * @param {Object} config - { enabled?, groups? }
     * @returns {Object} Updated settings
     */
    async updateStaffOverrideConfig(userId, config) {
        // Ensure settings exist first (getUserSettings creates defaults if missing)
        await this.getUserSettings(userId);

        const updateData = {};
        if (config.enabled !== undefined) {
            updateData.staffOverrideEnabled = !!config.enabled;
        }
        if (config.groups !== undefined) {
            if (!Array.isArray(config.groups)) {
                throw new Error('groups must be an array');
            }
            // Sanitize: only strings, no duplicates
            const sanitized = [...new Set(config.groups.filter(g => typeof g === 'string' && g.trim()))];
            updateData.staffOverrideGroups = sanitized;
        }

        return await prisma.userBotSettings.update({
            where: { userId },
            data: updateData
        });
    }

    /**
     * Add a group to staff override groups
     * @param {string} userId - User ID
     * @param {string} groupJid - Group JID to add
     */
    async addStaffOverrideGroup(userId, groupJid) {
        const config = await this.getStaffOverrideConfig(userId);
        if (!config.groups.includes(groupJid)) {
            config.groups.push(groupJid);
            await this.updateStaffOverrideConfig(userId, { groups: config.groups });
        }
        return config.groups;
    }

    /**
     * Remove a group from staff override groups
     * @param {string} userId - User ID
     * @param {string} groupJid - Group JID to remove
     */
    async removeStaffOverrideGroup(userId, groupJid) {
        const config = await this.getStaffOverrideConfig(userId);
        config.groups = config.groups.filter(g => g !== groupJid);
        await this.updateStaffOverrideConfig(userId, { groups: config.groups });
        return config.groups;
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
