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
        // Order-related commands (require order IDs)
        this.commands = {
            refill: ['refill', 'rf', 'isi', 'reff', 'refil'],
            cancel: ['cancel', 'cancelled', 'cancelll', 'batal', 'cn', 'batalkan', 'refund', 'refunded', 'firta paisa'],
            speedup: ['speedup', 'speed-up', 'speed up', 'speed', 'cepat', 'sp', 'fast'],
            status: ['status', 'cek', 'check', 'st', 'info']
        };

        // User commands (no order ID required, just the command keyword)
        this.userCommands = {
            verify: ['verify', 'payment', 'txn', 'transaction', 'bayar', 'pembayaran'],
            account: ['account', 'balance', 'saldo', 'me', 'myinfo', 'akun', 'profile'],
            ticket: ['ticket', 'tiket', 'myticket', 'ticketstatus', 'cektiket']
        };

        // Build reverse lookup for order commands
        this.commandLookup = {};
        for (const [command, aliases] of Object.entries(this.commands)) {
            for (const alias of aliases) {
                this.commandLookup[alias.toLowerCase()] = command;
            }
        }

        // Build reverse lookup for user commands
        this.userCommandLookup = {};
        for (const [command, aliases] of Object.entries(this.userCommands)) {
            for (const alias of aliases) {
                this.userCommandLookup[alias.toLowerCase()] = command;
            }
        }

        // Max order IDs per message
        this.maxOrderIds = 100;

        // Cache for per-user custom aliases (userId → merged lookup)
        this._userLookupCache = new Map();
        this._userLookupCacheExpiry = new Map();
        this._cacheTTL = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Load user-defined custom command aliases from Setting table
     * Returns a merged lookup (defaults + custom) that is thread-safe
     * @param {string} userId - User ID to load custom aliases for
     * @returns {Object} Merged commandLookup
     */
    async getUserCommandLookup(userId) {
        if (!userId) return this.commandLookup;

        // Check cache
        const cached = this._userLookupCache.get(userId);
        const expiry = this._userLookupCacheExpiry.get(userId);
        if (cached && expiry && Date.now() < expiry) {
            return cached;
        }

        try {
            const prisma = require('../utils/prisma');
            const setting = await prisma.setting.findUnique({
                where: {
                    key_userId: {
                        key: 'custom_command_aliases',
                        userId
                    }
                }
            });

            if (!setting || !setting.value) {
                return this.commandLookup;
            }

            // Parse custom aliases JSON: { cancel: ["word1", "word2"], refill: ["word3"] }
            const customAliases = JSON.parse(setting.value);

            // Merge with defaults (additive only — never removes defaults)
            const mergedLookup = { ...this.commandLookup };
            for (const [command, aliases] of Object.entries(customAliases)) {
                const canonicalCommand = command.toLowerCase();
                // Only allow mapping to known commands
                if (!this.commands[canonicalCommand]) continue;

                if (Array.isArray(aliases)) {
                    for (const alias of aliases) {
                        const normalizedAlias = alias.toLowerCase().trim();
                        if (normalizedAlias) {
                            mergedLookup[normalizedAlias] = canonicalCommand;
                        }
                    }
                }
            }

            // Cache the merged lookup
            this._userLookupCache.set(userId, mergedLookup);
            this._userLookupCacheExpiry.set(userId, Date.now() + this._cacheTTL);

            return mergedLookup;
        } catch (error) {
            console.error('[CommandParser] Failed to load custom aliases:', error.message);
            return this.commandLookup;
        }
    }

    /**
     * Parse a message and extract command + order IDs or user command + argument
     * @param {string} message - The incoming message
     * @returns {Object} - { command, orderIds, isValid, error, isUserCommand, argument }
     */
    parse(message) {
        if (!message || typeof message !== 'string') {
            return { isValid: false, error: 'Empty message' };
        }

        const normalizedMessage = message.trim().toLowerCase();

        // First, check if it's a user command (verify, account)
        let result = this.parseUserCommand(message);
        if (result.isValid) {
            return result;
        }

        // Try different parsing strategies for order commands
        result = this.parseOrderIdFirst(message);
        if (!result.isValid) {
            result = this.parseCommandFirst(message);
        }
        // Try format: "command order {ID}" like "status order 12345"
        if (!result.isValid) {
            result = this.parseCommandWithOrder(message);
        }

        // Last resort: Fuzzy parse — extract order IDs and command from anywhere in the message
        // Handles: "ID: 7645607. Refill", "please refund the order 7463677", etc.
        if (!result.isValid) {
            result = this.parseFuzzy(message);
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
     * Parse user commands (verify, account) that don't require order IDs
     * Format: "verify TXN123" or "account" or "balance"
     */
    parseUserCommand(message) {
        const parts = message.trim().split(/\s+/);
        if (parts.length === 0) {
            return { isValid: false };
        }

        // First word should be a user command
        const potentialCommand = parts[0].toLowerCase();
        const command = this.userCommandLookup[potentialCommand];

        if (!command) {
            return { isValid: false };
        }

        // For 'verify' command, we need an argument (transaction ID)
        // For 'account' command, no argument needed
        let argument = null;
        if (parts.length > 1) {
            argument = parts.slice(1).join(' ').trim();
        }

        // Verify command requires a transaction ID
        if (command === 'verify' && !argument) {
            return {
                isValid: true,
                command,
                isUserCommand: true,
                argument: null,
                needsArgument: true,
                originalMessage: message
            };
        }

        // Ticket command - can have ticket number as argument or show list if no argument
        // Supports formats: "ticket T2501-0001" or "ticket" (shows list)
        if (command === 'ticket') {
            // Check if argument looks like a ticket number (T####-####)
            const ticketMatch = argument ? argument.match(/^T\d{4}-\d{4}$/i) : null;
            return {
                isValid: true,
                command,
                isUserCommand: true,
                argument: ticketMatch ? ticketMatch[0].toUpperCase() : null,
                ticketNumber: ticketMatch ? ticketMatch[0].toUpperCase() : null,
                showList: !ticketMatch, // Show list if no valid ticket number
                originalMessage: message
            };
        }

        return {
            isValid: true,
            command,
            isUserCommand: true,
            argument,
            originalMessage: message
        };
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
        let potentialCommand = parts[parts.length - 1].toLowerCase();
        let command = this.commandLookup[potentialCommand];
        let commandWordCount = 1;

        // If single word didn't match, try last two words (e.g., "speed up")
        if (!command && parts.length >= 3) {
            const twoWordCommand = parts.slice(-2).join(' ').toLowerCase();
            const twoWordMatch = this.commandLookup[twoWordCommand];
            if (twoWordMatch) {
                command = twoWordMatch;
                potentialCommand = twoWordCommand;
                commandWordCount = 2;
            }
        }

        if (!command) {
            return { isValid: false };
        }

        // Everything before the command is order IDs
        const orderIdPart = parts.slice(0, -commandWordCount).join(' ');
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
     * Fuzzy parse: scan entire message for order IDs (3+ digit numbers) and command keywords
     * This is the last-resort parser — only called when all strict parsers fail.
     * Handles messy formats like:
     *   "ID: 7645607. Refill"
     *   "please refund the order 7463677"
     *   "7645607 refund the order"
     *   "order 7645607, please refill it"
     */
    parseFuzzy(message) {
        const normalized = message.toLowerCase();

        // 1. Find ALL numbers with 3+ digits (potential order IDs)
        const numberMatches = message.match(/\d{3,}/g);
        if (!numberMatches || numberMatches.length === 0) {
            return { isValid: false };
        }

        // 2. Find a command keyword anywhere in the message
        let foundCommand = null;
        let foundAlias = null;

        // Check each word in the message against command aliases
        // Split by non-alphanumeric to handle punctuation
        const words = normalized.split(/[^a-z0-9-]+/).filter(w => w.length > 0);

        for (const word of words) {
            if (this.commandLookup[word]) {
                foundCommand = this.commandLookup[word];
                foundAlias = word;
                break;
            }
        }

        // Also check two-word commands like "speed up"
        if (!foundCommand) {
            for (let i = 0; i < words.length - 1; i++) {
                const twoWord = words[i] + ' ' + words[i + 1];
                if (this.commandLookup[twoWord]) {
                    foundCommand = this.commandLookup[twoWord];
                    foundAlias = twoWord;
                    break;
                }
            }
        }

        if (!foundCommand) {
            return { isValid: false };
        }

        // 3. Use the numbers as order IDs (deduplicated)
        const orderIds = [...new Set(numberMatches)];

        if (orderIds.length === 0) {
            return { isValid: false };
        }

        return {
            isValid: true,
            command: foundCommand,
            orderIds,
            rawCommand: foundAlias,
            originalMessage: message,
            fuzzyMatch: true  // Flag so caller knows this was a fuzzy match
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
            // Accept alphanumeric with minimum 3 characters AND must contain at least 1 digit
            if (cleaned && /^[a-zA-Z0-9_-]{3,50}$/.test(cleaned) && /\d/.test(cleaned)) {
                // Prefer numeric-only for SMM panels, also accept alphanumeric with digits
                if (/^\d+$/.test(cleaned) || /^[a-zA-Z0-9_-]+$/.test(cleaned)) {
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
        const firstWord = normalized.split(/\s+/)[0];

        // Check if it's a user command (verify, account)
        if (this.userCommandLookup[firstWord]) {
            return true;
        }

        // Check if any order command keyword exists in the message
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
     * Check if a message looks like a command, including user-custom aliases
     * @param {string} message - The message to check
     * @param {Object} customLookup - Merged lookup from getUserCommandLookup()
     */
    isCommandMessageWithCustom(message, customLookup) {
        // First check default aliases
        if (this.isCommandMessage(message)) return true;

        if (!customLookup || !message) return false;

        // Check custom aliases against message
        const normalized = message.trim().toLowerCase();
        for (const alias of Object.keys(customLookup)) {
            // Skip aliases that are already in default lookup
            if (this.commandLookup[alias]) continue;

            if (normalized.includes(alias) && /\d{3,}/.test(message)) {
                return true;
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
            status: 'Status',
            verify: 'Payment Verification',
            account: 'Account Details'
        };
        return displayNames[command] || command;
    }

    /**
 * Generate response message for command result
 * Uses ResponseTemplateService for customizable responses
 * Falls back to hardcoded templates if service unavailable
 */
    generateResponse(command, orderId, success, details = {}) {
        // Fallback templates (used if ResponseTemplateService not available)
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

    /**
     * Generate response using ResponseTemplateService (async version)
     * Use this when you have access to userId for customizable responses
     */
    async generateResponseAsync(userId, command, orderId, success, details = {}) {
        try {
            const responseTemplateService = require('./responseTemplateService');

            // Map command + result to template key
            let templateKey;
            if (success) {
                templateKey = `${command.toUpperCase()}_SUCCESS`;
            } else if (details.reason === 'status') {
                templateKey = `${command.toUpperCase()}_STATUS_INVALID`;
            } else if (details.reason === 'not_found') {
                templateKey = 'STATUS_NOT_FOUND';
            } else if (details.reason === 'no_guarantee') {
                templateKey = 'REFILL_NO_GUARANTEE';
            } else if (details.reason === 'expired') {
                templateKey = 'REFILL_EXPIRED';
            } else {
                templateKey = `${command.toUpperCase()}_ERROR`;
            }

            // Prepare variables
            const variables = {
                order_id: orderId,
                status: details.status || 'Unknown',
                service: details.serviceName || 'N/A',
                link: details.link || 'N/A',
                remains: details.remains?.toString() || '0',
                start_count: details.startCount?.toString() || '0',
                charge: details.charge?.toString() || '0',
                provider: details.provider || 'N/A',
                provider_order_id: details.providerOrderId || 'N/A',
                date: new Date().toLocaleDateString(),
                guarantee: details.guaranteeDays?.toString() || '30',
                error: details.error || 'Unknown error',
                quantity: details.quantity?.toString() || '0'
            };

            const response = await responseTemplateService.getResponse(userId, templateKey, variables);
            if (response) {
                return response;
            }
        } catch (error) {
            console.log(`[CommandParser] Template service error, using fallback:`, error.message);
        }

        // Fall back to hardcoded response
        return this.generateResponse(command, orderId, success, details);
    }
}

module.exports = new CommandParserService();

