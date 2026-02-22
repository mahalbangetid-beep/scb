/**
 * Bot Message Handler
 * 
 * Handles incoming messages from WhatsApp/Telegram
 * Routes to appropriate handler: SMM commands, auto-reply, custom workflows
 */

const prisma = require('../utils/prisma');
const commandParser = require('./commandParser');
const commandHandler = require('./commandHandler');
const creditService = require('./creditService');
const messageCreditService = require('./messageCreditService');
const billingModeService = require('./billingModeService');
const { safeRegexTest } = require('../utils/safeRegex');

class BotMessageHandler {
    constructor() {
        this.io = null;
        this.whatsappService = null;

        // ==================== SPAM PROTECTION (1.4) ====================
        // In-memory tracking for same-text detection
        // Key: `${userId}:${senderNumber}` → { messages: [{text, ts}], warned: bool }
        this._spamTracker = new Map();
        // Key: `${userId}:${senderNumber}` → disabledUntil timestamp
        this._disabledUsers = new Map();

        // Periodic cleanup every 10 minutes
        setInterval(() => this._cleanupSpamTrackers(), 10 * 60 * 1000);
    }

    /**
     * Set dependencies
     */
    setDependencies(io, whatsappService) {
        this.io = io;
        this.whatsappService = whatsappService;
        commandHandler.setSocketIO(io);
    }

    /**
     * Handle incoming message
     * @param {Object} params - { deviceId, userId, panelId, panel, message, senderNumber, senderName, isGroup, groupJid, platform }
     * @returns {Object} - { handled, response, type }
     */
    async handleMessage(params) {
        const { deviceId, userId, panelId, panelIds, panel, message, senderNumber, senderName, isGroup, groupJid, platform = 'WHATSAPP' } = params;

        console.log(`[BotHandler] Processing message from ${senderNumber}${panelId ? ` (Panel: ${panel?.alias || panel?.name || panelId})` : ''}: ${message.substring(0, 50)}...`);

        // ==================== AUTO-CAPTURE WHATSAPP NAME (Section 10) ====================
        // Fire-and-forget: capture sender's WhatsApp display name for User Mapping
        if (senderName && senderNumber && platform === 'WHATSAPP') {
            try {
                const userMappingService = require('./userMappingService');
                const mapping = await userMappingService.findByPhone(userId, senderNumber);
                if (mapping && mapping.whatsappName !== senderName) {
                    userMappingService.updateWhatsAppName(mapping.id, senderName); // fire-and-forget
                }
            } catch (e) {
                // Silently fail — best-effort capture
            }
        }

        // ==================== DEVICE ACTIVE CHECK ====================
        // If device is deactivated (ON/OFF toggle), skip all message processing
        const device = await prisma.device.findUnique({
            where: { id: deviceId },
            select: { isSystemBot: true, groupOnly: true, usageLimit: true, isActive: true, replyScope: true, forwardOnly: true }
        });

        if (device && !device.isActive) {
            // Device is OFF — silently ignore all messages
            return { handled: false, type: 'device_inactive' };
        }

        // ==================== REPLY SCOPE CONTROL ====================
        // Enforce per-device reply scope setting
        const replyScope = device?.replyScope || 'all';
        if (replyScope === 'disabled') {
            // Silent mode — do not reply to any messages
            console.log(`[BotHandler] Device ${deviceId} replyScope=disabled, ignoring message`);
            return { handled: false, type: 'reply_scope_disabled' };
        }
        if (replyScope === 'groups_only' && !isGroup) {
            // Only reply in groups — ignore DMs
            console.log(`[BotHandler] Device ${deviceId} replyScope=groups_only, ignoring DM from ${senderNumber}`);
            return { handled: false, type: 'reply_scope_groups_only' };
        }
        if (replyScope === 'private_only' && isGroup) {
            // Only reply to private/DM messages — ignore groups
            console.log(`[BotHandler] Device ${deviceId} replyScope=private_only, ignoring group message`);
            return { handled: false, type: 'reply_scope_private_only' };
        }

        // ==================== SYSTEM BOT CHECKS ====================
        // Check if this device is a system bot and enforce restrictions

        if (device?.isSystemBot) {
            // ==================== SYSTEM BOT: STRICT REPLY BEHAVIOR (Bug 2.5) ====================
            // System Bot must NOT behave like a normal private device.
            // It must ONLY respond in linked, active support groups.

            // 1) DM HANDLING — Silent by default, optional admin auto-reply
            if (device.groupOnly && !isGroup) {
                console.log(`[BotHandler] System bot ${deviceId} - private message ignored (group-only mode)`);

                // Check if Master Admin has EXPLICITLY enabled auto-reply for DMs
                try {
                    const sysConfig = await prisma.systemConfig.findUnique({
                        where: { key: 'system_bot_auto_reply' }
                    });
                    if (sysConfig) {
                        const settings = JSON.parse(sysConfig.value);
                        if (settings.enabled && settings.message &&
                            (settings.triggerType === 'all' || settings.triggerType === 'personal')) {
                            return {
                                handled: true,
                                type: 'system_bot_auto_reply',
                                response: settings.message
                            };
                        }
                    }
                } catch (e) {
                    console.error('[BotHandler] Error reading system bot auto-reply config:', e.message);
                }

                // No auto-reply configured — silently ignore DM (per spec: "No response")
                return { handled: false, type: 'system_bot_dm_ignored' };
            }

            // 2) GROUP HANDLING — Only respond in linked, active support groups
            if (isGroup && groupJid) {
                // Check if this groupJid is assigned AND active for ANY subscriber on this device
                const linkedGroup = await prisma.systemBotGroup.findFirst({
                    where: {
                        groupJid,
                        isActive: true,
                        subscription: {
                            deviceId,
                            status: 'ACTIVE'
                        }
                    },
                    select: {
                        id: true,
                        subscriptionId: true,
                        subscription: {
                            select: {
                                id: true,
                                userId: true,
                                usageCount: true,
                                usageLimit: true
                            }
                        }
                    }
                });

                if (!linkedGroup) {
                    // Group is NOT linked/active — but still allow utility commands
                    // (.groupid is essential to GET the JID needed for linking)
                    const cmdLower = message.toLowerCase().trim();
                    const isUtilityCmd = ['.groupid', '/groupid', '.ping', '/ping', '.deviceid', '/deviceid', '.help', '/help', '.commands'].includes(cmdLower);

                    if (isUtilityCmd) {
                        console.log(`[BotHandler] System bot ${deviceId} - allowing utility command "${cmdLower}" in unlinked group ${groupJid}`);
                        // Fall through to utility handler below
                    } else {
                        console.log(`[BotHandler] System bot ${deviceId} - unlinked group ${groupJid}, ignoring`);
                        return { handled: false, type: 'system_bot_unlinked_group' };
                    }
                }

                // Group is linked — use the matched subscriber's subscription
                const activeSubscription = linkedGroup.subscription;

                // Usage limit check
                const effectiveLimit = activeSubscription.usageLimit || device.usageLimit;
                if (effectiveLimit && activeSubscription.usageCount >= effectiveLimit) {
                    console.log(`[BotHandler] System bot ${deviceId} - usage limit reached for subscription ${activeSubscription.id}`);
                    return {
                        handled: true,
                        type: 'system_bot_restriction',
                        response: `⚠️ Usage limit reached (${activeSubscription.usageCount}/${effectiveLimit} messages this period). Please wait for the next billing cycle or upgrade your plan.`
                    };
                }

                // Store subscription info for later usage increment
                params._systemBotSubscriptionId = activeSubscription.id;

            } else {
                // System bot, not a group message and not groupOnly — check for any active subscription
                const activeSubscription = await prisma.systemBotSubscription.findFirst({
                    where: {
                        deviceId,
                        status: 'ACTIVE'
                    },
                    select: {
                        id: true,
                        userId: true,
                        usageCount: true,
                        usageLimit: true
                    }
                });

                if (!activeSubscription) {
                    console.log(`[BotHandler] System bot ${deviceId} - no active subscriptions`);
                    return { handled: false, type: 'system_bot_no_subscription' };
                }

                const effectiveLimit = activeSubscription.usageLimit || device.usageLimit;
                if (effectiveLimit && activeSubscription.usageCount >= effectiveLimit) {
                    console.log(`[BotHandler] System bot ${deviceId} - usage limit reached`);
                    return {
                        handled: true,
                        type: 'system_bot_restriction',
                        response: `⚠️ Usage limit reached (${activeSubscription.usageCount}/${effectiveLimit} messages this period).`
                    };
                }

                params._systemBotSubscriptionId = activeSubscription.id;
            }
        }

        // ==================== CHECK IF FROM PROVIDER SUPPORT GROUP ====================
        // Skip processing for Provider Support Groups (forward-only mode)
        // Bot should NOT reply to messages in support groups to avoid spam
        if (isGroup && groupJid) {
            const isProviderGroup = await this.isProviderSupportGroup(userId, groupJid);
            if (isProviderGroup) {
                console.log(`[BotHandler] Skipping message from Provider Support Group: ${groupJid}`);
                return {
                    handled: false,
                    reason: 'provider_support_group',
                    message: 'Messages from provider support groups are not processed'
                };
            }

            // ==================== GROUP REPLY BLOCK CHECK (Bug 1.2) ====================
            // Check if this group is explicitly blocked for this device
            const groupBlock = await prisma.deviceGroupBlock.findUnique({
                where: {
                    deviceId_groupJid: { deviceId, groupJid }
                }
            });
            if (groupBlock) {
                console.log(`[BotHandler] Group ${groupJid} is blocked on device ${deviceId}, ignoring message`);
                return { handled: false, type: 'group_blocked' };
            }

            // ==================== STAFF OVERRIDE GROUP (Section 5) ====================
            // Check if this group is a staff override group
            // Staff in these groups can send any order ID, any command, no validation
            const securityService = require('./securityService');
            const isStaffOverride = await securityService.isStaffOverrideGroup(userId, groupJid);
            if (isStaffOverride) {
                console.log(`[BotHandler] Staff override group detected: ${groupJid}`);
                params.isStaffOverride = true;
            }

            // ==================== MARKETING INTERVAL TRACKING ====================
            // Track group message count for marketing interval triggers
            // Runs asynchronously — does NOT block normal message processing
            this.trackMarketingInterval(deviceId, userId, groupJid).catch(err => {
                console.error(`[BotHandler] Marketing interval tracking error:`, err.message);
            });
        }

        // Get user details
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                creditBalance: true,
                messageCredits: true,
                customWaRate: true,
                customTgRate: true,
                customGroupRate: true,
                customCreditRate: true,
                discountRate: true,
                role: true,
                status: true
            }
        });

        if (!user || user.status !== 'ACTIVE') {
            console.log(`[BotHandler] User not active or not found: ${userId}`);
            return { handled: false, reason: 'user_inactive' };
        }

        // ==================== SPAM PROTECTION (1.4) ====================
        // Detect repeated same text → warning → temporary user disable
        // Staff override groups bypass spam protection (Section 5)
        if (!params.isStaffOverride) {
            const spamCheck = await this._checkSpamProtection(userId, deviceId, senderNumber, message);
            if (spamCheck.blocked) {
                console.log(`[BotHandler] Spam blocked: ${senderNumber} (${spamCheck.reason})`);
                return {
                    handled: true,
                    type: 'spam_blocked',
                    response: spamCheck.response,
                    reason: spamCheck.reason
                };
            }
        }

        // Priority 0: Check for pending username verification conversation
        const conversationStateService = require('./conversationStateService');
        const pendingVerification = await conversationStateService.getActiveConversation(
            senderNumber,
            userId,
            conversationStateService.STATE_TYPES?.USERNAME_VERIFICATION || 'USERNAME_VERIFICATION'
        );

        if (pendingVerification) {
            // Check if this message is a verification response (username)
            if (conversationStateService.isVerificationResponse(message)) {
                const verifyResult = await conversationStateService.processUsernameVerification(
                    pendingVerification,
                    message
                );

                if (verifyResult.verified) {
                    // Username verified! Claim the order and retry the original command
                    const securityService = require('./securityService');
                    const orderId = verifyResult.context.orderId;
                    const originalCommand = verifyResult.context.command;

                    // Find and claim the order
                    const order = await prisma.order.findFirst({
                        where: { externalOrderId: orderId, userId }
                    });

                    if (order) {
                        await securityService.claimOrder(order, senderNumber);
                        console.log(`[BotHandler] Order ${orderId} claimed via username verification`);

                        // Now process the original command
                        const result = await commandHandler.processCommand({
                            userId,
                            deviceId,
                            message: `${orderId} ${originalCommand}`,
                            senderNumber,
                            platform
                        });

                        return {
                            handled: true,
                            type: 'username_verified',
                            response: `${verifyResult.message}\n\n${result.formattedResponse || result.responses?.[0]?.message || 'Command processed.'}`,
                            verified: true
                        };
                    }

                    return {
                        handled: true,
                        type: 'username_verified',
                        response: verifyResult.message,
                        verified: true
                    };
                } else {
                    // Verification failed or needs retry
                    return {
                        handled: true,
                        type: 'username_verification',
                        response: verifyResult.message,
                        verified: false
                    };
                }
            }
            // If not a verification response, continue to check if it's a new command
        }

        // Priority 0.1: Check for pending registration conversation
        const pendingRegistration = await conversationStateService.getActiveConversation(
            senderNumber,
            userId,
            'REGISTRATION'
        );

        if (pendingRegistration && !isGroup) {
            // User is in registration flow — process their message as username
            if (conversationStateService.isVerificationResponse(message)) {
                console.log(`[BotHandler] Processing registration response from ${senderNumber}: "${message}"`);
                const regResult = await conversationStateService.processRegistration(
                    pendingRegistration,
                    message,
                    userId
                );

                return {
                    handled: true,
                    type: 'registration',
                    response: regResult.message,
                    registered: regResult.success
                };
            }
            // If it looks like a command, let it fall through (but it'll fail with needs_registration again)
        }

        // Priority 0.5: Handle utility commands (.groupid, .ping, .help)
        const utilityResult = await this.handleUtilityCommand({
            message,
            senderNumber,
            deviceId,
            isGroup,
            groupJid: params.groupJid  // Pass group JID if available
        });
        if (utilityResult.handled) {
            // Increment system bot usage for utility commands too
            if (params._systemBotSubscriptionId) {
                await this.incrementSystemBotUsage(params._systemBotSubscriptionId);
            }
            return utilityResult;
        }
        // Priority 0.5: FonePay auto-detection (non-command payment messages)
        // Only for private messages (not groups), detect TXNID + Amount pattern
        // Guard: only trigger if user actually has a FonePay-enabled panel mapping
        if (!isGroup && senderNumber) {
            try {
                const fonepayService = require('./fonepayService');
                const parsed = fonepayService.parsePaymentMessage(message);

                if (parsed) {
                    // Pre-check: does this sender have a FonePay mapping?
                    // If not, fall through to normal command processing
                    const hasFonepay = await fonepayService.hasFonepayMapping(senderNumber, userId);


                    if (hasFonepay) {
                        console.log(`[BotHandler] FonePay pattern detected from ${senderNumber}: TXN=${parsed.txnId} Amount=${parsed.amount}`);

                        // Step 3 (Section 3): Send immediate acknowledgement before verification
                        const { FONEPAY_MESSAGES } = require('./fonepayService');
                        await this.sendResponse(deviceId, senderNumber, FONEPAY_MESSAGES.ACKNOWLEDGED);

                        const result = await fonepayService.processVerification(
                            senderNumber, parsed.txnId, parsed.amount, deviceId, userId
                        );

                        if (params._systemBotSubscriptionId) {
                            await this.incrementSystemBotUsage(params._systemBotSubscriptionId);
                        }

                        return {
                            handled: true,
                            type: 'fonepay_verification',
                            response: result.message
                        };
                    }
                }
            } catch (fonepayError) {
                console.error('[BotHandler] FonePay auto-detect error:', fonepayError.message);
                // Fall through to normal command processing
            }
        }
        // ==================== MULTI-PANEL DM WARNING ====================
        // If DM (not group) and device has multiple panels but no default panel set,
        // warn the user that a default panel must be configured by admin
        if (!isGroup && panelIds && panelIds.length > 1 && !panelId) {
            console.log(`[BotHandler] Multi-panel DM warning: device has ${panelIds.length} panels but no default panelId set`);
            return {
                handled: true,
                type: 'multi_panel_warning',
                response: '⚠️ This bot is connected to multiple panels but no default panel is set for DM support.\n\nPlease ask the admin to set a *Default Panel for DM* in Device Settings, or use group commands instead.'
            };
        }

        // ==================== UNREGISTERED USER CHECK ====================
        // If DM (not group) and sender has no mapping → start registration flow
        // Any message from unregistered user triggers "send your username" prompt
        if (!isGroup && senderNumber) {
            try {
                const userMappingService = require('./userMappingService');
                const existingMapping = await userMappingService.findByPhone(userId, senderNumber);

                if (!existingMapping) {
                    console.log(`[BotHandler] Unregistered user ${senderNumber} — starting registration flow`);

                    const conversationStateService = require('./conversationStateService');
                    const targetPanelIds = (panelIds && panelIds.length > 0) ? panelIds : (panelId ? [panelId] : []);

                    // Start registration conversation (creates AWAITING_USERNAME state)
                    const regStart = await conversationStateService.startRegistration({
                        senderPhone: senderNumber,
                        userId,
                        platform,
                        deviceId,
                        panelIds: targetPanelIds,
                        defaultPanelId: panelId || null  // Device's default panel for mapping
                    });

                    return {
                        handled: true,
                        type: 'registration_prompt',
                        response: regStart.message
                    };
                }
            } catch (regErr) {
                console.error('[BotHandler] Unregistered user check error:', regErr.message);
                // Fall through to normal processing
            }
        }

        // Priority 1: Check if it's an SMM command
        if (commandParser.isCommandMessage(message)) {
            const smmResult = await this.handleSmmCommand({
                userId,
                user,
                message,
                senderNumber,
                deviceId,
                panelId,
                panelIds,   // Pass panelIds for multi-panel lookup
                platform,
                isGroup,
                groupJid: params.groupJid,  // Pass groupJid for group-based ownership check
                isStaffOverride: params.isStaffOverride || false  // Staff Override Group bypass (Section 5)
            });
            // Increment system bot usage for SMM commands
            if (smmResult.handled && params._systemBotSubscriptionId) {
                await this.incrementSystemBotUsage(params._systemBotSubscriptionId);
            }

            // ==================== FORWARD-ONLY MODE (Bug 1.3) ====================
            // If device has forwardOnly enabled, suppress the reply response.
            // The command was fully processed (forwarding, logging, charging all happened),
            // but we don't want to send any reply back in the original chat.
            if (device?.forwardOnly && smmResult.handled) {
                console.log(`[BotHandler] Device ${deviceId} forwardOnly=true, suppressing reply for command`);
                return { ...smmResult, response: null };
            }

            return smmResult;
        }

        // Priority 2: Check auto-reply rules
        // Note: AutoReplyRule schema has no applyToGroups field,
        // so auto-reply rules only apply to DM (private) messages.
        // Group messages are handled by KeywordResponse (which HAS applyToGroups).
        if (!isGroup) {
            const autoReplyResult = await this.handleAutoReply({
                userId,
                message,
                senderNumber,
                senderName,
                deviceId,
                platform,
                isGroup
            });

            if (autoReplyResult.handled) {
                // Increment system bot usage for auto-replies
                if (params._systemBotSubscriptionId) {
                    await this.incrementSystemBotUsage(params._systemBotSubscriptionId);
                }
                return autoReplyResult;
            }
        }

        // Priority 3: Keyword Response matching
        // Check if incoming message matches any user-defined keyword rules
        try {
            const keywordResponseService = require('./keywordResponseService');
            const kwMatch = await keywordResponseService.findMatch(userId, message, {
                deviceId,
                platform,
                isGroup
            });

            if (kwMatch) {
                // Charge credit for keyword response
                const kwUser = await prisma.user.findUnique({
                    where: { id: userId },
                    select: { messageCredits: true, creditBalance: true, role: true, customWaRate: true, customTgRate: true, customGroupRate: true, discountRate: true, customCreditRate: true }
                });

                let kwCreditResult = { charged: false };
                if (kwUser.role !== 'MASTER_ADMIN' && kwUser.role !== 'ADMIN') {
                    try {
                        const isCreditsMode = await billingModeService.isCreditsMode();
                        if (isCreditsMode) {
                            kwCreditResult = await messageCreditService.chargeMessage(userId, platform, isGroup, kwUser);
                        } else {
                            kwCreditResult = await creditService.chargeMessage(userId, platform, isGroup, kwUser);
                        }
                        if (!kwCreditResult.charged && kwCreditResult.reason === 'insufficient_credits') {
                            return {
                                handled: true,
                                type: 'keyword_response',
                                response: `⚠️ Low message credits. Please top up to enable keyword responses.`,
                                creditCharged: false,
                                reason: 'insufficient_credits'
                            };
                        }
                    } catch (creditErr) {
                        console.error('[BotHandler] Keyword response credit error:', creditErr.message);
                    }
                }

                // Execute trigger action if configured (forward, webhook, etc.)
                try {
                    if (kwMatch.triggerAction && kwMatch.triggerAction !== 'NONE') {
                        await keywordResponseService.executeTriggerAction(kwMatch, {
                            senderNumber, message, deviceId
                        });
                    }
                } catch (actionErr) {
                    console.error('[BotHandler] Keyword trigger action error:', actionErr.message);
                }

                // Log
                await this.logMessage({
                    deviceId, userId, senderNumber,
                    content: message, type: 'keyword_response', platform,
                    creditCharged: kwCreditResult.amount || 0,
                    metadata: { keywordId: kwMatch.id, keyword: kwMatch.keyword }
                });

                // Increment system bot usage
                if (params._systemBotSubscriptionId) {
                    await this.incrementSystemBotUsage(params._systemBotSubscriptionId);
                }

                return {
                    handled: true,
                    type: 'keyword_response',
                    response: kwMatch.responseText,
                    mediaUrl: kwMatch.responseMedia || null,
                    keywordId: kwMatch.id,
                    creditCharged: kwCreditResult.charged,
                    creditAmount: kwCreditResult.amount
                };
            }
        } catch (kwError) {
            // Keyword response check failed — fall through to fallback
            console.log('[BotHandler] Keyword response check failed:', kwError.message);
        }

        // Priority 4: Reply to all messages fallback (DMs only)
        // If enabled, bot will reply to unmatched DM messages with a fallback response.
        // Groups are excluded to prevent the bot from responding to every single message.
        if (!isGroup) {
            try {
                const botFeatureService = require('./botFeatureService');
                const scope = {};
                if (deviceId) scope.deviceId = deviceId;
                if (panelId) scope.panelId = panelId;
                const botToggles = await botFeatureService.getToggles(userId, scope);

                if (botToggles?.replyToAllMessages) {
                    const fallbackMessage = botToggles.fallbackMessage ||
                        `I didn't understand your message.\n\n` +
                        `📋 *Available Commands:*\n` +
                        `• \`[Order ID] status\` - Check order status\n` +
                        `• \`[Order ID] refill\` - Request refill\n` +
                        `• \`[Order ID] cancel\` - Cancel order\n` +
                        `• \`ticket\` - View your tickets\n` +
                        `• \`.help\` - Show all commands\n\n` +
                        `Example: \`12345 status\``;

                    console.log(`[BotHandler] No handler matched, sending fallback response (DM only)`);
                    // Increment system bot usage for fallback
                    if (params._systemBotSubscriptionId) {
                        await this.incrementSystemBotUsage(params._systemBotSubscriptionId);
                    }
                    return {
                        handled: true,
                        type: 'fallback',
                        response: fallbackMessage
                    };
                }
            } catch (fallbackError) {
                console.log(`[BotHandler] Fallback check error:`, fallbackError.message);
            }
        }

        // No handler matched
        return { handled: false, reason: 'no_handler' };
    }

    /**
     * Increment usage count for a system bot subscription
     */
    async incrementSystemBotUsage(subscriptionId) {
        try {
            await prisma.systemBotSubscription.update({
                where: { id: subscriptionId },
                data: { usageCount: { increment: 1 } }
            });
        } catch (err) {
            console.error(`[BotHandler] Failed to increment system bot usage:`, err.message);
        }
    }

    /**
     * Handle utility commands (.groupid, .ping, .deviceid, .help)
     */
    async handleUtilityCommand(params) {
        const { message, senderNumber, deviceId, isGroup, groupJid } = params;

        const cmd = message.toLowerCase().trim();

        // .groupid - Show group ID
        if (cmd === '.groupid' || cmd === '/groupid') {
            if (!isGroup) {
                return {
                    handled: true,
                    type: 'utility',
                    response: '❌ This command only works in groups.'
                };
            }

            // Get group JID from device's last message
            const device = await prisma.device.findUnique({
                where: { id: deviceId }
            });

            return {
                handled: true,
                type: 'utility',
                response: `📱 *Group Information*\n\n` +
                    `🆔 Group JID: \`${groupJid || 'Not available'}\`\n` +
                    `📍 Device: ${device?.name || deviceId}\n` +
                    `👤 Your Number: ${senderNumber}`
            };
        }

        // .ping - Check if bot is alive
        if (cmd === '.ping' || cmd === '/ping') {
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            return {
                handled: true,
                type: 'utility',
                response: `🏓 *Pong!*\n\n` +
                    `⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s\n` +
                    `📱 Device: ${deviceId.substring(0, 8)}...`
            };
        }

        // .deviceid - Show device ID
        if (cmd === '.deviceid' || cmd === '/deviceid') {
            const device = await prisma.device.findUnique({
                where: { id: deviceId },
                select: { id: true, name: true, phone: true }
            });

            return {
                handled: true,
                type: 'utility',
                response: `📱 *Device Information*\n\n` +
                    `🆔 Device ID: \`${deviceId}\`\n` +
                    `📛 Name: ${device?.name || 'Unknown'}\n` +
                    `📞 Phone: ${device?.phone || 'Not set'}`
            };
        }

        // .help - Show available commands
        if (cmd === '.help' || cmd === '/help' || cmd === '.commands') {
            return {
                handled: true,
                type: 'utility',
                response: `📚 *Available Commands*\n\n` +
                    `*Utility:*\n` +
                    `• \`.ping\` - Check bot status\n` +
                    `• \`.groupid\` - Get group ID (groups only)\n` +
                    `• \`.deviceid\` - Get device info\n` +
                    `• \`.help\` - Show this help\n\n` +
                    `*SMM Commands:*\n` +
                    `• \`[order_id] status\` - Check order status\n` +
                    `• \`[order_id] refill\` - Request refill\n` +
                    `• \`[order_id] cancel\` - Request cancel\n` +
                    `• \`status [order_id]\` - Alternative format\n\n` +
                    `*Support:*\n` +
                    `• \`ticket\` - View your tickets\n` +
                    `• \`ticket [TICKET_NUMBER]\` - Check ticket status`
            };
        }

        return { handled: false };
    }


    /**
     * Handle SMM command
     */
    async handleSmmCommand(params) {
        const { userId, user, message, senderNumber, deviceId, panelId, panelIds, platform = 'WHATSAPP', isGroup = false, isStaffOverride = false, groupJid } = params;

        // Check billing mode
        const isCreditsMode = await billingModeService.isCreditsMode();

        // Check if user has sufficient balance based on billing mode
        if (user.role !== 'MASTER_ADMIN' && user.role !== 'ADMIN') {
            if (isCreditsMode) {
                // CREDITS MODE: Check message credits
                const creditsPerMessage = user.customCreditRate || 1;
                const userCredits = user.messageCredits || 0;

                if (userCredits < creditsPerMessage) {
                    console.log(`[BotHandler] Insufficient message credits for ${userId} (has: ${userCredits}, needs: ${creditsPerMessage})`);
                    return {
                        handled: true,
                        type: 'smm_command',
                        response: `⚠️ Your message credits are low (${userCredits} credits remaining). Please buy more credits to continue using the bot.\n\nVisit your dashboard to top up.`,
                        creditCharged: false,
                        reason: 'insufficient_credits'
                    };
                }
            } else {
                // DOLLARS MODE: Check dollar balance
                const rate = await creditService.getMessageRate(platform, isGroup, user);
                if ((user.creditBalance || 0) < rate) {
                    console.log(`[BotHandler] Insufficient balance for ${userId}`);
                    return {
                        handled: true,
                        type: 'smm_command',
                        response: `⚠️ Your credit balance is low ($${(user.creditBalance || 0).toFixed(2)}). Please top up to continue using the bot.`,
                        creditCharged: false,
                        reason: 'insufficient_balance'
                    };
                }
            }
        }

        // ==================== DETECT BULK + V1/RENTAL FOR ASYNC PROCESSING ====================
        // Parse message to check if it's a bulk command targeting V1/Rental panel
        const parsedCmd = commandParser.parse(message);
        const isBulkCommand = parsedCmd && parsedCmd.orderIds && parsedCmd.orderIds.length > 1;

        let asyncBulk = false;
        if (isBulkCommand) {
            try {
                const targetPanelIds = (panelIds && panelIds.length > 0) ? panelIds : (panelId ? [panelId] : []);
                if (targetPanelIds.length > 0) {
                    const firstPanel = await prisma.smmPanel.findUnique({
                        where: { id: targetPanelIds[0] },
                        select: { panelType: true }
                    });
                    const pType = (firstPanel?.panelType || '').toUpperCase();
                    if (pType === 'V1' || pType === 'RENTAL') {
                        asyncBulk = true;
                    }
                }
            } catch (e) { /* non-critical */ }
        }

        if (asyncBulk) {
            // ==================== ASYNC BULK MODE ====================
            // Send instant acknowledgment, process in background
            const orderCount = parsedCmd.orderIds.length;
            const commandDisplay = commandParser.getDisplayCommand(parsedCmd.command);

            console.log(`[BotHandler] Async bulk mode: ${orderCount} orders for ${commandDisplay}`);

            // Charge upfront
            let creditResult = { charged: false };
            try {
                if (isCreditsMode) {
                    creditResult = await messageCreditService.chargeMessage(userId, platform, isGroup, user);
                } else {
                    creditResult = await creditService.chargeMessage(userId, platform, isGroup, user);
                }
            } catch (error) {
                console.error(`[BotHandler] Charge error:`, error);
            }

            // Process in background (fire-and-forget)
            const bgParams = { userId, panelId, panelIds, deviceId, message, senderNumber, platform, isGroup, groupJid, isStaffOverride };
            setImmediate(async () => {
                try {
                    const result = await commandHandler.processCommand(bgParams);

                    // Send results via WhatsApp
                    if (result.formattedResponse && this.whatsappService) {
                        const replyJid = groupJid || `${senderNumber}@s.whatsapp.net`;
                        await this.whatsappService.sendMessage(deviceId, replyJid, result.formattedResponse);
                        console.log(`[BotHandler] Async bulk results sent for ${orderCount} orders`);
                    }

                    // Log the message
                    await this.logMessage({
                        deviceId, userId, senderNumber,
                        content: message, type: 'smm_command', platform,
                        creditCharged: creditResult.amount || 0,
                        metadata: {
                            command: result.command,
                            orderCount: result.summary?.total || 0,
                            success: result.summary?.success || 0,
                            failed: result.summary?.failed || 0
                        }
                    });
                } catch (bgErr) {
                    console.error(`[BotHandler] Async bulk processing error:`, bgErr.message);
                }
            });

            // Return instant acknowledgment
            return {
                handled: true,
                type: 'smm_command',
                response: `⏳ Processing ${orderCount} orders for *${commandDisplay}*...\n\n_Results will be sent shortly. Please wait._`,
                creditCharged: creditResult.charged,
                creditAmount: creditResult.amount
            };
        }

        // ==================== SYNC MODE (single order or V2/Perfect panel) ====================
        // Process the command with panelId(s) for panel-specific order lookup
        const result = await commandHandler.processCommand({
            userId,
            panelId,
            panelIds,   // Pass panelIds for multi-panel order lookup
            deviceId,   // Pass deviceId for per-device settings/templates
            message,
            senderNumber,
            platform,
            isGroup,
            groupJid,   // Pass groupJid for group-based ownership check
            isStaffOverride  // Staff Override Group bypass (Section 5)
        });

        if (!result.success && result.error) {
            // Command parsing failed - might not be a valid command
            return {
                handled: false,
                type: 'smm_command',
                reason: 'parse_error',
                error: result.error
            };
        }

        // Check if registration is needed (all orders returned needs_registration)
        const allNeedRegistration = !isGroup && result.responses?.length > 0 &&
            result.responses.every(r => r.details?.reason === 'needs_registration');
        if (allNeedRegistration) {
            // Start registration conversation
            const conversationStateService = require('./conversationStateService');
            const regStart = await conversationStateService.startRegistration({
                senderPhone: senderNumber,
                userId,
                platform,
                deviceId,
                panelIds
            });
            console.log(`[BotHandler] Registration flow started for ${senderNumber}`);
            return {
                handled: true,
                type: 'registration_prompt',
                response: regStart.message
            };
        }

        // Charge based on billing mode
        let creditResult = { charged: false };
        try {
            if (isCreditsMode) {
                creditResult = await messageCreditService.chargeMessage(userId, platform, isGroup, user);
            } else {
                creditResult = await creditService.chargeMessage(userId, platform, isGroup, user);
            }
        } catch (error) {
            console.error(`[BotHandler] Charge error:`, error);
        }

        // Log the message
        await this.logMessage({
            deviceId,
            userId,
            senderNumber,
            content: message,
            type: 'smm_command',
            platform,
            creditCharged: creditResult.amount || 0,
            metadata: {
                command: result.command,
                orderCount: result.summary?.total || 0,
                success: result.summary?.success || 0,
                failed: result.summary?.failed || 0
            }
        });

        return {
            handled: true,
            type: 'smm_command',
            response: result.formattedResponse,
            command: result.command,
            summary: result.summary,
            creditCharged: creditResult.charged,
            creditAmount: creditResult.amount
        };
    }

    /**
     * Handle auto-reply rules
     */
    async handleAutoReply(params) {
        const { userId, message, senderNumber, senderName, deviceId, platform = 'WHATSAPP', isGroup = false } = params;

        // Get active auto-reply rules for this user
        const rules = await prisma.autoReplyRule.findMany({
            where: {
                userId,
                isActive: true,
                isCommandHandler: false // Exclude SMM command handlers (handled separately)
            },
            orderBy: { priority: 'desc' }
        });

        for (const rule of rules) {
            if (this.matchesRule(message, rule)) {
                // Found matching rule
                const response = this.processTemplate(rule.response, {
                    senderNumber,
                    senderName,
                    message
                });

                // Charge credit for response
                const user = await prisma.user.findUnique({
                    where: { id: userId },
                    select: { messageCredits: true, creditBalance: true, role: true, customWaRate: true, customTgRate: true, customGroupRate: true, discountRate: true, customCreditRate: true }
                });

                let creditResult = { charged: false };
                if (user.role !== 'MASTER_ADMIN' && user.role !== 'ADMIN') {
                    try {
                        // Check billing mode (same pattern as handleSmmCommand)
                        const isCreditsMode = await billingModeService.isCreditsMode();
                        if (isCreditsMode) {
                            creditResult = await messageCreditService.chargeMessage(userId, platform, isGroup, user);
                        } else {
                            creditResult = await creditService.chargeMessage(userId, platform, isGroup, user);
                        }

                        if (!creditResult.charged && creditResult.reason === 'insufficient_credits') {
                            return {
                                handled: true,
                                type: 'auto_reply',
                                response: `⚠️ Low message credits. Please top up to enable auto-replies.`,
                                creditCharged: false,
                                reason: 'insufficient_credits'
                            };
                        }
                    } catch (error) {
                        console.error(`[BotHandler] Auto-reply credit error:`, error);
                    }
                }

                // Log
                await this.logMessage({
                    deviceId,
                    userId,
                    senderNumber,
                    content: message,
                    type: 'auto_reply',
                    platform,
                    creditCharged: creditResult.amount || 0,
                    metadata: { ruleId: rule.id, ruleName: rule.name }
                });

                return {
                    handled: true,
                    type: 'auto_reply',
                    response,
                    ruleId: rule.id,
                    creditCharged: creditResult.charged,
                    creditAmount: creditResult.amount
                };
            }
        }

        return { handled: false };
    }

    /**
     * Check if message matches a rule
     */
    matchesRule(message, rule) {
        const normalizedMessage = message.toLowerCase().trim();
        const trigger = rule.keywords.toLowerCase().trim();

        switch (rule.triggerType) {
            case 'exact':
                return normalizedMessage === trigger;
            case 'contains':
                return normalizedMessage.includes(trigger);
            case 'startsWith':
                return normalizedMessage.startsWith(trigger);
            case 'regex':
                return safeRegexTest(rule.keywords, message, 'i');
            default:
                return normalizedMessage.includes(trigger);
        }
    }

    /**
     * Process template variables in response
     */
    processTemplate(template, variables) {
        let result = template;

        // Replace variables
        result = result.replace(/\{sender\}/gi, variables.senderName || variables.senderNumber);
        result = result.replace(/\{number\}/gi, variables.senderNumber);
        result = result.replace(/\{message\}/gi, variables.message);
        result = result.replace(/\{time\}/gi, new Date().toLocaleTimeString());
        result = result.replace(/\{date\}/gi, new Date().toLocaleDateString());

        return result;
    }

    /**
     * Log message to database
     */
    async logMessage(params) {
        const { deviceId, userId, content, type, platform, creditCharged, metadata } = params;

        try {
            await prisma.message.create({
                data: {
                    deviceId,
                    type: 'incoming',
                    to: 'bot',
                    from: params.senderNumber || 'unknown',
                    message: content,  // Schema uses 'message' field, not 'content'
                    status: 'received',
                    creditCharged: creditCharged || 0
                    // Note: 'platform' and 'metadata' are not in Message schema
                }
            });
        } catch (error) {
            console.error(`[BotHandler] Failed to log message:`, error);
        }
    }

    /**
     * Send response via WhatsApp
     */
    async sendResponse(deviceId, to, message) {
        if (!this.whatsappService) {
            console.error('[BotHandler] WhatsApp service not set');
            return false;
        }

        try {
            await this.whatsappService.sendMessage(deviceId, to, message);
            return true;
        } catch (error) {
            console.error(`[BotHandler] Failed to send response:`, error);
            return false;
        }
    }
    /**
     * Track marketing interval — increment counter and trigger if threshold reached
     * This runs async (fire-and-forget) so it doesn't block message processing
     * 
     * Uses a two-phase atomic approach to prevent race conditions:
     * Phase 1: Atomically increment the counter
     * Phase 2: Atomically try to "claim" the trigger by resetting only if messageCount >= interval
     *          If another concurrent message already claimed it, updateMany returns 0 → skip
     */
    async trackMarketingInterval(deviceId, userId, groupJid) {
        // Phase 1: Atomically increment the counter for active intervals matching this device+group
        const updated = await prisma.marketingInterval.updateMany({
            where: {
                deviceId,
                userId,
                groupJid,
                isActive: true
            },
            data: {
                messageCount: { increment: 1 }
            }
        });

        // If no matching interval exists, skip
        if (updated.count === 0) return;

        // Fetch the interval to get its config (interval threshold, message, mediaUrl)
        const marketingInterval = await prisma.marketingInterval.findFirst({
            where: {
                deviceId,
                userId,
                groupJid,
                isActive: true
            }
        });

        if (!marketingInterval || marketingInterval.messageCount < marketingInterval.interval) return;

        // Phase 2: Atomically claim the trigger — reset counter ONLY if still >= threshold
        // This prevents double-trigger when two messages arrive at the same time
        const claimed = await prisma.marketingInterval.updateMany({
            where: {
                id: marketingInterval.id,
                isActive: true,
                messageCount: { gte: marketingInterval.interval }
            },
            data: {
                messageCount: 0,
                lastTriggeredAt: new Date(),
                triggerCount: { increment: 1 }
            }
        });

        // If another concurrent message already claimed and reset it, skip
        if (claimed.count === 0) return;

        console.log(`[MarketingInterval] Threshold reached for device ${deviceId} group ${groupJid}: ${marketingInterval.messageCount}/${marketingInterval.interval}`);

        // Send the marketing message
        try {
            if (marketingInterval.mediaUrl && this.whatsappService?.sendImage) {
                await this.whatsappService.sendImage(deviceId, groupJid, marketingInterval.mediaUrl, marketingInterval.message);
            } else {
                await this.sendResponse(deviceId, groupJid, marketingInterval.message);
            }
            console.log(`[MarketingInterval] Marketing message sent to group ${groupJid} (trigger #${marketingInterval.triggerCount + 1})`);
        } catch (sendErr) {
            console.error(`[MarketingInterval] Failed to send marketing message:`, sendErr.message);
        }
    }

    /**
     * Check if a group is a Provider Support Group (forward-only, no replies)
     * @param {string} userId - User ID
     * @param {string} groupJid - WhatsApp group JID
     * @returns {boolean} - True if this is a provider support group
     */
    async isProviderSupportGroup(userId, groupJid) {
        try {
            // Check if this groupJid is configured as a provider support group
            const providerConfig = await prisma.providerConfig.findFirst({
                where: {
                    userId,
                    OR: [
                        { whatsappGroupJid: groupJid },
                        { errorGroupJid: groupJid }
                    ],
                    isActive: true
                }
            });

            return !!providerConfig;
        } catch (error) {
            console.error(`[BotHandler] Error checking provider support group:`, error.message);
            return false;
        }
    }

    // ==================== SPAM PROTECTION METHODS (1.4) ====================

    /**
     * Check if a user is spam-blocked or if their message triggers spam detection
     * @param {string} userId - Device owner's user ID
     * @param {string} deviceId - Device ID
     * @param {string} senderNumber - Sender's phone number
     * @param {string} message - Message text
     * @returns {Object} { blocked: bool, response?: string, reason?: string }
     */
    async _checkSpamProtection(userId, deviceId, senderNumber, message) {
        const key = `${userId}:${senderNumber}`;

        // 1. Check if user is currently disabled
        const disabledUntil = this._disabledUsers.get(key);
        if (disabledUntil) {
            if (Date.now() < disabledUntil) {
                const remainMin = Math.ceil((disabledUntil - Date.now()) / 60000);
                return {
                    blocked: true,
                    response: null, // Silent block — no reply to spammer
                    reason: `temp_disabled (${remainMin}min remaining)`
                };
            }
            // Expired — remove block
            this._disabledUsers.delete(key);
        }

        // 2. Get spam protection settings
        const botFeatureService = require('./botFeatureService');
        const toggles = await botFeatureService.getToggles(userId, { deviceId });

        if (!toggles.spamProtectionEnabled) {
            return { blocked: false };
        }

        const threshold = toggles.spamRepeatThreshold || 3;
        const windowMs = (toggles.spamTimeWindowMinutes || 5) * 60 * 1000;
        const disableDurationMs = (toggles.spamDisableDurationMin || 60) * 60 * 1000;

        // 3. Track this message
        const now = Date.now();
        const normalizedText = message.trim().toLowerCase();

        if (!this._spamTracker.has(key)) {
            this._spamTracker.set(key, { messages: [], warned: false });
        }

        const tracker = this._spamTracker.get(key);

        // Add current message and clean old ones
        tracker.messages.push({ text: normalizedText, ts: now });
        tracker.messages = tracker.messages.filter(m => now - m.ts < windowMs);

        // 4. Count repeated same text
        const sameTextCount = tracker.messages.filter(m => m.text === normalizedText).length;

        if (sameTextCount >= threshold) {
            if (!tracker.warned) {
                // First time hitting threshold → send warning
                tracker.warned = true;
                const warningMsg = toggles.spamWarningMessage ||
                    `⚠️ *Spam Detected*\n\nYou have sent the same message ${sameTextCount} times.\nIf you continue, the bot will stop responding to you for ${toggles.spamDisableDurationMin || 60} minutes.`;
                return {
                    blocked: true,
                    response: warningMsg,
                    reason: 'spam_warning'
                };
            } else {
                // Already warned → disable user
                this._disabledUsers.set(key, now + disableDurationMs);
                this._spamTracker.delete(key); // Reset tracker

                const disableMin = toggles.spamDisableDurationMin || 60;
                const disableMsg = `🚫 *Bot Disabled*\n\nDue to repeated spam, the bot will not respond to your messages for ${disableMin} minutes.`;
                console.log(`[BotHandler] Spam: user ${senderNumber} disabled for ${disableMin}min (owner: ${userId})`);
                return {
                    blocked: true,
                    response: disableMsg,
                    reason: 'spam_disabled'
                };
            }
        }

        return { blocked: false };
    }

    /**
     * Cleanup expired spam tracker entries to prevent memory leaks
     */
    _cleanupSpamTrackers() {
        const now = Date.now();

        // Cleanup disabled users
        for (const [key, expiry] of this._disabledUsers.entries()) {
            if (now >= expiry) {
                this._disabledUsers.delete(key);
            }
        }

        // Cleanup old trackers (no messages in last 10 minutes)
        for (const [key, tracker] of this._spamTracker.entries()) {
            const recentMessages = tracker.messages.filter(m => now - m.ts < 10 * 60 * 1000);
            if (recentMessages.length === 0) {
                this._spamTracker.delete(key);
            } else {
                tracker.messages = recentMessages;
            }
        }
    }
}

module.exports = new BotMessageHandler();
