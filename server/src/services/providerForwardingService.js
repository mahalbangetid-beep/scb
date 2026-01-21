/**
 * Provider Forwarding Service
 * 
 * Service for managing multiple forwarding destinations for provider commands
 * Phase 5: Provider Integration - Multiple Forwarding
 * 
 * Features:
 * - Forward commands to multiple provider groups simultaneously
 * - Support API call + group message forwarding
 * - Per-provider destination configuration
 * - Message templates for different providers
 * - Response tracking from provider groups
 */

const prisma = require('../utils/prisma');

class ProviderForwardingService {
    constructor() {
        // Default message templates
        this.defaultTemplates = {
            refill: '🔄 *Refill Request*\n\nOrder: #{orderId}\nProvider Order: {providerOrderId}\nService: {serviceName}\nLink: {link}\nQuantity: {quantity}\n\nUsername: {username}',
            cancel: '❌ *Cancel Request*\n\nOrder: #{orderId}\nProvider Order: {providerOrderId}\nService: {serviceName}\nStatus: {status}\n\nUsername: {username}',
            speedup: '⚡ *Speed Up Request*\n\nOrder: #{orderId}\nProvider Order: {providerOrderId}\nService: {serviceName}\nStart Count: {startCount}\nRemains: {remains}\n\nUsername: {username}'
        };
    }

    /**
     * Get forwarding destinations for a provider
     */
    async getDestinations(userId, providerName) {
        // First try to find specific provider config
        const providerGroup = await prisma.providerGroup.findFirst({
            where: {
                userId,
                OR: [
                    { name: { contains: providerName, mode: 'insensitive' } },
                    { aliases: { contains: providerName } }
                ]
            }
        });

        if (!providerGroup) {
            return {
                found: false,
                destinations: []
            };
        }

        // Parse destinations from config
        const destinations = this.parseDestinations(providerGroup);

        return {
            found: true,
            providerGroup,
            destinations
        };
    }

    /**
     * Parse destinations from provider group config
     */
    parseDestinations(providerGroup) {
        const destinations = [];

        // Primary WhatsApp group
        if (providerGroup.whatsappGroupId) {
            destinations.push({
                type: 'WHATSAPP_GROUP',
                id: providerGroup.whatsappGroupId,
                name: providerGroup.name,
                isPrimary: true
            });
        }

        // Additional destinations from config
        if (providerGroup.forwardingConfig) {
            try {
                const config = typeof providerGroup.forwardingConfig === 'string'
                    ? JSON.parse(providerGroup.forwardingConfig)
                    : providerGroup.forwardingConfig;

                if (config.additionalGroups) {
                    for (const group of config.additionalGroups) {
                        destinations.push({
                            type: group.type || 'WHATSAPP_GROUP',
                            id: group.id,
                            name: group.name || 'Additional Group',
                            isPrimary: false
                        });
                    }
                }

                if (config.telegramChats) {
                    for (const chat of config.telegramChats) {
                        destinations.push({
                            type: 'TELEGRAM_CHAT',
                            id: chat.id,
                            name: chat.name || 'Telegram Chat',
                            isPrimary: false
                        });
                    }
                }

                if (config.webhooks) {
                    for (const webhook of config.webhooks) {
                        destinations.push({
                            type: 'WEBHOOK',
                            id: webhook.url,
                            name: webhook.name || 'Webhook',
                            isPrimary: false
                        });
                    }
                }
            } catch (e) {
                console.log('[ProviderForwarding] Error parsing config:', e.message);
            }
        }

        return destinations;
    }

    /**
     * Forward a command to all destinations
     * @returns {Object} { success, results, failedCount }
     */
    async forwardToAll(userId, order, command, options = {}) {
        const { providerName, customMessage, skipApi } = options;

        // Get provider destinations
        const { found, providerGroup, destinations } = await this.getDestinations(
            userId,
            providerName || order.providerName || 'unknown'
        );

        if (!found || destinations.length === 0) {
            return {
                success: false,
                error: 'No forwarding destinations configured for this provider',
                results: []
            };
        }

        // Generate message from template
        const message = customMessage || this.formatMessage(command, order, providerGroup);

        // Forward to all destinations
        const results = [];
        let successCount = 0;
        let failedCount = 0;

        for (const destination of destinations) {
            try {
                const result = await this.forwardToDestination(destination, message, order, userId);
                results.push({
                    destination: destination.name,
                    type: destination.type,
                    success: result.success,
                    messageId: result.messageId
                });

                if (result.success) successCount++;
                else failedCount++;
            } catch (error) {
                results.push({
                    destination: destination.name,
                    type: destination.type,
                    success: false,
                    error: error.message
                });
                failedCount++;
            }
        }

        // Also forward via API if configured and not skipped
        if (!skipApi && providerGroup?.apiEndpoint) {
            try {
                const apiResult = await this.forwardViaApi(providerGroup, command, order);
                results.push({
                    destination: 'Provider API',
                    type: 'API',
                    success: apiResult.success,
                    response: apiResult.response
                });

                if (apiResult.success) successCount++;
                else failedCount++;
            } catch (error) {
                results.push({
                    destination: 'Provider API',
                    type: 'API',
                    success: false,
                    error: error.message
                });
                failedCount++;
            }
        }

        // Log the forwarding action
        await this.logForwarding(userId, order, command, results);

        return {
            success: successCount > 0,
            totalDestinations: results.length,
            successCount,
            failedCount,
            results
        };
    }

    /**
     * Forward to a single destination
     */
    async forwardToDestination(destination, message, order, userId) {
        switch (destination.type) {
            case 'WHATSAPP_GROUP':
                return this.forwardToWhatsAppGroup(destination.id, message, userId);

            case 'TELEGRAM_CHAT':
                return this.forwardToTelegram(destination.id, message, userId);

            case 'WEBHOOK':
                return this.forwardToWebhook(destination.id, message, order);

            default:
                throw new Error(`Unknown destination type: ${destination.type}`);
        }
    }

    /**
     * Forward to WhatsApp group
     */
    async forwardToWhatsAppGroup(groupId, message, userId) {
        // Get user's connected device
        const device = await prisma.device.findFirst({
            where: {
                userId,
                status: 'connected'
            }
        });

        if (!device) {
            return { success: false, error: 'No connected WhatsApp device' };
        }

        try {
            // Use the WhatsApp service to send message
            const whatsAppService = require('./whatsapp');
            const result = await whatsAppService.sendMessage(device.id, groupId, message);

            return {
                success: true,
                messageId: result?.key?.id || null
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Forward to Telegram
     */
    async forwardToTelegram(chatId, message, userId) {
        // Get user's telegram bot
        const bot = await prisma.telegramBot.findFirst({
            where: {
                userId,
                status: 'connected'  // TelegramBot uses 'connected' status
            }
        });

        if (!bot) {
            return { success: false, error: 'No active Telegram bot' };
        }

        try {
            const telegramService = require('./telegram');
            const result = await telegramService.sendMessage(bot.id, chatId, message);

            return {
                success: true,
                messageId: result?.message_id || null
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Forward to webhook
     */
    async forwardToWebhook(webhookUrl, message, order) {
        try {
            const fetch = require('node-fetch');

            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'PROVIDER_FORWARD',
                    message,
                    order: {
                        id: order.id,
                        externalOrderId: order.externalOrderId,
                        providerOrderId: order.providerOrderId,
                        serviceName: order.serviceName,
                        status: order.status
                    },
                    timestamp: new Date().toISOString()
                }),
                timeout: 10000
            });

            return {
                success: response.ok,
                status: response.status
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Forward via provider API (if supported)
     */
    async forwardViaApi(providerGroup, command, order) {
        // This would call the provider's API to submit the command
        // Implementation depends on provider API structure

        if (!providerGroup.apiEndpoint || !providerGroup.apiKey) {
            return { success: false, error: 'No API configuration' };
        }

        try {
            const fetch = require('node-fetch');

            const apiPayload = {
                order: order.providerOrderId || order.externalOrderId,
                action: command.toLowerCase()
            };

            const response = await fetch(providerGroup.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${providerGroup.apiKey}`
                },
                body: JSON.stringify(apiPayload),
                timeout: 15000
            });

            const data = await response.json();

            return {
                success: response.ok,
                response: data
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Format message using template
     */
    formatMessage(command, order, providerGroup = null) {
        // Get template
        let template = this.defaultTemplates[command.toLowerCase()];

        if (providerGroup?.messageTemplates) {
            try {
                const templates = JSON.parse(providerGroup.messageTemplates);
                if (templates[command.toLowerCase()]) {
                    template = templates[command.toLowerCase()];
                }
            } catch (e) { }
        }

        if (!template) {
            template = this.defaultTemplates.refill; // Default fallback
        }

        // Replace placeholders
        const replacements = {
            '{orderId}': order.externalOrderId || order.id,
            '{providerOrderId}': order.providerOrderId || 'N/A',
            '{serviceName}': order.serviceName || 'Unknown Service',
            '{link}': order.link || 'N/A',
            '{quantity}': order.quantity || 0,
            '{status}': order.status || 'Unknown',
            '{startCount}': order.startCount || 0,
            '{remains}': order.remains || 0,
            '{username}': order.customerUsername || 'Unknown'
        };

        let message = template;
        for (const [key, value] of Object.entries(replacements)) {
            message = message.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
        }

        return message;
    }

    /**
     * Log forwarding activity
     */
    async logForwarding(userId, order, command, results) {
        try {
            await prisma.activityLog.create({
                data: {
                    userId,
                    action: 'PROVIDER_FORWARD',
                    category: 'ORDER',
                    details: JSON.stringify({
                        orderId: order.id,
                        externalOrderId: order.externalOrderId,
                        command,
                        destinations: results.map(r => ({
                            name: r.destination,
                            type: r.type,
                            success: r.success
                        }))
                    }),
                    ipAddress: 'system'
                }
            });
        } catch (error) {
            console.error('[ProviderForwarding] Failed to log:', error.message);
        }
    }

    /**
     * Update provider group forwarding config
     */
    async updateForwardingConfig(userId, providerGroupId, config) {
        return prisma.providerGroup.update({
            where: { id: providerGroupId },
            data: {
                forwardingConfig: JSON.stringify(config)
            }
        });
    }

    /**
     * Get all provider groups with forwarding config
     */
    async getProviderGroups(userId) {
        const groups = await prisma.providerGroup.findMany({
            where: { userId },
            orderBy: { name: 'asc' }
        });

        return groups.map(g => ({
            ...g,
            forwardingConfig: this.safeJSONParse(g.forwardingConfig, {}),
            messageTemplates: this.safeJSONParse(g.messageTemplates, {})
        }));
    }

    /**
     * Safe JSON parse
     */
    safeJSONParse(str, defaultValue = null) {
        try {
            return JSON.parse(str || '{}');
        } catch {
            return defaultValue;
        }
    }
}

module.exports = new ProviderForwardingService();
