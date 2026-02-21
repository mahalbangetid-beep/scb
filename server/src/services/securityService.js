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
     * @param {Object} params - { order, senderNumber, isGroup, userId, command, isStaffOverride }
     * @returns {Object} { allowed, message, shouldClaim, needsUsernameVerification, settings }
     */
    async performSecurityChecks(params) {
        const { order, senderNumber, isGroup, userId, command, isStaffOverride = false } = params;

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
            const userMappingCheck = await this.checkUserMappingOwnership(order, senderNumber, userId, isGroup);
            if (userMappingCheck.allowed) {
                mappingVerified = true;
                console.log(`[Security] User mapping verified (case: ${userMappingCheck.case}) — skipping claim & username checks`);
            } else {
                // Mapping check failed — return error directly
                return { allowed: false, message: userMappingCheck.message, settings };
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
     * STRICT MODE: Check order ownership via Order → Username → Mapping → WA Number
     * 
     * Flow:
     * 1. Get username from order (customerUsername)
     * 2. Find mapping by username
     * 3. Check if sender's WA number matches mapped WA numbers
     * 
     * Cases:
     * - Case 1: Username in mapping + WA matches → ALLOWED
     * - Case 2: Username in mapping + WA doesn't match → BLOCKED
     * - Case 3: Username NOT in mapping → BLOCKED (not registered)
     * - Case 4: Order not found (handled elsewhere)
     * 
     * @param {Object} order - Order object with customerUsername
     * @param {string} senderNumber - Sender's WhatsApp number  
     * @param {string} userId - Panel owner's user ID
     * @param {boolean} isGroup - Whether message is from a group
     * @returns {Object} { allowed, message, case }
     */
    async checkUserMappingOwnership(order, senderNumber, userId, isGroup) {
        try {
            const userMappingService = require('./userMappingService');

            // Normalize sender's phone number
            const normalizedSender = userMappingService.normalizePhone(senderNumber);

            console.log(`[Security] STRICT MODE - Checking order ownership for sender: ${normalizedSender}`);

            // Step 1: Get username from order
            let orderUsername = order.customerUsername;

            // If customerUsername is missing, try to fetch from Admin API
            if (!orderUsername) {
                console.log(`[Security] Order ${order.externalOrderId} has no customerUsername, attempting to fetch from Admin API...`);

                try {
                    const adminApiService = require('./adminApiService');

                    // Get panel info - make sure to include adminApiKey
                    let panel = order.panel;
                    if (!panel || !panel.adminApiKey) {
                        panel = await prisma.smmPanel.findUnique({
                            where: { id: order.panelId }
                        });
                        console.log(`[Security] Loaded panel: ${panel?.alias || panel?.name}, hasAdminApiKey: ${!!panel?.adminApiKey}`);
                    }

                    if (panel && panel.adminApiKey) {
                        console.log(`[Security] Fetching from Admin API for order ${order.externalOrderId}...`);
                        const orderData = await adminApiService.getOrderWithProvider(panel, order.externalOrderId);
                        console.log(`[Security] Admin API response: success=${orderData.success}, customerUsername=${orderData.data?.customerUsername}`);

                        if (orderData.success && orderData.data?.customerUsername) {
                            orderUsername = orderData.data.customerUsername;

                            // Update order in database with customerUsername
                            await prisma.order.update({
                                where: { id: order.id },
                                data: { customerUsername: orderUsername }
                            });

                            console.log(`[Security] Fetched and saved customerUsername: ${orderUsername}`);
                        } else {
                            console.log(`[Security] Admin API did not return customerUsername. Response:`, JSON.stringify(orderData).substring(0, 200));
                        }
                    } else {
                        console.log(`[Security] Panel has no Admin API key configured, cannot fetch customerUsername`);
                    }
                } catch (fetchError) {
                    console.error(`[Security] Failed to fetch customerUsername:`, fetchError.message);
                }
            }

            // If still no username after fetch attempt
            if (!orderUsername) {
                console.log(`[Security] Order ${order.externalOrderId} still has no customerUsername after fetch attempt`);

                // FALLBACK: Allow command but log warning (temporary until Admin API is configured)
                // This can be changed to block if strict mode is required
                console.warn(`[Security] WARNING: Allowing command without customerUsername validation (fallback mode)`);
                return {
                    allowed: true,
                    case: 'FALLBACK_NO_USERNAME',
                    warning: 'customerUsername not available for validation'
                };
            }

            console.log(`[Security] Order ${order.externalOrderId} belongs to username: ${orderUsername}`);

            // Step 2: Find mapping by username (not by phone!)
            const mapping = await userMappingService.findByUsername(userId, orderUsername);

            // Case 3: Username NOT in mapping → AUTO-CREATE mapping (Bug 4.2)
            if (!mapping) {
                console.log(`[Security] CASE 3: Username "${orderUsername}" not found in User Mapping — auto-creating...`);

                try {
                    // Auto-create mapping: link username + sender's WA number
                    const newMapping = await userMappingService.createMapping(userId, {
                        panelUsername: orderUsername,
                        panelId: order.panelId || null,
                        whatsappNumbers: [normalizedSender],
                        whatsappName: null, // Will be captured on next message via auto-capture
                        isBotEnabled: true,
                        isVerified: false, // Unverified — admin can verify later
                        adminNotes: `Auto-created on first interaction (Order #${order.externalOrderId})`
                    });

                    console.log(`[Security] Auto-created mapping ID ${newMapping.id} for username "${orderUsername}" + WA ${normalizedSender}`);

                    // Record activity on the new mapping
                    await userMappingService.recordActivity(newMapping.id);

                    return {
                        allowed: true,
                        mapping: userMappingService.parseMapping(newMapping),
                        case: 'AUTO_CREATED'
                    };
                } catch (createError) {
                    // If creation fails (e.g., race condition where mapping was just created),
                    // try to find the mapping again
                    console.error(`[Security] Auto-create mapping failed:`, createError.message);

                    const retryMapping = await userMappingService.findByUsername(userId, orderUsername);
                    if (retryMapping) {
                        console.log(`[Security] Found mapping on retry — proceeding`);
                        return { allowed: true, mapping: retryMapping, case: 'RETRY_FOUND' };
                    }

                    return {
                        allowed: false,
                        message: '❌ Your account is not registered with the bot.\nPlease contact WhatsApp support team to register.',
                        case: 'USER_NOT_REGISTERED'
                    };
                }
            }

            console.log(`[Security] Found mapping for username "${orderUsername}", ID: ${mapping.id}`);

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

            // Step 3: Check if sender's WA number is in the mapped WA numbers
            const mappedNumbers = mapping.whatsappNumbers || [];
            const normalizedMappedNumbers = mappedNumbers.map(n => userMappingService.normalizePhone(n));

            console.log(`[Security] Mapped WA numbers: ${JSON.stringify(normalizedMappedNumbers)}`);
            console.log(`[Security] Sender WA number: ${normalizedSender}`);

            // Case 2: Username in mapping but WA number doesn't match
            if (!normalizedMappedNumbers.includes(normalizedSender)) {
                console.log(`[Security] CASE 2: WA number ${normalizedSender} NOT in mapped numbers`);
                return {
                    allowed: false,
                    message: '❌ Order ID does not belong to you.',
                    case: 'WA_NOT_MATCH'
                };
            }

            // Case 1: Username in mapping AND WA matches - ALLOWED!
            console.log(`[Security] CASE 1: Order ownership VERIFIED - Username: ${orderUsername}, WA: ${normalizedSender}`);

            // Auto-verify mapping on first successful WhatsApp validation (Section 10)
            // This triggers the auto-note "Validated via WhatsApp"
            if (!mapping.isVerified) {
                try {
                    await userMappingService.verifyMapping(mapping.id, userId, 'WHATSAPP');
                    console.log(`[Security] Auto-verified mapping ${mapping.id} via WhatsApp`);
                } catch (verifyErr) {
                    console.error(`[Security] Auto-verify failed:`, verifyErr.message);
                    // Non-blocking — continue even if auto-verify fails
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
