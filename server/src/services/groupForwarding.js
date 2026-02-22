/**
 * Group Forwarding Service
 * 
 * Service untuk forward perintah ke provider groups
 * Digunakan untuk refill, cancel, speed-up requests
 */

const prisma = require('../utils/prisma');
const { safeParseObject } = require('../utils/safeJson');
const logger = require('../utils/logger').service('GroupForward');

class GroupForwardingService {
    constructor() {
        this.whatsappService = null;
        this.io = null;
    }

    /**
     * Set dependencies
     */
    setDependencies(io, whatsappService) {
        this.io = io;
        this.whatsappService = whatsappService;
    }

    /**
     * Forward command to provider group
     * @param {Object} params - { orderId, command, panelId, userId, deviceId }
     */
    async forwardToGroup(params) {
        const { orderId, command, panelId, userId, deviceId } = params;

        // Get order details
        const order = await prisma.order.findFirst({
            where: {
                id: orderId,
                userId
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

        if (!order) {
            throw new Error('Order not found');
        }

        // Use forwardToProvider with the order
        return this.forwardToProvider({
            order,
            command,
            userId,
            providerOrderId: order.providerOrderId,
            providerName: order.providerName,
            deviceId
        });
    }

    /**
     * Forward NEW ORDER to provider group
     * Called when an order is first created/fetched from provider panel
     * 
     * @param {Object} params - { order, userId, deviceId }
     * @returns {Object} { success, message, groupName }
     */
    async forwardNewOrder(params) {
        const { order, userId, deviceId } = params;

        if (!order) {
            return { success: false, reason: 'no_order', message: 'Order object is required' };
        }

        // Only forward if order has provider info (meaning it was successfully sent to provider)
        if (!order.providerOrderId && !order.providerName) {
            logger.info(`Skipping NEW_ORDER forward for order ${order.externalOrderId} - no provider info`);
            return { success: false, reason: 'no_provider', message: 'No provider info available' };
        }

        logger.info(`📦 Forwarding NEW ORDER ${order.externalOrderId} to provider group...`);

        return this.forwardToProvider({
            order,
            command: 'NEW_ORDER',
            userId,
            providerOrderId: order.providerOrderId,
            providerName: order.providerName,
            deviceId
        });
    }

    /**
     * Forward command to provider-specific group using Provider Order ID
     * This is the primary method that uses Admin API data
     * 
     * Routing Priority:
     * 1. Service ID specific routing (if serviceIdRules match)
     * 2. Provider-specific group
     * 3. Manual service group (if no provider)
     * 4. Default group (providerName = null)
     * 5. Any active group (fallback)
     * 
     * @param {Object} params - { order, command, userId, providerOrderId, providerName, deviceId }
     */
    async forwardToProvider(params) {
        const { order, command, userId, providerOrderId, providerName, deviceId } = params;

        if (!order) {
            throw new Error('Order object is required');
        }

        let providerGroup = null;
        let targetJidOverride = null;  // For service ID specific routing

        // ==================== 1. CHECK SERVICE ID ROUTING ====================
        // Check if any provider group has a serviceIdRules that matches this order's serviceId
        if (order.serviceId) {
            const allGroups = await prisma.providerGroup.findMany({
                where: {
                    panelId: order.panelId,
                    isActive: true
                }
            });
            // Filter groups that have serviceIdRules (JSON field can't use NOT null in Prisma)
            const groupsWithRules = allGroups.filter(g => g.serviceIdRules != null);

            for (const group of groupsWithRules) {
                const rules = typeof group.serviceIdRules === 'string'
                    ? safeParseObject(group.serviceIdRules)
                    : group.serviceIdRules;

                // Check if serviceId matches any rule
                const serviceIdStr = String(order.serviceId);
                if (rules && rules[serviceIdStr]) {
                    targetJidOverride = rules[serviceIdStr];
                    providerGroup = group;  // Use this group's template
                    logger.info(`🎯 Service ID ${serviceIdStr} matched rule → ${targetJidOverride}`);
                    break;
                }
            }
        }

        // ==================== 2. FIND PROVIDER-SPECIFIC GROUP ====================
        if (!providerGroup && providerName) {
            providerGroup = await prisma.providerGroup.findFirst({
                where: {
                    panelId: order.panelId,
                    providerName: providerName,
                    isActive: true
                }
            });

            if (providerGroup) {
                logger.info(`Found provider-specific group for ${providerName}`);
            }
        }

        // ==================== 3. CHECK FOR MANUAL SERVICE GROUP ====================
        // If no provider name, this might be a manual service
        if (!providerGroup && !providerName) {
            providerGroup = await prisma.providerGroup.findFirst({
                where: {
                    panelId: order.panelId,
                    isManualServiceGroup: true,
                    isActive: true
                }
            });

            if (providerGroup) {
                logger.info(`Using manual service group (no provider detected)`);
            }
        }

        // ==================== 4. DEFAULT GROUP ====================
        if (!providerGroup) {
            providerGroup = await prisma.providerGroup.findFirst({
                where: {
                    panelId: order.panelId,
                    providerName: null,
                    isManualServiceGroup: false,
                    isActive: true
                }
            });

            if (providerGroup) {
                logger.info(`Using default group (no provider-specific group for "${providerName}")`);
            }
        }

        // ==================== 5. ANY ACTIVE GROUP (FALLBACK) ====================
        if (!providerGroup) {
            providerGroup = await prisma.providerGroup.findFirst({
                where: {
                    panelId: order.panelId,
                    isActive: true
                }
            });

            if (providerGroup) {
                logger.warn(`⚠️ Using fallback group "${providerGroup.groupName}" - consider setting up provider-specific groups`);
            }
        }

        // ==================== 6. PROVIDER CONFIG FALLBACK (Provider Aliases page) ====================
        // If no ProviderGroup found, check ProviderConfig table (set via Provider Aliases page)
        let providerConfigFallback = null;
        if (!providerGroup) {
            try {
                // For manual services (no provider), also try 'MANUAL' and 'default' configs
                const searchNames = providerName
                    ? [providerName]
                    : ['MANUAL', 'manual', 'default', 'Default'];

                providerConfigFallback = await prisma.providerConfig.findFirst({
                    where: {
                        userId: userId,
                        providerName: { in: searchNames },
                        isActive: true
                    }
                });

                if (providerConfigFallback) {
                    logger.info(`📋 Found ProviderConfig (Provider Aliases) for "${providerName || 'MANUAL'}"`);
                }
            } catch (configErr) {
                logger.warn(`Failed to check ProviderConfig fallback:`, configErr.message);
            }
        }

        if (!providerGroup && !providerConfigFallback) {
            const panelName = order.panel?.alias || order.panel?.name || 'Unknown';
            logger.warn(`❌ No provider group found for panel "${panelName}"`);
            return {
                success: false,
                reason: 'no_group',
                message: `No provider group configured for panel "${panelName}". Please set up a provider group in SMM Integration → Provider Groups.`,
                panelName
            };
        }

        // ==================== PROVIDER CONFIG PATH ====================
        // If using ProviderConfig (from Provider Aliases page), forward directly
        if (!providerGroup && providerConfigFallback) {
            return this._forwardViaProviderConfig(providerConfigFallback, command, order, providerOrderId, userId, deviceId);
        }

        // Format the message with PROVIDER Order ID (if available)
        const message = this.formatProviderMessage(command, order, providerGroup, providerOrderId);

        // Send via WhatsApp
        if (!this.whatsappService) {
            logger.error('WhatsApp service not available');
            return {
                success: false,
                reason: 'service_unavailable',
                message: 'WhatsApp service not available'
            };
        }

        try {
            // Resolve deviceId: param > ProviderGroup.deviceId > first connected device
            let sendDeviceId = deviceId || providerGroup.deviceId;

            // Auto-resolve from first connected device if still missing
            if (!sendDeviceId) {
                try {
                    const connectedDevice = await prisma.device.findFirst({
                        where: { userId: userId, status: 'connected' },
                        select: { id: true }
                    });
                    if (connectedDevice) {
                        sendDeviceId = connectedDevice.id;
                        logger.info(`🔌 Auto-resolved deviceId from connected device: ${sendDeviceId}`);
                    }
                } catch (devErr) {
                    logger.warn(`Failed to auto-resolve device:`, devErr.message);
                }
            }

            if (!sendDeviceId) {
                return {
                    success: false,
                    reason: 'no_device',
                    message: 'No WhatsApp device configured. Please provide a device ID.'
                };
            }

            // Get target JID - use Service ID override if matched, otherwise use group's default
            // targetJidOverride is set when serviceIdRules match the order's serviceId
            const targetJid = targetJidOverride || providerGroup.groupId;

            // If JID looks like a phone number (no @g.us or @s.whatsapp.net), format as direct
            const isDirectNumber = targetJid && !targetJid.includes('@');
            const formattedJid = isDirectNumber
                ? `${targetJid.replace(/\D/g, '')}@s.whatsapp.net`
                : targetJid;

            if (!targetJid) {
                return {
                    success: false,
                    reason: 'no_target',
                    message: 'No target configured for provider group'
                };
            }

            // Log if using override
            if (targetJidOverride) {
                logger.info(`🎯 Using Service ID override: ${targetJidOverride}`);
            }

            await this.whatsappService.sendMessage(sendDeviceId, formattedJid, message);

            // Log the forwarding with provider info
            await prisma.orderCommand.updateMany({
                where: {
                    orderId: order.id,
                    command: command.toUpperCase(),
                    status: 'SUCCESS'
                },
                data: {
                    forwardedTo: providerGroup.groupName,
                    response: JSON.stringify({
                        forwarded: true,
                        groupId: providerGroup.id,
                        groupName: providerGroup.groupName,
                        providerName: providerName,
                        providerOrderId: providerOrderId,
                        usedServiceIdRouting: !!targetJidOverride,
                        serviceId: order.serviceId || null,
                        targetJid: formattedJid,
                        timestamp: new Date().toISOString()
                    })
                }
            });

            const displayOrderId = providerOrderId || order.externalOrderId;
            const routingInfo = targetJidOverride
                ? ` (via Service ID ${order.serviceId} routing)`
                : '';
            logger.info(`✅ Forwarded ${command} for order ${displayOrderId} to ${providerGroup.groupName}${routingInfo}`);

            return {
                success: true,
                message: `Forwarded to ${providerGroup.groupName}`,
                groupId: providerGroup.id,
                groupName: providerGroup.groupName,
                usedProviderOrderId: !!providerOrderId,
                usedServiceIdRouting: !!targetJidOverride,
                serviceId: order.serviceId || null
            };
        } catch (error) {
            logger.error(`Failed to forward:`, error);
            return {
                success: false,
                reason: 'send_failed',
                message: error.message
            };
        }
    }

    /**
     * Format message for provider group (legacy method)
     */
    formatMessage(command, order, providerGroup) {
        return this.formatProviderMessage(command, order, providerGroup, null);
    }

    /**
     * Format message for provider group with Provider Order ID
     * Uses providerOrderId (from Admin API) if available, otherwise falls back to panel order ID
     */
    formatProviderMessage(command, order, providerGroup, providerOrderId) {
        // Determine which order ID to use - ALWAYS prefer Provider Order ID
        const displayOrderId = providerOrderId || order.providerOrderId || order.externalOrderId || 'N/A';

        // ==================== SIMPLE FORMAT MODE ====================
        // If provider group has useSimpleFormat enabled, send just "orderId command"
        // This is what providers expect: "7416281 refill"
        if (providerGroup.useSimpleFormat) {
            const commandMap = {
                'NEW_ORDER': 'new',
                'REFILL': 'refill',
                'CANCEL': 'cancel',
                'SPEED_UP': 'speed up'
            };
            const simpleCmd = commandMap[command.toUpperCase()] || command.toLowerCase();
            logger.info(`📤 Using simple format: ${displayOrderId} ${simpleCmd}`);
            return `${displayOrderId} ${simpleCmd}`;
        }

        // ==================== STANDARD FORMAT MODE ====================
        // Use custom template from providerGroup if available, otherwise use default
        const customTemplate = providerGroup.messageTemplate;

        const templates = {
            NEW_ORDER: customTemplate || providerGroup.newOrderTemplate || this.getProviderTemplate('NEW_ORDER'),
            REFILL: customTemplate || providerGroup.refillTemplate || this.getProviderTemplate('REFILL'),
            CANCEL: customTemplate || providerGroup.cancelTemplate || this.getProviderTemplate('CANCEL'),
            SPEED_UP: customTemplate || providerGroup.speedUpTemplate || this.getProviderTemplate('SPEED_UP')
        };

        const template = templates[command.toUpperCase()] || templates.REFILL;

        return this.processProviderTemplate(template, order, providerGroup, providerOrderId);
    }

    /**
     * Get default templates for provider forwarding (uses Provider Order ID)
     */
    getProviderTemplate(command) {
        const defaults = {
            // NEW ORDER template - sent when order is first forwarded to provider
            NEW_ORDER: `📦 *NEW ORDER RECEIVED*

External ID: {orderDisplayId}
🏷️ Panel: {panelAlias}
🔗 Provider: {providerName}

━━━━━━━━━━━━━━━
📋 *Order Details*
Service: {serviceName}
Service ID: {serviceId}
Link: {link}
Quantity: {quantity}

👤 Customer: {customerUsername}
📅 Placed: {timestamp}

✅ Action: New Order`,

            // Provider templates use {providerOrderId} as primary identifier
            REFILL: `🔄 *REFILL REQUEST*

📦 Order: {orderDisplayId}
🏷️ Panel: {panelAlias}
🔗 Provider: {providerName}

━━━━━━━━━━━━━━━
📋 *Service Details*
Service: {serviceName}
Link: {link}

📊 *Progress*
Qty: {quantity}
Delivered: {delivered}
Remains: {remains}

👤 Customer: {customerUsername}
📅 Requested: {timestamp}`,

            CANCEL: `❌ *CANCEL REQUEST*

📦 Order: {orderDisplayId}
🏷️ Panel: {panelAlias}
🔗 Provider: {providerName}

━━━━━━━━━━━━━━━
📋 *Service Details*
Service: {serviceName}
Link: {link}
Status: {status}

📊 *Progress*
Qty: {quantity}
Delivered: {delivered}
Remains: {remains}

💰 Charge: {charge}
👤 Customer: {customerUsername}
📅 Requested: {timestamp}`,

            SPEED_UP: `⚡ *SPEED-UP REQUEST*

📦 Order: {orderDisplayId}
🏷️ Panel: {panelAlias}
🔗 Provider: {providerName}

━━━━━━━━━━━━━━━
📋 *Service Details*
Service: {serviceName}
Link: {link}
Status: {status}

📊 *Progress*
Qty: {quantity}
Start: {startCount}
Delivered: {delivered}
Remains: {remains}

👤 Customer: {customerUsername}
📅 Requested: {timestamp}

⚠️ Please prioritize this order.`
        };

        return defaults[command] || defaults.REFILL;
    }


    /**
     * Get default templates (legacy)
     */
    getDefaultTemplate(command) {
        return this.getProviderTemplate(command);
    }

    /**
     * Process template variables with provider info
     */
    processProviderTemplate(template, order, providerGroup, providerOrderId) {
        const now = new Date();

        // Determine which order ID to display
        // Priority: Provider Order ID > Panel Order ID
        const displayOrderId = providerOrderId || order.externalOrderId || 'N/A';

        // Calculate delivered quantity
        const delivered = order.quantity && order.remains !== null && order.remains !== undefined
            ? (order.quantity - parseInt(order.remains)).toString()
            : 'N/A';

        let result = template;

        // Provider-specific variables (from Admin API)
        result = result.replace(/{providerOrderId}/gi, providerOrderId || 'N/A');
        result = result.replace(/{providerName}/gi, order.providerName || 'N/A');
        result = result.replace(/{orderDisplayId}/gi, displayOrderId);

        // Panel order variables
        result = result.replace(/{externalOrderId}/gi, order.externalOrderId || 'N/A');
        result = result.replace(/{externalId}/gi, order.externalOrderId || 'N/A'); // Alias (Bug 3.4)
        result = result.replace(/{panelOrderId}/gi, order.externalOrderId || 'N/A');
        result = result.replace(/{orderId}/gi, displayOrderId); // Use provider ID if available

        // Provider alias (Bug 3.4) — resolve from ProviderConfig if available
        result = result.replace(/{providerAlias}/gi, order.providerAlias || order.providerName || 'N/A');

        // Command type (Bug 3.4) — e.g. "refill", "cancel", "speedup"
        result = result.replace(/{command}/gi, order._commandType || 'N/A');

        // Panel info
        result = result.replace(/{panelAlias}/gi, order.panel?.alias || 'N/A');
        result = result.replace(/{panelName}/gi, order.panel?.name || 'N/A');

        // Order details
        result = result.replace(/{serviceName}/gi, order.serviceName || order.serviceId || 'N/A');
        result = result.replace(/{serviceId}/gi, order.serviceId || 'N/A');
        result = result.replace(/{link}/gi, order.link || 'N/A');
        result = result.replace(/{quantity}/gi, order.quantity?.toString() || 'N/A');
        result = result.replace(/{status}/gi, order.status || 'N/A');
        result = result.replace(/{charge}/gi, order.charge ? `$${order.charge.toFixed(2)}` : 'N/A');

        // Progress details (NEW)
        result = result.replace(/{startCount}/gi, order.startCount?.toString() || 'N/A');
        result = result.replace(/{remains}/gi, order.remains?.toString() || '0');
        result = result.replace(/{delivered}/gi, delivered);

        // Customer info (NEW)
        result = result.replace(/{customerUsername}/gi, order.customerUsername || 'N/A');
        result = result.replace(/{customerEmail}/gi, order.customerEmail || 'N/A');
        result = result.replace(/{customerPhone}/gi, order.customerPhone || 'N/A');

        // Actions/Guarantee (NEW)
        result = result.replace(/{canRefill}/gi, order.canRefill ? '✅ Yes' : '❌ No');
        result = result.replace(/{canCancel}/gi, order.canCancel ? '✅ Yes' : '❌ No');
        result = result.replace(/{guarantee}/gi, order.canRefill ? '✅ Available' : '❌ None');

        // Timestamps
        result = result.replace(/{timestamp}/gi, now.toLocaleString());
        result = result.replace(/{date}/gi, now.toLocaleDateString());
        result = result.replace(/{time}/gi, now.toLocaleTimeString());
        result = result.replace(/{orderDate}/gi, order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A');

        return result;
    }


    /**
     * Process template variables (legacy wrapper)
     */
    processTemplate(template, order, providerGroup) {
        return this.processProviderTemplate(template, order, providerGroup, order.providerOrderId);
    }

    /**
     * Bulk forward commands
     */
    async bulkForward(orderIds, command, userId, deviceId) {
        const results = [];

        for (const orderId of orderIds) {
            try {
                const result = await this.forwardToGroup({
                    orderId,
                    command,
                    userId,
                    deviceId
                });
                results.push({
                    orderId,
                    ...result
                });
            } catch (error) {
                results.push({
                    orderId,
                    success: false,
                    reason: 'error',
                    message: error.message
                });
            }
        }

        return {
            total: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        };
    }

    /**
     * Send direct message to provider
     */
    async sendDirectMessage(params) {
        const { targetNumber, message, deviceId } = params;

        if (!this.whatsappService) {
            throw new Error('WhatsApp service not available');
        }

        const jid = `${targetNumber.replace(/\D/g, '')}@s.whatsapp.net`;
        await this.whatsappService.sendMessage(deviceId, jid, message);

        return { success: true, targetNumber };
    }

    /**
     * Forward via ProviderConfig (Provider Aliases page) as fallback
     * This handles destinations set on the Provider Aliases page (ProviderConfig table)
     * when no ProviderGroup is configured for the provider.
     */
    async _forwardViaProviderConfig(config, command, order, providerOrderId, userId, deviceId) {
        if (!this.whatsappService) {
            return {
                success: false,
                reason: 'service_unavailable',
                message: 'WhatsApp service not available'
            };
        }

        // Check if this command type should be forwarded
        const commandUpper = command.toUpperCase();
        if (commandUpper === 'REFILL' && !config.forwardRefill) {
            return { success: false, reason: 'disabled', message: 'Refill forwarding disabled for this provider' };
        }
        if (commandUpper === 'CANCEL' && !config.forwardCancel) {
            return { success: false, reason: 'disabled', message: 'Cancel forwarding disabled for this provider' };
        }
        if (commandUpper === 'SPEED_UP' && !config.forwardSpeedup) {
            return { success: false, reason: 'disabled', message: 'Speedup forwarding disabled for this provider' };
        }

        // Get the target destination from ProviderConfig
        const targetGroupJid = config.whatsappGroupJid;
        const targetNumber = config.whatsappNumber;
        const targetTelegram = config.telegramChatId;

        if (!targetGroupJid && !targetNumber && !targetTelegram) {
            return {
                success: false,
                reason: 'no_destination',
                message: `ProviderConfig for "${config.providerName}" has no forwarding destination set.`
            };
        }

        // Resolve deviceId: param > config.deviceId > first connected device
        let sendDeviceId = deviceId || config.deviceId;
        if (!sendDeviceId) {
            try {
                const connectedDevice = await prisma.device.findFirst({
                    where: { userId: userId, status: 'connected' },
                    select: { id: true }
                });
                if (connectedDevice) {
                    sendDeviceId = connectedDevice.id;
                    logger.info(`🔌 ProviderConfig: Auto-resolved deviceId: ${sendDeviceId}`);
                }
            } catch (devErr) {
                logger.warn(`Failed to auto-resolve device for ProviderConfig:`, devErr.message);
            }
        }

        if (!sendDeviceId && (targetGroupJid || targetNumber)) {
            return {
                success: false,
                reason: 'no_device',
                message: 'No WhatsApp device available for forwarding.'
            };
        }

        // Build message using ProviderConfig templates or simple format
        const displayOrderId = providerOrderId || order.providerOrderId || order.externalOrderId || 'N/A';
        let message;

        // Use template from ProviderConfig if available
        const templateMap = {
            'REFILL': config.refillTemplate,
            'CANCEL': config.cancelTemplate,
            'SPEED_UP': config.speedupTemplate,
            'NEW_ORDER': null
        };
        const template = templateMap[commandUpper];

        if (template) {
            // Simple variable replacement
            message = template
                .replace(/{externalId}/gi, displayOrderId)
                .replace(/{orderId}/gi, displayOrderId)
                .replace(/{command}/gi, command.toLowerCase())
                .replace(/{providerName}/gi, order.providerName || 'N/A')
                .replace(/{providerAlias}/gi, config.alias || config.providerName || 'N/A');
        } else {
            // Default simple format: "orderId command"
            const cmdMap = { 'REFILL': 'refill', 'CANCEL': 'cancel', 'SPEED_UP': 'speed up', 'NEW_ORDER': 'new', 'RE_REQUEST': 'refill' };
            message = `${displayOrderId} ${cmdMap[commandUpper] || command.toLowerCase()}`;
        }

        let success = false;
        let forwardedTo = [];
        let errors = [];

        // Forward to WhatsApp Group
        if (targetGroupJid) {
            try {
                const formattedJid = targetGroupJid.includes('@') ? targetGroupJid : `${targetGroupJid}@g.us`;
                await this.whatsappService.sendMessage(sendDeviceId, formattedJid, message);
                forwardedTo.push(`WA Group: ${targetGroupJid.substring(0, 15)}...`);
                success = true;
                logger.info(`✅ ProviderConfig: Forwarded ${command} to WA group for "${config.providerName}"`);
            } catch (err) {
                errors.push(`WA Group failed: ${err.message}`);
                logger.error(`❌ ProviderConfig: WA Group forward failed:`, err.message);
            }
        }

        // Forward to WhatsApp Number
        if (targetNumber) {
            try {
                const numberJid = `${targetNumber.replace(/\D/g, '')}@s.whatsapp.net`;
                await this.whatsappService.sendMessage(sendDeviceId, numberJid, message);
                forwardedTo.push(`WA Number: ${targetNumber}`);
                success = true;
                logger.info(`✅ ProviderConfig: Forwarded ${command} to WA number for "${config.providerName}"`);
            } catch (err) {
                errors.push(`WA Number failed: ${err.message}`);
                logger.error(`❌ ProviderConfig: WA Number forward failed:`, err.message);
            }
        }

        // Note: Telegram forwarding would need telegram bot service, skip if not available
        // ProviderConfig.telegramChatId is stored but forwarding to Telegram
        // requires a Telegram bot integration which is separate from WhatsApp service

        // Log the forwarding
        try {
            await prisma.orderCommand.updateMany({
                where: {
                    orderId: order.id,
                    command: commandUpper,
                    status: 'SUCCESS'
                },
                data: {
                    forwardedTo: forwardedTo.join(', ') || null,
                    response: JSON.stringify({
                        forwarded: true,
                        source: 'ProviderConfig',
                        configId: config.id,
                        providerName: config.providerName,
                        providerAlias: config.alias,
                        destinations: forwardedTo,
                        errors: errors.length > 0 ? errors : undefined,
                        timestamp: new Date().toISOString()
                    })
                }
            });
        } catch (logErr) {
            logger.warn(`Failed to log ProviderConfig forwarding:`, logErr.message);
        }

        return {
            success,
            message: success
                ? `Forwarded to ${forwardedTo.join(', ')} (via Provider Aliases)`
                : `Forward failed: ${errors.join('; ')}`,
            source: 'ProviderConfig',
            groupName: config.alias || config.providerName,
            forwardedTo,
            errors: errors.length > 0 ? errors : undefined
        };
    }
}

module.exports = new GroupForwardingService();
