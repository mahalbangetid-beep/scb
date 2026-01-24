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

class BotMessageHandler {
    constructor() {
        this.io = null;
        this.whatsappService = null;
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
        const { deviceId, userId, panelId, panel, message, senderNumber, senderName, isGroup, groupJid, platform = 'WHATSAPP' } = params;

        console.log(`[BotHandler] Processing message from ${senderNumber}${panelId ? ` (Panel: ${panel?.alias || panel?.name || panelId})` : ''}: ${message.substring(0, 50)}...`);

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

        // Priority 0.5: Handle utility commands (.groupid, .ping, .help)
        const utilityResult = await this.handleUtilityCommand({
            message,
            senderNumber,
            deviceId,
            isGroup,
            groupJid: params.groupJid  // Pass group JID if available
        });
        if (utilityResult.handled) {
            return utilityResult;
        }

        // Priority 1: Check if it's an SMM command
        if (commandParser.isCommandMessage(message)) {
            return await this.handleSmmCommand({
                userId,
                user,
                message,
                senderNumber,
                deviceId,
                panelId,    // Pass panelId for panel-specific order lookup
                platform,
                isGroup
            });
        }

        // Priority 2: Check auto-reply rules
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
            return autoReplyResult;
        }

        // Priority 3: Custom keyword workflows (future)
        // ... implementasi di Phase berikutnya

        // Priority 4: Reply to all messages fallback
        // If enabled, bot will reply to ANY message with a fallback response
        try {
            const botToggles = await prisma.botFeatureToggles.findUnique({
                where: { userId }
            });

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

                console.log(`[BotHandler] No handler matched, sending fallback response`);
                return {
                    handled: true,
                    type: 'fallback',
                    response: fallbackMessage
                };
            }
        } catch (fallbackError) {
            console.log(`[BotHandler] Fallback check error:`, fallbackError.message);
        }

        // No handler matched
        return { handled: false, reason: 'no_handler' };
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
        const { userId, user, message, senderNumber, deviceId, panelId, platform = 'WHATSAPP', isGroup = false } = params;

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

        // Process the command with panelId for panel-specific order lookup
        const result = await commandHandler.processCommand({
            userId,
            panelId,    // Pass panelId to filter orders by specific panel
            message,
            senderNumber,
            platform,
            isGroup
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
                    select: { messageCredits: true, role: true }
                });

                let creditResult = { charged: false };
                if (user.role !== 'MASTER_ADMIN' && user.role !== 'ADMIN') {
                    try {
                        creditResult = await messageCreditService.chargeMessage(userId, platform, isGroup);

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
        const trigger = rule.trigger.toLowerCase().trim();

        switch (rule.matchType) {
            case 'exact':
                return normalizedMessage === trigger;
            case 'contains':
                return normalizedMessage.includes(trigger);
            case 'startsWith':
                return normalizedMessage.startsWith(trigger);
            case 'regex':
                try {
                    const regex = new RegExp(rule.trigger, 'i');
                    return regex.test(message);
                } catch {
                    return false;
                }
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
}

module.exports = new BotMessageHandler();
