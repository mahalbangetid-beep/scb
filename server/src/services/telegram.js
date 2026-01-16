/**
 * Telegram Bot Service
 * 
 * Service untuk mengelola Telegram Bot integration
 * Menggunakan Telegraf library untuk komunikasi dengan Telegram API
 */

const { Telegraf } = require('telegraf');
const prisma = require('../utils/prisma');
const { encrypt, decrypt } = require('../utils/encryption');

class TelegramService {
    constructor() {
        this.bots = new Map(); // Store active bot instances
        this.messageHandlers = new Map(); // Custom message handlers per bot
    }

    /**
     * Initialize service and load existing bots
     */
    async initialize() {
        console.log('[Telegram] Loading existing bots...');

        try {
            const connectedBots = await prisma.telegramBot.findMany({
                where: { status: 'connected' }
            });

            for (const bot of connectedBots) {
                try {
                    await this.startBot(bot.id);
                    console.log(`[Telegram] Bot ${bot.botUsername || bot.id} started`);
                } catch (error) {
                    console.error(`[Telegram] Failed to start bot ${bot.id}:`, error.message);
                    // Update status to disconnected
                    await prisma.telegramBot.update({
                        where: { id: bot.id },
                        data: { status: 'disconnected' }
                    });
                }
            }

            console.log(`[Telegram] Loaded ${this.bots.size} bot(s)`);
        } catch (error) {
            console.error('[Telegram] Failed to initialize:', error.message);
        }
    }

    /**
     * Create a new Telegram bot
     */
    async createBot(userId, botToken, panelId = null) {
        // Validate token format
        if (!botToken || !botToken.includes(':')) {
            throw new Error('Invalid bot token format');
        }

        // Test the token by getting bot info
        const tempBot = new Telegraf(botToken);
        let botInfo;

        try {
            botInfo = await tempBot.telegram.getMe();
        } catch (error) {
            throw new Error('Invalid bot token or bot not found');
        }

        // Check if bot already exists
        const existing = await prisma.telegramBot.findFirst({
            where: {
                userId,
                botUsername: botInfo.username
            }
        });

        if (existing) {
            throw new Error('This bot is already connected to your account');
        }

        // Encrypt and store
        const encryptedToken = encrypt(botToken);

        const telegramBot = await prisma.telegramBot.create({
            data: {
                userId,
                botToken: encryptedToken,
                botUsername: botInfo.username,
                botName: botInfo.first_name,
                panelId: panelId || null,  // Panel binding
                status: 'pending',
                isFreeLogin: await this.isFirstBot(userId)
            },
            include: {
                panel: {
                    select: {
                        id: true,
                        name: true,
                        alias: true
                    }
                }
            }
        });

        return {
            id: telegramBot.id,
            botUsername: botInfo.username,
            botName: botInfo.first_name,
            status: 'pending',
            panelId: telegramBot.panelId,
            panel: telegramBot.panel
        };
    }

    /**
     * Check if this is user's first bot (free login)
     */
    async isFirstBot(userId) {
        const count = await prisma.telegramBot.count({
            where: { userId }
        });
        return count === 0;
    }

    /**
     * Start a bot and begin listening
     */
    async startBot(botId) {
        const botRecord = await prisma.telegramBot.findUnique({
            where: { id: botId },
            include: {
                user: true,
                panel: {
                    select: {
                        id: true,
                        name: true,
                        alias: true
                    }
                }
            }
        });

        if (!botRecord) {
            throw new Error('Bot not found');
        }

        // Check if already running
        if (this.bots.has(botId)) {
            return { status: 'already_running' };
        }

        // Decrypt token
        const botToken = decrypt(botRecord.botToken);
        const bot = new Telegraf(botToken);

        // Verify bot token by calling getMe
        try {
            const botInfo = await bot.telegram.getMe();
            console.log(`[Telegram] Bot verified: @${botInfo.username}`);
        } catch (error) {
            throw new Error(`Invalid bot token: ${error.message}`);
        }

        // Setup message handlers
        this.setupBotHandlers(bot, botRecord);

        // Start polling in background (don't await - it never resolves while running)
        bot.launch({ dropPendingUpdates: true })
            .then(() => console.log(`[Telegram] Bot ${botRecord.botUsername} polling started`))
            .catch(err => console.error(`[Telegram] Bot ${botId} polling error:`, err.message));

        // Store bot instance
        this.bots.set(botId, bot);

        // Update status
        await prisma.telegramBot.update({
            where: { id: botId },
            data: {
                status: 'connected',
                lastActive: new Date()
            }
        });

        console.log(`[Telegram] Bot ${botRecord.botUsername} started successfully`);
        return { status: 'connected', botUsername: botRecord.botUsername };
    }

    /**
     * Stop a running bot
     */
    async stopBot(botId) {
        const bot = this.bots.get(botId);

        if (bot) {
            bot.stop('User requested stop');
            this.bots.delete(botId);
        }

        await prisma.telegramBot.update({
            where: { id: botId },
            data: { status: 'disconnected' }
        });

        return { status: 'disconnected' };
    }

    /**
     * Delete a bot
     */
    async deleteBot(botId, userId) {
        const bot = await prisma.telegramBot.findFirst({
            where: { id: botId, userId }
        });

        if (!bot) {
            throw new Error('Bot not found');
        }

        // Stop if running
        await this.stopBot(botId);

        // Delete from database
        await prisma.telegramBot.delete({
            where: { id: botId }
        });

        return { success: true };
    }

    /**
     * Setup message handlers for a bot
     */
    setupBotHandlers(bot, botRecord) {
        const userId = botRecord.userId;

        // Handle /start command
        bot.start(async (ctx) => {
            const firstName = ctx.from?.first_name || 'there';
            await ctx.reply(
                `👋 *Welcome, ${firstName}!*\n\n` +
                `I'm *${botRecord.botName || 'DICREWA Bot'}* - your SMM order assistant.\n\n` +
                `📌 *Quick Start:*\n` +
                `Send your order IDs followed by a command:\n` +
                `• \`123456 status\` - Check order status\n` +
                `• \`123,456 refill\` - Request refill\n\n` +
                `Type /help for all commands.`,
                { parse_mode: 'Markdown' }
            );
        });

        // Handle /help command
        bot.help(async (ctx) => {
            await ctx.reply(
                `📚 *${botRecord.botName || 'DICREWA'} - Command Reference*\n\n` +
                `*Order Commands:*\n` +
                `Send order IDs followed by a command:\n\n` +
                `🔄 *Refill* - Request order refill\n` +
                `   \`123456 refill\` or \`123456 rf\`\n\n` +
                `❌ *Cancel* - Request order cancellation\n` +
                `   \`123456 cancel\` or \`123456 cn\`\n\n` +
                `📊 *Status* - Check order status\n` +
                `   \`123456 status\` or \`123456 st\`\n\n` +
                `⚡ *Speed Up* - Speed up order processing\n` +
                `   \`123456 speed\` or \`123456 sp\`\n\n` +
                `*Multiple Orders:*\n` +
                `Use commas or spaces to separate:\n` +
                `   \`123, 456, 789 refill\`\n` +
                `   \`123 456 789 status\`\n\n` +
                `*Tips:*\n` +
                `• Commands are case-insensitive\n` +
                `• You can use short aliases (rf, cn, st, sp)\n` +
                `• Results will show status for each order`,
                { parse_mode: 'Markdown' }
            );
        });

        // Handle text messages
        bot.on('text', async (ctx) => {
            try {
                await this.handleIncomingMessage(botRecord, ctx);
            } catch (error) {
                console.error('[Telegram] Message handler error:', error.message);
                await ctx.reply('Sorry, an error occurred processing your message.');
            }
        });

        // Handle errors
        bot.catch((err, ctx) => {
            console.error(`[Telegram] Bot error for ${botRecord.botUsername}:`, err.message);
        });
    }

    /**
     * Handle incoming message from Telegram
     */
    async handleIncomingMessage(botRecord, ctx) {
        const message = ctx.message;
        const text = message.text;
        const chatId = message.chat.id.toString();
        const fromUser = message.from;

        // Detect if message is from a group/supergroup/channel
        const isGroup = message.chat.type !== 'private';
        const chatType = message.chat.type; // private, group, supergroup, channel

        // In groups, get actual sender ID (different from chat ID)
        const senderNumber = isGroup
            ? `tg_${fromUser.id}`
            : `tg_${chatId}`;

        // Log message to database
        await prisma.message.create({
            data: {
                telegramBotId: botRecord.id,
                platform: 'TELEGRAM',
                type: 'incoming',
                from: senderNumber,
                fromName: `${fromUser.first_name || ''} ${fromUser.last_name || ''}`.trim(),
                message: text,
                status: 'received'
            }
        });

        // Update last active
        await prisma.telegramBot.update({
            where: { id: botRecord.id },
            data: { lastActive: new Date() }
        });

        // Check if it's an SMM command using the same parser as WhatsApp
        const commandParser = require('./commandParser');

        if (commandParser.isCommandMessage(text)) {
            await this.handleSmmCommand(botRecord, ctx, text);
        } else {
            // Check auto-reply rules
            await this.checkAutoReply(botRecord, ctx, text);
        }
    }

    /**
     * Handle SMM command from Telegram
     * Integrates with commandHandler for actual order processing
     */
    async handleSmmCommand(botRecord, ctx, text) {
        const commandHandler = require('./commandHandler');
        const creditService = require('./creditService');

        // Get chat info for sender identification
        const chatId = ctx.message.chat.id.toString();
        const fromUser = ctx.message.from;
        const isGroup = ctx.message.chat.type !== 'private';
        // For groups, use actual sender ID; for private chats, use chat ID
        const senderNumber = isGroup
            ? `tg_${fromUser.id}`
            : `tg_${chatId}`;

        try {
            // Get user for balance check
            const user = await prisma.user.findUnique({
                where: { id: botRecord.userId },
                select: {
                    id: true,
                    creditBalance: true,
                    role: true,
                    customTgRate: true,
                    customGroupRate: true,
                    discountRate: true
                }
            });

            // Check if user has sufficient balance
            const rate = await creditService.getMessageRate('TELEGRAM', isGroup, user);
            if (user && user.creditBalance < rate && user.role !== 'MASTER_ADMIN' && user.role !== 'ADMIN') {
                await ctx.reply(
                    `⚠️ *Insufficient Balance*\n\n` +
                    `Your credit balance is low (${user.creditBalance.toFixed(2)}).\n` +
                    `Please top up to continue using the bot.`,
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            // Send processing message
            const processingMsg = await ctx.reply(
                '⏳ Processing your command...',
                { parse_mode: 'Markdown' }
            );

            // Call the command handler with proper parameters
            // Pass panelId for panel-specific order lookup
            const result = await commandHandler.processCommand({
                userId: botRecord.userId,
                panelId: botRecord.panelId,  // Pass panelId for panel-specific lookup
                message: text,
                senderNumber: senderNumber,
                platform: 'TELEGRAM',
                isGroup: isGroup
            });

            // Log panel info if bound
            if (botRecord.panelId) {
                console.log(`[Telegram] Command processed for panel: ${botRecord.panel?.alias || botRecord.panel?.name || botRecord.panelId}`);
            }

            // Delete processing message
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
            } catch (e) {
                // Ignore errors when deleting message
            }

            if (!result.success && result.error) {
                await ctx.reply(`❌ ${result.error}`);
                return;
            }

            // Charge credit for the response
            let creditResult = { charged: false, amount: 0 };
            try {
                creditResult = await creditService.chargeMessage(botRecord.userId, 'TELEGRAM', isGroup, user);
            } catch (error) {
                console.error(`[Telegram] Credit charge error:`, error.message);
            }

            // Format and send response
            if (result.formattedResponse) {
                // Use the pre-formatted response from commandHandler
                await ctx.reply(result.formattedResponse, { parse_mode: 'Markdown' });
            } else {
                // Fallback formatting
                const summary = result.summary || {};
                const responses = result.responses || [];
                const command = result.command?.toUpperCase() || 'COMMAND';

                let responseText = `📋 *${command} Results*\n\n`;

                for (const resp of responses) {
                    const icon = resp.success ? '✅' : '❌';
                    responseText += `${icon} Order ${resp.orderId}: ${resp.message}\n`;
                    if (resp.details) {
                        if (resp.details.status) {
                            responseText += `   └ Status: ${resp.details.status}\n`;
                        }
                        if (resp.details.remains !== undefined) {
                            responseText += `   └ Remains: ${resp.details.remains}\n`;
                        }
                    }
                }

                responseText += `\n📊 *Summary:* ${summary.success || 0}/${summary.total || 0} successful`;
                if (summary.failed > 0) {
                    responseText += `, ${summary.failed} failed`;
                }

                await ctx.reply(responseText, { parse_mode: 'Markdown' });
            }

            // Log command execution
            console.log(`[Telegram] Command executed: ${result.command} for ${result.summary?.total || 0} orders by user ${botRecord.userId} (charged: ${creditResult.amount})`);

            // Update last active time
            await prisma.telegramBot.update({
                where: { id: botRecord.id },
                data: { lastActive: new Date() }
            });

        } catch (error) {
            console.error('[Telegram] Command processing error:', error);
            await ctx.reply(
                `❌ *Error processing command*\n\n` +
                `${error.message}\n\n` +
                `Please try again or contact support.`,
                { parse_mode: 'Markdown' }
            );
        }
    }

    /**
     * Check auto-reply rules
     */
    async checkAutoReply(botRecord, ctx, text) {
        // Get user's auto-reply rules for Telegram
        const rules = await prisma.autoReplyRule.findMany({
            where: {
                userId: botRecord.userId,
                isActive: true
            },
            orderBy: { priority: 'desc' }
        });

        for (const rule of rules) {
            const keywords = rule.keywords.split(',').map(k => k.trim().toLowerCase());
            const textLower = text.toLowerCase();

            const matched = keywords.some(keyword => {
                if (rule.matchType === 'exact') {
                    return textLower === keyword;
                } else if (rule.matchType === 'contains') {
                    return textLower.includes(keyword);
                } else if (rule.matchType === 'startsWith') {
                    return textLower.startsWith(keyword);
                }
                return false;
            });

            if (matched) {
                await ctx.reply(rule.response);
                return;
            }
        }

        // No rule matched - send default response or nothing
        // await ctx.reply('Message received! We\'ll get back to you soon.');
    }

    /**
     * Send message via bot
     */
    async sendMessage(botId, chatId, message, options = {}) {
        const bot = this.bots.get(botId);

        if (!bot) {
            // Try to start the bot
            await this.startBot(botId);
            const startedBot = this.bots.get(botId);
            if (!startedBot) {
                throw new Error('Bot is not running');
            }
        }

        const activeBot = this.bots.get(botId);

        try {
            const result = await activeBot.telegram.sendMessage(chatId, message, {
                parse_mode: options.parseMode || 'HTML',
                ...options
            });

            // Log outgoing message
            await prisma.message.create({
                data: {
                    deviceId: botId,
                    platform: 'TELEGRAM',
                    type: 'outgoing',
                    to: chatId,
                    message: message,
                    status: 'sent'
                }
            });

            return { success: true, messageId: result.message_id };
        } catch (error) {
            throw new Error(`Failed to send message: ${error.message}`);
        }
    }

    /**
     * Get bot status
     */
    async getBotStatus(botId) {
        const bot = await prisma.telegramBot.findUnique({
            where: { id: botId }
        });

        if (!bot) {
            throw new Error('Bot not found');
        }

        const isRunning = this.bots.has(botId);

        return {
            id: bot.id,
            botUsername: bot.botUsername,
            botName: bot.botName,
            status: isRunning ? 'connected' : bot.status,
            lastActive: bot.lastActive,
            isFreeLogin: bot.isFreeLogin
        };
    }

    /**
     * Get all bots for a user
     */
    async getUserBots(userId) {
        const bots = await prisma.telegramBot.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: {
                panel: {
                    select: {
                        id: true,
                        name: true,
                        alias: true
                    }
                }
            }
        });

        return bots.map(bot => ({
            id: bot.id,
            botUsername: bot.botUsername,
            botName: bot.botName,
            status: this.bots.has(bot.id) ? 'connected' : bot.status,
            panelId: bot.panelId,
            panel: bot.panel,
            lastActive: bot.lastActive,
            isFreeLogin: bot.isFreeLogin,
            createdAt: bot.createdAt
        }));
    }

    /**
     * Shutdown all bots gracefully
     */
    async shutdown() {
        console.log('[Telegram] Shutting down all bots...');

        for (const [botId, bot] of this.bots) {
            try {
                bot.stop('Server shutdown');
            } catch (error) {
                console.error(`[Telegram] Error stopping bot ${botId}:`, error.message);
            }
        }

        this.bots.clear();
        console.log('[Telegram] All bots stopped');
    }
}

// Export singleton instance
module.exports = new TelegramService();
