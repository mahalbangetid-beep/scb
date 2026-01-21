/**
 * Bulk Order Parser Service
 * 
 * Service for parsing bulk/mass order commands from WhatsApp
 * Phase 3: Mass/Bulk Order Support from client requirements
 * 
 * Supported Formats:
 * - Multiple order IDs with command: "12345, 67890, 11111 cancel"
 * - Line-separated: "12345 cancel\n67890 refill"
 * - Comma-separated IDs: "12345,67890,11111 cancel"
 * - Range format: "12345-12350 refill"
 * - Mixed format: "12345,67890 cancel\n11111 refill"
 */

class BulkOrderParser {
    constructor() {
        // Supported commands
        this.validCommands = ['CANCEL', 'REFILL', 'SPEEDUP', 'STATUS', 'CHECK', 'HELP'];

        // Max orders per bulk request
        this.maxOrdersPerRequest = 50;

        // Response modes
        this.responseModes = {
            DETAILED: 'detailed',  // One response per order
            COMPACT: 'compact',    // Summary response
            GROUPED: 'grouped'     // Group by status
        };
    }

    /**
     * Parse a message for bulk orders
     * @returns {Object} { isBulk, orders[], command, errors[], originalMessage }
     */
    parseMessage(message) {
        if (!message || typeof message !== 'string') {
            return { isBulk: false, orders: [], errors: ['Empty message'] };
        }

        const trimmedMessage = message.trim();
        const lines = trimmedMessage.split('\n').map(l => l.trim()).filter(l => l);

        // Single line with multiple order IDs
        if (lines.length === 1) {
            return this.parseSingleLine(lines[0]);
        }

        // Multiple lines - parse each
        return this.parseMultipleLines(lines);
    }

    /**
     * Parse single line that may contain multiple orders
     */
    parseSingleLine(line) {
        const orders = [];
        const errors = [];
        let command = null;

        // Extract command from end of line
        const commandMatch = line.match(/\s+(CANCEL|REFILL|SPEEDUP|STATUS|CHECK|HELP)\s*$/i);
        if (commandMatch) {
            command = commandMatch[1].toUpperCase();
            line = line.replace(commandMatch[0], '').trim();
        }

        // Check for range format: 12345-12350
        const rangeMatch = line.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
            const start = parseInt(rangeMatch[1]);
            const end = parseInt(rangeMatch[2]);

            if (end - start > this.maxOrdersPerRequest) {
                errors.push(`Range too large. Maximum ${this.maxOrdersPerRequest} orders per request.`);
            } else if (end < start) {
                errors.push('Invalid range: end must be greater than start');
            } else {
                for (let i = start; i <= end; i++) {
                    orders.push({
                        orderId: i.toString(),
                        command: command,
                        lineNumber: 1
                    });
                }
            }

            return {
                isBulk: orders.length > 1,
                orders,
                command,
                errors,
                originalMessage: line,
                format: 'RANGE'
            };
        }

        // Check for comma-separated or space-separated IDs
        const ids = line.split(/[,\s]+/).filter(id => /^\d+$/.test(id));

        if (ids.length === 0 && !command) {
            // Not an order command
            return { isBulk: false, orders: [], command: null };
        }

        for (const id of ids) {
            orders.push({
                orderId: id,
                command: command,
                lineNumber: 1
            });
        }

        // Check limit
        if (orders.length > this.maxOrdersPerRequest) {
            errors.push(`Too many orders. Maximum ${this.maxOrdersPerRequest} per request. You sent ${orders.length}.`);
            return { isBulk: true, orders: orders.slice(0, this.maxOrdersPerRequest), command, errors, format: 'TRUNCATED' };
        }

        return {
            isBulk: orders.length > 1,
            orders,
            command,
            errors,
            originalMessage: line,
            format: orders.length > 1 ? 'LIST' : 'SINGLE'
        };
    }

    /**
     * Parse multiple lines
     */
    parseMultipleLines(lines) {
        const orders = [];
        const errors = [];
        let lineNumber = 0;

        for (const line of lines) {
            lineNumber++;

            // Parse each line individually
            const parsed = this.parseSingleLine(line);

            for (const order of parsed.orders) {
                order.lineNumber = lineNumber;
                orders.push(order);
            }

            if (parsed.errors.length > 0) {
                errors.push(`Line ${lineNumber}: ${parsed.errors.join(', ')}`);
            }
        }

        // Check total limit
        if (orders.length > this.maxOrdersPerRequest) {
            errors.push(`Too many orders. Maximum ${this.maxOrdersPerRequest} per request. You sent ${orders.length}.`);
            return {
                isBulk: true,
                orders: orders.slice(0, this.maxOrdersPerRequest),
                errors,
                format: 'MULTI_LINE_TRUNCATED'
            };
        }

        return {
            isBulk: orders.length > 1,
            orders,
            errors,
            format: 'MULTI_LINE'
        };
    }

    /**
     * Group orders by command
     */
    groupByCommand(orders) {
        const grouped = {};

        for (const order of orders) {
            const cmd = order.command || 'UNKNOWN';
            if (!grouped[cmd]) {
                grouped[cmd] = [];
            }
            grouped[cmd].push(order);
        }

        return grouped;
    }

    /**
     * Format bulk response - DETAILED mode
     */
    formatDetailedResponse(results) {
        let response = `📋 *Bulk Order Results*\n\n`;

        for (const result of results) {
            const icon = result.success ? '✅' : '❌';
            response += `${icon} Order #${result.orderId}: ${result.message}\n`;
        }

        const success = results.filter(r => r.success).length;
        const failed = results.length - success;

        response += `\n📊 Summary: ${success} success, ${failed} failed`;

        return response;
    }

    /**
     * Format bulk response - COMPACT mode
     */
    formatCompactResponse(results) {
        const success = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        let response = `📋 *Bulk Order Summary*\n\n`;

        if (success.length > 0) {
            response += `✅ *Success (${success.length}):*\n`;
            response += success.map(r => `#${r.orderId}`).join(', ');
            response += '\n\n';
        }

        if (failed.length > 0) {
            response += `❌ *Failed (${failed.length}):*\n`;
            for (const f of failed) {
                response += `#${f.orderId}: ${f.message}\n`;
            }
        }

        return response;
    }

    /**
     * Format bulk response - GROUPED mode
     */
    formatGroupedResponse(results) {
        const grouped = {};

        for (const result of results) {
            const status = result.status || (result.success ? 'SUCCESS' : 'FAILED');
            if (!grouped[status]) {
                grouped[status] = [];
            }
            grouped[status].push(result);
        }

        let response = `📋 *Bulk Order Results by Status*\n\n`;

        const statusIcons = {
            SUCCESS: '✅',
            FAILED: '❌',
            PENDING: '⏳',
            IN_PROGRESS: '🔄',
            COMPLETED: '✔️',
            CANCELLED: '🚫',
            NOT_FOUND: '❓'
        };

        for (const [status, items] of Object.entries(grouped)) {
            const icon = statusIcons[status] || '•';
            response += `${icon} *${status} (${items.length}):*\n`;
            response += items.map(i => `#${i.orderId}`).join(', ');
            response += '\n\n';
        }

        return response;
    }

    /**
     * Validate order ID format
     */
    isValidOrderId(id) {
        return /^\d{5,15}$/.test(id);
    }

    /**
     * Get message for bulk request explanation
     */
    getBulkHelpMessage() {
        return `📋 *Bulk Order Commands*

You can process multiple orders at once:

*Comma-separated:*
\`12345, 67890, 11111 cancel\`

*Line by line:*
\`\`\`
12345 cancel
67890 refill
11111 status
\`\`\`

*Range format:*
\`12345-12350 refill\`

📝 Maximum ${this.maxOrdersPerRequest} orders per request.`;
    }

    /**
     * Get processing estimate
     */
    getProcessingEstimate(orderCount) {
        // Estimate ~1 second per order for API calls
        const seconds = orderCount * 1;

        if (seconds < 60) {
            return `~${seconds} seconds`;
        } else {
            return `~${Math.ceil(seconds / 60)} minutes`;
        }
    }
}

module.exports = new BulkOrderParser();
