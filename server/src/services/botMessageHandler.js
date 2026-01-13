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
     * @param {Object} params - { deviceId, userId, message, senderNumber, senderName, isGroup, platform }
     * @returns {Object} - { handled, response, type }
     */
    async handleMessage(params) {
        const { deviceId, userId, message, senderNumber, senderName, isGroup, platform = 'WHATSAPP' } = params;

        console.log(`[BotHandler] Processing message from ${senderNumber}: ${message.substring(0, 50)}...`);

        // Get user details
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                creditBalance: true,
                customWaRate: true,
                customTgRate: true,
                customGroupRate: true,
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

        // Priority 1: Check if it's an SMM command
        if (commandParser.isCommandMessage(message)) {
            return await this.handleSmmCommand({
                userId,
                user,
                message,
                senderNumber,
                deviceId,
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

        // No handler matched
        return { handled: false, reason: 'no_handler' };
    }


    /**
     * Handle SMM command
     */
    async handleSmmCommand(params) {
        const { userId, user, message, senderNumber, deviceId, platform, isGroup } = params;

        // Check if user has sufficient balance for response
        const rate = await creditService.getMessageRate(platform, isGroup, user);

        if (user.creditBalance < rate && user.role !== 'MASTER_ADMIN' && user.role !== 'ADMIN') {
            console.log(`[BotHandler] Insufficient balance for ${userId}`);

            // Send low balance warning
            const warningMessage = `⚠️ Your credit balance is low (${user.creditBalance.toFixed(2)}). Please top up to continue using the bot.`;

            return {
                handled: true,
                type: 'smm_command',
                response: warningMessage,
                creditCharged: false,
                reason: 'insufficient_balance'
            };
        }

        // Process the command
        const result = await commandHandler.processCommand({
            userId,
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

        // Charge credit for the response
        let creditResult = { charged: false };
        try {
            creditResult = await creditService.chargeMessage(userId, platform, isGroup, user);
        } catch (error) {
            console.error(`[BotHandler] Credit charge error:`, error);
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
        const { userId, message, senderNumber, senderName, deviceId, platform, isGroup } = params;

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
                    select: { creditBalance: true, role: true }
                });

                let creditResult = { charged: false };
                if (user.role !== 'MASTER_ADMIN' && user.role !== 'ADMIN') {
                    try {
                        creditResult = await creditService.chargeMessage(userId, platform, isGroup);

                        if (!creditResult.charged && creditResult.reason === 'insufficient_balance') {
                            return {
                                handled: true,
                                type: 'auto_reply',
                                response: `⚠️ Low balance. Please top up to enable auto-replies.`,
                                creditCharged: false,
                                reason: 'insufficient_balance'
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
                    content,
                    status: 'received',
                    platform,
                    creditCharged,
                    metadata: metadata ? JSON.stringify(metadata) : null
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
}

module.exports = new BotMessageHandler();
