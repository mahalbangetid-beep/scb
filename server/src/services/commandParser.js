/**
 * Command Parser Service
 * 
 * Parse incoming messages to extract SMM commands and order IDs
 * Supports commands: refill, cancel, speed-up, status
 * Format: {ORDER_ID},{ORDER_ID} command
 *         command {ORDER_ID} {ORDER_ID}
 */

class CommandParserService {
    constructor() {
        // Supported commands with aliases
        this.commands = {
            refill: ['refill', 'rf', 'isi', 'reff', 'refil'],
            cancel: ['cancel', 'batal', 'cn', 'batalkan', 'refund'],
            speedup: ['speedup', 'speed-up', 'speed up', 'speed', 'cepat', 'sp', 'fast'],
            status: ['status', 'cek', 'check', 'st', 'info']
        };

        // Build reverse lookup
        this.commandLookup = {};
        for (const [command, aliases] of Object.entries(this.commands)) {
            for (const alias of aliases) {
                this.commandLookup[alias.toLowerCase()] = command;
            }
        }

        // Max order IDs per message
        this.maxOrderIds = 100;
    }

    /**
     * Parse a message and extract command + order IDs
     * @param {string} message - The incoming message
     * @returns {Object} - { command, orderIds, isValid, error }
     */
    parse(message) {
        if (!message || typeof message !== 'string') {
            return { isValid: false, error: 'Empty message' };
        }

        const normalizedMessage = message.trim().toLowerCase();

        // Try different parsing strategies
        let result = this.parseOrderIdFirst(message);
        if (!result.isValid) {
            result = this.parseCommandFirst(message);
        }
        // Try format: "command order {ID}" like "status order 12345"
        if (!result.isValid) {
            result = this.parseCommandWithOrder(message);
        }

        // Validate result
        if (result.isValid) {
            // Remove duplicates
            result.orderIds = [...new Set(result.orderIds)];

            // Check max limit
            if (result.orderIds.length > this.maxOrderIds) {
                return {
                    isValid: false,
                    error: `Maximum ${this.maxOrderIds} order IDs per message. You sent ${result.orderIds.length}.`
                };
            }

            // Ensure at least one order ID
            if (result.orderIds.length === 0) {
                return { isValid: false, error: 'No order IDs found' };
            }
        }

        return result;
    }

    /**
     * Parse format: {ORDER_ID},{ORDER_ID} command
     * Example: "12345,12346,12347 refill"
     */
    parseOrderIdFirst(message) {
        const parts = message.trim().split(/\s+/);
        if (parts.length < 2) {
            return { isValid: false };
        }

        // Last word should be command
        const potentialCommand = parts[parts.length - 1].toLowerCase();
        const command = this.commandLookup[potentialCommand];

        if (!command) {
            return { isValid: false };
        }

        // Everything before the command is order IDs
        const orderIdPart = parts.slice(0, -1).join(' ');
        const orderIds = this.extractOrderIds(orderIdPart);

        if (orderIds.length === 0) {
            return { isValid: false };
        }

        return {
            isValid: true,
            command,
            orderIds,
            rawCommand: potentialCommand,
            originalMessage: message
        };
    }

    /**
     * Parse format: command {ORDER_ID} {ORDER_ID}
     * Example: "refill 12345 12346 12347"
     */
    parseCommandFirst(message) {
        const parts = message.trim().split(/\s+/);
        if (parts.length < 2) {
            return { isValid: false };
        }

        // First word should be command
        const potentialCommand = parts[0].toLowerCase();
        const command = this.commandLookup[potentialCommand];

        if (!command) {
            return { isValid: false };
        }

        // Everything after the command is order IDs
        const orderIdPart = parts.slice(1).join(' ');
        const orderIds = this.extractOrderIds(orderIdPart);

        if (orderIds.length === 0) {
            return { isValid: false };
        }

        return {
            isValid: true,
            command,
            orderIds,
            rawCommand: potentialCommand,
            originalMessage: message
        };
    }

    /**
     * Parse format: command order {ORDER_ID}
     * Example: "status order 12345678" or "check order 12345"
     * Handles filler words like "order", "id", "no", "#"
     */
    parseCommandWithOrder(message) {
        const parts = message.trim().split(/\s+/);
        if (parts.length < 3) {
            return { isValid: false };
        }

        // First word should be command
        const potentialCommand = parts[0].toLowerCase();
        const command = this.commandLookup[potentialCommand];

        if (!command) {
            return { isValid: false };
        }

        // Skip filler words like "order", "id", "no", "#"
        const fillerWords = ['order', 'orders', 'id', 'ids', 'no', 'number', '#'];
        let startIndex = 1;

        while (startIndex < parts.length && fillerWords.includes(parts[startIndex].toLowerCase())) {
            startIndex++;
        }

        // Everything after filler words is order IDs
        const orderIdPart = parts.slice(startIndex).join(' ');
        const orderIds = this.extractOrderIds(orderIdPart);

        if (orderIds.length === 0) {
            return { isValid: false };
        }

        return {
            isValid: true,
            command,
            orderIds,
            rawCommand: potentialCommand,
            originalMessage: message
        };
    }

    /**
     * Extract order IDs from a string
     * Supports: comma-separated, space-separated, newline-separated
     */
    extractOrderIds(text) {
        // Split by various delimiters
        const parts = text.split(/[,\s\n]+/);

        const orderIds = [];
        for (const part of parts) {
            const cleaned = part.trim();

            // Order IDs are typically numeric, but could have prefixes
            // Accept alphanumeric with minimum 3 characters
            if (cleaned && /^[a-zA-Z0-9_-]{3,50}$/.test(cleaned)) {
                // Prefer numeric-only for SMM panels
                if (/^\d+$/.test(cleaned) || /^[a-zA-Z0-9]+$/.test(cleaned)) {
                    orderIds.push(cleaned);
                }
            }
        }

        return orderIds;
    }

    /**
     * Check if a message looks like a command (quick check)
     */
    isCommandMessage(message) {
        if (!message || typeof message !== 'string') {
            return false;
        }

        const normalized = message.trim().toLowerCase();

        // Check if any command keyword exists in the message
        for (const aliases of Object.values(this.commands)) {
            for (const alias of aliases) {
                if (normalized.includes(alias)) {
                    // Additional check: should have numbers (order IDs)
                    if (/\d{3,}/.test(message)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Get command name in display format
     */
    getDisplayCommand(command) {
        const displayNames = {
            refill: 'Refill',
            cancel: 'Cancel',
            speedup: 'Speed-up',
            status: 'Status'
        };
        return displayNames[command] || command;
    }

    /**
     * Generate response message for command result
     */
    generateResponse(command, orderId, success, details = {}) {
        const templates = {
            refill: {
                success: `✅ Order ${orderId} has been added to refill queue.`,
                error_status: `❌ Order ${orderId}: Cannot refill. Order status is "${details.status}". Only completed orders can be refilled.`,
                error_not_found: `❌ Order ${orderId}: Not found in your account.`,
                error_api: `❌ Order ${orderId}: Refill failed - ${details.error}`
            },
            cancel: {
                success: `✅ Order ${orderId} has been added to cancel queue.`,
                error_status: `❌ Order ${orderId}: Cannot cancel. Order status is "${details.status}".`,
                error_not_found: `❌ Order ${orderId}: Not found in your account.`,
                error_api: `❌ Order ${orderId}: Cancel failed - ${details.error}`
            },
            speedup: {
                success: `✅ Speed-up request logged for order ${orderId}.`,
                error_status: `❌ Order ${orderId}: Cannot speed-up. Order status is "${details.status}".`,
                error_not_found: `❌ Order ${orderId}: Not found in your account.`
            },
            status: {
                success: `📊 Order ${orderId}\nStatus: ${details.status}\nStart: ${details.startCount || 'N/A'}\nRemains: ${details.remains || 'N/A'}`,
                error_not_found: `❌ Order ${orderId}: Not found in your account.`,
                error_api: `❌ Order ${orderId}: Status check failed - ${details.error}`
            }
        };

        const template = templates[command];
        if (!template) {
            return success ? `✅ ${orderId}: Success` : `❌ ${orderId}: Failed`;
        }

        if (success) {
            return template.success;
        }

        if (details.reason === 'status') {
            return template.error_status || template.error_api;
        }
        if (details.reason === 'not_found') {
            return template.error_not_found;
        }
        return template.error_api || `❌ Order ${orderId}: ${details.error || 'Unknown error'}`;
    }
}

module.exports = new CommandParserService();
