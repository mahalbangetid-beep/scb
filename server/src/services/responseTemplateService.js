/**
 * Response Template Service
 * 
 * Manages customizable bot response templates for commands
 * Feature 1: Customizable Bot Responses
 * 
 * Variables supported:
 * {order_id}     - Order ID
 * {status}       - Order status
 * {service}      - Service name
 * {link}         - Order link
 * {remains}      - Remaining count
 * {start_count}  - Start count
 * {charge}       - Order charge
 * {provider}     - Provider name
 * {date}         - Order date
 * {guarantee}    - Guarantee days
 * {error}        - Error message
 * {quantity}     - Order quantity
 */

const prisma = require('../utils/prisma');

class ResponseTemplateService {
    constructor() {
        // Default templates - used when user hasn't customized
        this.defaultTemplates = {
            // ==================== STATUS RESPONSES ====================
            'STATUS_SUCCESS': {
                template: `✅ *Order #{order_id}*\n\n📦 Service: {service}\n📊 Status: {status}\n🔢 Quantity: {quantity}\n📍 Start Count: {start_count}\n📉 Remains: {remains}\n💰 Charge: ${'{charge}'}\n🔗 Link: {link}`,
                description: 'Successful status check response',
                variables: ['order_id', 'service', 'status', 'quantity', 'start_count', 'remains', 'charge', 'link']
            },
            'STATUS_NOT_FOUND': {
                template: `❌ Order #{order_id} not found in this panel.\n\nPlease check the order ID and try again.`,
                description: 'Order not found response',
                variables: ['order_id']
            },
            'STATUS_ERROR': {
                template: `❌ Error checking order #{order_id}: {error}`,
                description: 'Error during status check',
                variables: ['order_id', 'error']
            },

            // ==================== REFILL RESPONSES ====================
            'REFILL_SUCCESS': {
                template: `✅ *Refill Submitted!*\n\nOrder #{order_id} refill request has been sent.\n📦 Service: {service}\n⏳ Please wait for processing.`,
                description: 'Refill request submitted successfully',
                variables: ['order_id', 'service']
            },
            'REFILL_PENDING': {
                template: `⏳ Order #{order_id}: Refill request is pending.\n\nA previous refill request is still being processed.`,
                description: 'Refill already pending',
                variables: ['order_id']
            },
            'REFILL_STATUS_INVALID': {
                template: `❌ Order #{order_id}: Cannot refill.\n\nOrder status is "{status}". Only completed orders can be refilled.`,
                description: 'Order status not eligible for refill',
                variables: ['order_id', 'status']
            },
            'REFILL_NO_GUARANTEE': {
                template: `❌ Order #{order_id}: This is not possible to refill.\n\nThis is a no-refill, no-support service.`,
                description: 'Service has no guarantee/refill',
                variables: ['order_id']
            },
            'REFILL_EXPIRED': {
                template: `❌ Order #{order_id}: Refill period has expired.\n\nThe {guarantee}-day guarantee period has ended.`,
                description: 'Guarantee period expired',
                variables: ['order_id', 'guarantee']
            },
            'REFILL_FORWARDED': {
                template: `✅ Order #{order_id}: Refill request forwarded to provider.\n\n📦 Service: {service}\n🔢 Provider Order: {provider_order_id}`,
                description: 'Refill forwarded to provider',
                variables: ['order_id', 'service', 'provider_order_id']
            },
            'REFILL_ERROR': {
                template: `❌ Order #{order_id}: Refill failed.\n\nError: {error}`,
                description: 'Refill request failed',
                variables: ['order_id', 'error']
            },

            // ==================== CANCEL RESPONSES ====================
            'CANCEL_SUCCESS': {
                template: `✅ *Cancel Submitted!*\n\nOrder #{order_id} cancel request has been sent.\n💰 Refund will be processed if approved.`,
                description: 'Cancel request submitted',
                variables: ['order_id']
            },
            'CANCEL_STATUS_INVALID': {
                template: `❌ Order #{order_id}: Cannot cancel.\n\nOrder status is "{status}". Only pending/processing orders can be cancelled.`,
                description: 'Order status not eligible for cancel',
                variables: ['order_id', 'status']
            },
            'CANCEL_ERROR': {
                template: `❌ Order #{order_id}: Cancel failed.\n\nError: {error}`,
                description: 'Cancel request failed',
                variables: ['order_id', 'error']
            },

            // ==================== SPEEDUP RESPONSES ====================
            'SPEEDUP_SUCCESS': {
                template: `✅ *Speed-up Requested!*\n\nOrder #{order_id} has been prioritized.`,
                description: 'Speedup request submitted',
                variables: ['order_id']
            },
            'SPEEDUP_ERROR': {
                template: `❌ Order #{order_id}: Speed-up failed.\n\nError: {error}`,
                description: 'Speedup request failed',
                variables: ['order_id', 'error']
            },

            // ==================== GENERAL RESPONSES ====================
            'COOLDOWN': {
                template: `⏱️ Please wait before sending another command.\n\nYou can try again in a few seconds.`,
                description: 'User is on cooldown',
                variables: []
            },
            'DISABLED': {
                template: `❌ This command is currently disabled.\n\nPlease contact admin for assistance.`,
                description: 'Command is disabled',
                variables: []
            },
            'ACCESS_DENIED': {
                template: `❌ Access denied.\n\nYou don't have permission to manage this order.`,
                description: 'User doesn\'t have access to order',
                variables: []
            },

            // ==================== BULK ORDER RESPONSES ====================
            'BULK_HEADER': {
                template: `📋 {command} Results\n━━━━━━━━━━━━━━━━`,
                description: 'Header for bulk order responses',
                variables: ['command']
            },
            'BULK_SUCCESS_ITEM': {
                template: `• {order_id}`,
                description: 'Each successful order in bulk response',
                variables: ['order_id', 'status', 'service']
            },
            'BULK_FAILED_ITEM': {
                template: `• {order_id}: {error}`,
                description: 'Each failed order in bulk response',
                variables: ['order_id', 'error', 'reason']
            },
            'BULK_SUMMARY': {
                template: `━━━━━━━━━━━━━━━━\nTotal: {total} | ✅ {success_count} | ❌ {failed_count}`,
                description: 'Summary footer for bulk responses',
                variables: ['total', 'success_count', 'failed_count']
            }
        };
    }

    /**
     * Get template for a specific command
     * Checks user's custom templates first, falls back to default
     */
    async getTemplate(userId, command) {
        // Try to find user's custom template (default scope: no device/panel)
        const customTemplate = await prisma.commandTemplate.findFirst({
            where: {
                userId,
                command,
                deviceId: null,
                panelId: null
            }
        });

        if (customTemplate && customTemplate.isActive) {
            return customTemplate.template;
        }

        // Fall back to default
        const defaultTemplate = this.defaultTemplates[command];
        return defaultTemplate?.template || null;
    }

    /**
     * Format a template with variables
     */
    formatTemplate(template, variables = {}) {
        if (!template) return null;

        let formatted = template;

        // Replace all variables
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{${key}\\}`, 'gi');
            formatted = formatted.replace(regex, value ?? 'N/A');
        }

        // Clean up any remaining unreplaced variables
        formatted = formatted.replace(/\{[a-z_]+\}/gi, 'N/A');

        return formatted;
    }

    /**
     * Get formatted response for a command
     */
    async getResponse(userId, command, variables = {}) {
        const template = await this.getTemplate(userId, command);
        if (!template) {
            console.log(`[ResponseTemplate] No template found for command: ${command}`);
            return null;
        }
        return this.formatTemplate(template, variables);
    }

    /**
     * Get all templates for a user (custom + defaults)
     */
    async getAllTemplates(userId) {
        // Get user's custom templates (default scope only)
        const customTemplates = await prisma.commandTemplate.findMany({
            where: { userId, deviceId: null, panelId: null },
            orderBy: { command: 'asc' }
        });

        const customMap = {};
        for (const t of customTemplates) {
            customMap[t.command] = t;
        }

        // Merge with defaults
        const result = [];
        for (const [command, defaultData] of Object.entries(this.defaultTemplates)) {
            const custom = customMap[command];
            result.push({
                command,
                template: custom?.template || defaultData.template,
                isCustom: !!custom,
                isActive: custom?.isActive ?? true,
                description: defaultData.description,
                variables: defaultData.variables,
                defaultTemplate: defaultData.template
            });
        }

        return result;
    }

    /**
     * Update or create a custom template
     */
    async updateTemplate(userId, command, template, isActive = true) {
        // Find existing record (can't use upsert with nullable composite keys)
        const existing = await prisma.commandTemplate.findFirst({
            where: {
                userId,
                command,
                deviceId: null,
                panelId: null
            }
        });

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
                    deviceId: null,
                    panelId: null
                }
            });
        }
    }

    /**
     * Reset a template to default
     */
    async resetTemplate(userId, command) {
        await prisma.commandTemplate.deleteMany({
            where: { userId, command, deviceId: null, panelId: null }
        });

        return this.defaultTemplates[command] || null;
    }

    /**
     * Reset all templates to default
     */
    async resetAllTemplates(userId) {
        await prisma.commandTemplate.deleteMany({
            where: { userId, deviceId: null, panelId: null }
        });

        return Object.keys(this.defaultTemplates);
    }

    /**
     * Get available variables for a command
     */
    getVariables(command) {
        return this.defaultTemplates[command]?.variables || [];
    }

    /**
     * Validate a template (check for invalid variables)
     */
    validateTemplate(command, template) {
        const allowedVariables = this.getVariables(command);
        const usedVariables = template.match(/\{([a-z_]+)\}/gi) || [];

        const invalid = [];
        for (const v of usedVariables) {
            const varName = v.replace(/[{}]/g, '').toLowerCase();
            if (!allowedVariables.includes(varName)) {
                invalid.push(varName);
            }
        }

        return {
            valid: invalid.length === 0,
            invalidVariables: invalid,
            allowedVariables
        };
    }
}

module.exports = new ResponseTemplateService();
