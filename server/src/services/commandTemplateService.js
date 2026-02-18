/**
 * Command Template Service
 * 
 * Manages custom response templates for bot commands
 * Supports variables like {orderId}, {status}, {serviceName}, etc.
 */

const prisma = require('../utils/prisma');

// Default templates for each command type
const DEFAULT_TEMPLATES = {
    // Status command - Standard version
    STATUS: {
        template: `📦 *Order Status*

🆔 Order: #{orderId}
📊 Status: {statusEmoji} {status}

━━━━━━━━━━━━━━━━━━
📌 *Service Details*
📋 Service: {serviceName}
🔗 Link: {link}

📈 *Progress*
▪️ Start Count: {startCount}
▪️ Ordered: {quantity}
▪️ Delivered: {delivered}
▪️ Remaining: {remains}

💰 Charge: {charge}
🔄 Refill: {canRefill}
━━━━━━━━━━━━━━━━━━`,
        description: 'Response when user checks order status (standard)',
        variables: ['orderId', 'status', 'statusEmoji', 'serviceName', 'link', 'startCount', 'quantity', 'delivered', 'remains', 'charge', 'canRefill', 'canCancel', 'panelAlias', 'date']
    },

    // Status command - Detailed version with provider info
    STATUS_DETAILED: {
        template: `📦 *Order Status - Detailed*

🆔 Order: #{orderId}
📊 Status: {statusEmoji} {status}
📅 Date: {date}

━━━━━━━━━━━━━━━━━━
📌 *Service Details*
📋 Service: {serviceName}
🔗 Link: {link}
🏷️ Panel: {panelAlias}

📈 *Progress*
▪️ Start Count: {startCount}
▪️ Ordered: {quantity}
▪️ Delivered: {delivered}
▪️ Remaining: {remains}

💰 *Charges*
▪️ Amount: {charge}

🔄 *Actions Available*
▪️ Refill: {canRefill}
▪️ Cancel: {canCancel}

🔗 *Provider Info*
▪️ Provider: {providerName}
▪️ External ID: {providerOrderId}
━━━━━━━━━━━━━━━━━━`,
        description: 'Detailed order status with provider information',
        variables: ['orderId', 'status', 'statusEmoji', 'serviceName', 'link', 'startCount', 'quantity', 'delivered', 'remains', 'charge', 'canRefill', 'canCancel', 'providerName', 'providerOrderId', 'panelAlias', 'date', 'customerUsername']
    },


    // Refill success
    REFILL_SUCCESS: {
        template: `✅ *Refill Submitted*

Order #{orderId} has been added to refill queue.

📌 Service: {serviceName}
🔗 Link: {link}
📊 Status: {status}

⏱️ Estimated: 24-48 hours
📩 Forwarded to: {providerName}

Thank you for your patience!`,
        description: 'Response when refill request is successfully submitted',
        variables: ['orderId', 'serviceName', 'link', 'status', 'providerName', 'panelAlias']
    },

    // Refill pending (order still in progress)
    REFILL_PENDING: {
        template: `⚠️ *Order Still In Progress*

Order #{orderId} is still being processed.
Current status: {status}

📊 Progress: {delivered}/{quantity}
📉 Remaining: {remains}

Please wait until the order completes before requesting refill.`,
        description: 'Response when refill is requested but order is still pending/in progress',
        variables: ['orderId', 'status', 'delivered', 'quantity', 'remains']
    },

    // Refill already requested
    REFILL_ALREADY: {
        template: `⏳ *Already in Refill Queue*

Order #{orderId} already has a pending refill request.

📅 Requested on: {requestDate}

Please wait for the current refill to complete.`,
        description: 'Response when refill was already requested for this order',
        variables: ['orderId', 'requestDate']
    },

    // Cancel success
    CANCEL_SUCCESS: {
        template: `🔄 *Cancel Request Submitted*

Order #{orderId} has been added to cancel queue.

📌 Service: {serviceName}
📊 Current Status: {status}
📉 Delivered: {delivered}/{quantity}

📩 Request forwarded to: {providerName}
⏱️ Processing time: 24-72 hours

You will receive a confirmation once processed.`,
        description: 'Response when cancel request is successfully submitted',
        variables: ['orderId', 'serviceName', 'status', 'delivered', 'quantity', 'providerName']
    },

    // Cancel not allowed (already completed)
    CANCEL_NOT_ALLOWED: {
        template: `❌ *Cannot Cancel*

Order #{orderId} cannot be cancelled.
Status: {status}

Orders that are completed or already delivered cannot be cancelled.`,
        description: 'Response when order cannot be cancelled',
        variables: ['orderId', 'status']
    },

    // Speed-up success
    SPEEDUP_SUCCESS: {
        template: `⚡ *Speed-up Request Submitted*

Order #{orderId} has been flagged for priority processing.

📌 Service: {serviceName}
📊 Status: {status}
📉 Progress: {delivered}/{quantity}

📩 Forwarded to: {providerName}

Our team will prioritize this order.`,
        description: 'Response when speed-up request is submitted',
        variables: ['orderId', 'serviceName', 'status', 'delivered', 'quantity', 'providerName']
    },

    // Order not found
    ERROR_NOT_FOUND: {
        template: `❌ *Order Not Found*

Order #{orderId} was not found in your panel records.

Please check the order ID and try again.`,
        description: 'Response when order ID does not exist',
        variables: ['orderId']
    },

    // Order not yours
    ERROR_NOT_OWNER: {
        template: `⚠️ *Access Denied*

Order #{orderId} does not belong to your account.

If you believe this is an error, please contact support.`,
        description: 'Response when order does not belong to the sender',
        variables: ['orderId']
    },

    // Generic error
    ERROR_GENERIC: {
        template: `❌ *Error Processing Request*

Unable to process your request for Order #{orderId}.

Error: {errorMessage}

Please try again later or contact support.`,
        description: 'Generic error response',
        variables: ['orderId', 'errorMessage']
    },

    // Rate limited
    ERROR_RATE_LIMITED: {
        template: `⏳ *Please Wait*

You're sending requests too quickly.
Please wait a moment before trying again.

Cooldown: {cooldownSeconds} seconds`,
        description: 'Response when user is rate limited',
        variables: ['cooldownSeconds']
    },

    // Command cooldown
    ERROR_COOLDOWN: {
        template: `⏳ *Command Cooldown*

You recently requested {command} for Order #{orderId}.

Please wait {remainingTime} before sending another request.`,
        description: 'Response when same command was recently used on same order',
        variables: ['command', 'orderId', 'remainingTime']
    }
};

// All available template variables with descriptions
const TEMPLATE_VARIABLES = {
    orderId: { description: 'Panel Order ID', example: '3463745263' },
    providerOrderId: { description: 'Provider External Order ID', example: 'EXT-99887' },
    providerName: { description: 'Provider Name', example: 'FastFollowers' },
    status: { description: 'Order Status', example: 'Completed' },
    statusEmoji: { description: 'Status with emoji', example: '✅' },
    serviceName: { description: 'Service Name', example: 'Instagram Followers' },
    link: { description: 'Order Link', example: 'instagram.com/user' },
    quantity: { description: 'Total Quantity Ordered', example: '5000' },
    startCount: { description: 'Start Count', example: '1000' },
    delivered: { description: 'Delivered Quantity', example: '5000' },
    remains: { description: 'Remaining Quantity', example: '0' },
    charge: { description: 'Order Charge', example: '$25.00' },
    panelAlias: { description: 'Panel Alias', example: 'MyPanel' },
    customerUsername: { description: 'Customer Username', example: 'john123' },
    date: { description: 'Order Date', example: '13 Jan 2026' },
    command: { description: 'Command Name', example: 'refill' },
    errorMessage: { description: 'Error Message', example: 'Connection timeout' },
    cooldownSeconds: { description: 'Cooldown Duration', example: '60' },
    remainingTime: { description: 'Remaining Wait Time', example: '5 minutes' },
    requestDate: { description: 'Request Date', example: '13 Jan 2026' },
    guarantee: { description: 'Guarantee Status', example: '✅ 30 days' },
    canRefill: { description: 'Refill Available (Yes/No)', example: '✅ Available' },
    canCancel: { description: 'Cancel Available (Yes/No)', example: '❌ Not Available' }
};


class CommandTemplateService {
    /**
     * Build a findFirst-compatible where clause for scoped lookups.
     * Prisma doesn't support null in composite unique findUnique,
     * so we use findFirst with explicit null checks instead.
     */
    _buildWhere(userId, command, deviceId = null, panelId = null) {
        const where = { userId, command };

        if (deviceId) {
            where.deviceId = deviceId;
        } else {
            where.deviceId = null;  // IS NULL
        }

        if (panelId) {
            where.panelId = panelId;
        } else {
            where.panelId = null;  // IS NULL
        }

        return where;
    }

    /**
     * Find a scoped template record
     */
    async _findScoped(userId, command, deviceId = null, panelId = null) {
        return prisma.commandTemplate.findFirst({
            where: this._buildWhere(userId, command, deviceId, panelId)
        });
    }

    /**
     * Get all templates for a user (with defaults for missing ones)
     * @param {string} userId
     * @param {Object} scope - Optional { deviceId, panelId }
     */
    async getTemplates(userId, scope = {}) {
        const { deviceId = null, panelId = null } = scope;

        // Get user default templates (no device/panel scope)
        const userDefaults = await prisma.commandTemplate.findMany({
            where: { userId, deviceId: null, panelId: null }
        });

        // Build map from user defaults
        const templateMap = {};
        userDefaults.forEach(t => {
            templateMap[t.command] = {
                id: t.id,
                command: t.command,
                template: t.template,
                isActive: t.isActive,
                isCustom: true,
                scope: 'user_default'
            };
        });

        // Overlay scoped templates if scope is specified
        if (deviceId || panelId) {
            // Get all scoped templates for this user+scope
            const scopedTemplates = [];

            // Device-only templates
            if (deviceId) {
                const deviceTemplates = await prisma.commandTemplate.findMany({
                    where: { userId, deviceId, panelId: null }
                });
                deviceTemplates.forEach(t => {
                    templateMap[t.command] = {
                        id: t.id,
                        command: t.command,
                        template: t.template,
                        isActive: t.isActive,
                        isCustom: true,
                        scope: 'device'
                    };
                });
            }

            // Panel-only templates
            if (panelId) {
                const panelTemplates = await prisma.commandTemplate.findMany({
                    where: { userId, deviceId: null, panelId }
                });
                panelTemplates.forEach(t => {
                    templateMap[t.command] = {
                        id: t.id,
                        command: t.command,
                        template: t.template,
                        isActive: t.isActive,
                        isCustom: true,
                        scope: 'panel'
                    };
                });
            }

            // Device+panel specific templates (highest priority)
            if (deviceId && panelId) {
                const specificTemplates = await prisma.commandTemplate.findMany({
                    where: { userId, deviceId, panelId }
                });
                specificTemplates.forEach(t => {
                    templateMap[t.command] = {
                        id: t.id,
                        command: t.command,
                        template: t.template,
                        isActive: t.isActive,
                        isCustom: true,
                        scope: 'device_panel'
                    };
                });
            }
        }

        // Merge with defaults for any missing commands
        const result = {};
        Object.keys(DEFAULT_TEMPLATES).forEach(command => {
            if (templateMap[command]) {
                result[command] = templateMap[command];
            } else {
                result[command] = {
                    command,
                    template: DEFAULT_TEMPLATES[command].template,
                    description: DEFAULT_TEMPLATES[command].description,
                    variables: DEFAULT_TEMPLATES[command].variables,
                    isActive: true,
                    isCustom: false,
                    scope: 'system_default'
                };
            }
        });

        return result;
    }

    /**
     * Get a specific template for a command with scope fallback
     * Fallback: device+panel → panel → device → user default → system default
     * @param {string} userId
     * @param {string} command
     * @param {Object} scope - Optional { deviceId, panelId }
     */
    async getTemplate(userId, command, scope = {}) {
        const { deviceId = null, panelId = null } = scope;

        // Build candidates in priority order (most specific first)
        const candidates = [];

        // 1. Device+panel specific
        if (deviceId && panelId) {
            candidates.push({ deviceId, panelId });
        }
        // 2. Panel only
        if (panelId) {
            candidates.push({ deviceId: null, panelId });
        }
        // 3. Device only
        if (deviceId) {
            candidates.push({ deviceId, panelId: null });
        }
        // 4. User default (always last)
        candidates.push({ deviceId: null, panelId: null });

        // Try each candidate in order
        for (const candidate of candidates) {
            const template = await this._findScoped(userId, command, candidate.deviceId, candidate.panelId);

            if (template && template.isActive) {
                return template.template;
            }
        }

        // Fall back to system default
        if (DEFAULT_TEMPLATES[command]) {
            return DEFAULT_TEMPLATES[command].template;
        }

        return null;
    }

    /**
     * Save/update a template for a specific scope
     * @param {string} userId
     * @param {string} command
     * @param {string} template
     * @param {boolean} isActive
     * @param {Object} scope - Optional { deviceId, panelId }
     */
    async saveTemplate(userId, command, template, isActive = true, scope = {}) {
        const { deviceId = null, panelId = null } = scope;

        // Find existing record (can't use upsert with nullable composite keys)
        const existing = await this._findScoped(userId, command, deviceId, panelId);

        if (existing) {
            return prisma.commandTemplate.update({
                where: { id: existing.id },
                data: {
                    template,
                    isActive,
                    updatedAt: new Date()
                }
            });
        } else {
            return prisma.commandTemplate.create({
                data: {
                    userId,
                    command,
                    template,
                    isActive,
                    deviceId: deviceId || null,
                    panelId: panelId || null
                }
            });
        }
    }

    /**
     * Reset a template to default for a specific scope
     * @param {string} userId
     * @param {string} command
     * @param {Object} scope - Optional { deviceId, panelId }
     */
    async resetTemplate(userId, command, scope = {}) {
        const { deviceId = null, panelId = null } = scope;

        await prisma.commandTemplate.deleteMany({
            where: { userId, command, deviceId: deviceId || null, panelId: panelId || null }
        });

        return {
            command,
            template: DEFAULT_TEMPLATES[command]?.template || '',
            isCustom: false
        };
    }

    /**
     * Reset all templates for a user for a specific scope
     * @param {string} userId
     * @param {Object} scope - Optional { deviceId, panelId }
     */
    async resetAllTemplates(userId, scope = {}) {
        const { deviceId = null, panelId = null } = scope;

        await prisma.commandTemplate.deleteMany({
            where: { userId, deviceId: deviceId || null, panelId: panelId || null }
        });

        return this.getTemplates(userId, scope);
    }

    /**
     * Process template with variables
     */
    processTemplate(template, variables = {}) {
        let result = template;

        // Replace all variables
        Object.entries(variables).forEach(([key, value]) => {
            const regex = new RegExp(`{${key}}`, 'g');
            result = result.replace(regex, value ?? '');
        });

        // Generate status emoji if status is provided
        if (variables.status && !variables.statusEmoji) {
            result = result.replace(/{statusEmoji}/g, this.getStatusEmoji(variables.status));
        }

        // Clean up any remaining unreplaced variables
        result = result.replace(/{[a-zA-Z]+}/g, '');

        return result;
    }

    /**
     * Get emoji for status
     */
    getStatusEmoji(status) {
        const statusLower = (status || '').toLowerCase();
        const emojiMap = {
            'completed': '✅',
            'complete': '✅',
            'partial': '⚠️',
            'pending': '⏳',
            'in progress': '🔄',
            'inprogress': '🔄',
            'in_progress': '🔄',
            'processing': '🔄',
            'cancelled': '❌',
            'canceled': '❌',
            'refunded': '💰',
            'error': '❌',
            'failed': '❌'
        };

        return emojiMap[statusLower] || '📦';
    }

    /**
     * Get formatted response for a command (with scope fallback)
     * @param {string} userId
     * @param {string} command
     * @param {Object} variables
     * @param {Object} scope - Optional { deviceId, panelId }
     */
    async getFormattedResponse(userId, command, variables = {}, scope = {}) {
        const template = await this.getTemplate(userId, command, scope);
        if (!template) {
            return `Command ${command} processed for Order #${variables.orderId || 'unknown'}`;
        }

        return this.processTemplate(template, variables);
    }

    /**
     * Preview a template with sample data
     */
    previewTemplate(template) {
        const sampleData = {
            orderId: '3463745263',
            providerOrderId: 'EXT-99887',
            providerName: 'FastFollowers',
            status: 'Completed',
            statusEmoji: '✅',
            serviceName: 'Instagram Followers - HQ',
            link: 'instagram.com/sampleuser',
            quantity: '5000',
            startCount: '1000',
            delivered: '5000',
            remains: '0',
            charge: '$25.00',
            panelAlias: 'MyPanel',
            customerUsername: 'john123',
            date: '13 Jan 2026',
            command: 'refill',
            errorMessage: 'Connection timeout',
            cooldownSeconds: '60',
            remainingTime: '5 minutes',
            requestDate: '13 Jan 2026',
            guarantee: '✅ 30-day guarantee'
        };

        return this.processTemplate(template, sampleData);
    }

    /**
     * Get all available variables
     */
    getAvailableVariables() {
        return TEMPLATE_VARIABLES;
    }

    /**
     * Get default templates
     */
    getDefaultTemplates() {
        return DEFAULT_TEMPLATES;
    }

    /**
     * Get command list
     */
    getCommandList() {
        return Object.keys(DEFAULT_TEMPLATES).map(command => ({
            command,
            description: DEFAULT_TEMPLATES[command].description,
            variables: DEFAULT_TEMPLATES[command].variables
        }));
    }
}

module.exports = new CommandTemplateService();
