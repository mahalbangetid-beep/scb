/**
 * Guarantee Service
 * 
 * Service for validating guarantee periods on refill requests
 * Phase 2: Order Command Handling - Guarantee Validation
 * 
 * Features:
 * - Extract guarantee days from service name patterns
 * - Support multiple patterns (30 Days ♻️, 10 Days Guarantee, etc.)
 * - Calculate expiry from order completion date
 * - User-configurable guarantee patterns
 */

const prisma = require('../utils/prisma');

class GuaranteeService {
    constructor() {
        // Default patterns for detecting guarantee in service names
        this.defaultPatterns = [
            /(\d+)\s*Days?\s*♻️/i,                    // "30 Days ♻️"
            /(\d+)\s*Days?\s*Guarantee/i,             // "30 Days Guarantee"
            /Guarantee\s*(\d+)\s*Days?/i,             // "Guarantee 30 Days"
            /♻️\s*(\d+)\s*Days?/i,                    // "♻️ 30 Days"
            /(\d+)\s*D\s*♻️/i,                        // "30D ♻️"
            /(\d+)\s*D\s*Refill/i,                    // "30D Refill"
            /Refill\s*(\d+)\s*Days?/i,                // "Refill 30 Days"
            /(\d+)\s*Days?\s*Refill/i,                // "30 Days Refill"
            /🔄\s*(\d+)\s*Days?/i,                    // "🔄 30 Days"
            /(\d+)\s*Days?\s*🔄/i,                    // "30 Days 🔄"
            /(\d+)\s*Day\s*Warranty/i,                // "30 Day Warranty"
            /R(\d+)/i                                  // "R30" format
        ];

        // Default keywords that indicate guarantee
        this.defaultKeywords = ['guarantee', 'refill', '♻️', '🔄', 'warranty', 'lifetime'];
    }

    /**
     * Get guarantee config for a user
     * Creates default config if none exists
     * @param {string} userId - User ID
     * @returns {Object} Guarantee config
     */
    async getConfig(userId) {
        if (!userId) {
            throw new Error('User ID is required');
        }

        let config = await prisma.guaranteeConfig.findUnique({
            where: { userId }
        });

        // Create default config if none exists
        if (!config) {
            config = await prisma.guaranteeConfig.create({
                data: {
                    userId,
                    patterns: JSON.stringify([]),
                    keywords: 'guarantee,refill,♻️,🔄,warranty',
                    emojis: '♻️,🔄,✅',
                    defaultDays: 30,
                    isEnabled: true,
                    noGuaranteeAction: 'DENY'
                }
            });
        }

        return config;
    }

    /**
     * Update guarantee config
     * @param {string} userId - User ID
     * @param {Object} updates - Config updates
     * @returns {Object} Updated config
     */
    async updateConfig(userId, updates) {
        await this.getConfig(userId); // Ensure exists

        const config = await prisma.guaranteeConfig.update({
            where: { userId },
            data: updates
        });

        return config;
    }

    /**
     * Extract guarantee days from service name
     * @param {string} serviceName - Service name
     * @param {Object} userConfig - User's guarantee config
     * @returns {number|null} Guarantee days or null if none found
     */
    extractGuaranteeDays(serviceName, userConfig = null) {
        if (!serviceName) return null;

        // First, try user's custom patterns
        if (userConfig?.patterns) {
            try {
                const customPatterns = JSON.parse(userConfig.patterns);
                for (const patternStr of customPatterns) {
                    if (!patternStr) continue;
                    try {
                        const pattern = new RegExp(patternStr, 'i');
                        const match = serviceName.match(pattern);
                        if (match && match[1]) {
                            return parseInt(match[1]);
                        }
                    } catch (e) {
                        console.log(`[GuaranteeService] Invalid pattern: ${patternStr}`);
                    }
                }
            } catch (e) {
                // Invalid JSON, skip
            }
        }

        // Try default patterns
        for (const pattern of this.defaultPatterns) {
            const match = serviceName.match(pattern);
            if (match && match[1]) {
                return parseInt(match[1]);
            }
        }

        // Check for keywords (might indicate guarantee without specific days)
        const keywords = userConfig?.keywords?.split(',').map(k => k.trim().toLowerCase())
            || this.defaultKeywords;

        const lowerName = serviceName.toLowerCase();
        for (const keyword of keywords) {
            if (keyword && lowerName.includes(keyword)) {
                // Found keyword, use default days
                return userConfig?.defaultDays || 30;
            }
        }

        // Check for emojis
        const emojis = userConfig?.emojis?.split(',').map(e => e.trim()) || ['♻️', '🔄'];
        for (const emoji of emojis) {
            if (emoji && serviceName.includes(emoji)) {
                return userConfig?.defaultDays || 30;
            }
        }

        return null; // No guarantee found
    }

    /**
     * Check if guarantee is still valid for an order
     * @param {Object} order - Order object with serviceName, completedAt, status
     * @param {string} userId - User ID for config
     * @returns {Object} { valid, reason, details }
     */
    async checkGuarantee(order, userId) {
        // Get user's config
        const config = await this.getConfig(userId);

        // If guarantee validation is disabled, allow all
        if (!config.isEnabled) {
            return {
                valid: true,
                reason: 'VALIDATION_DISABLED',
                details: { message: 'Guarantee validation is disabled' }
            };
        }

        // Only completed orders can have refill
        if (order.status !== 'COMPLETED') {
            return {
                valid: false,
                reason: 'NOT_COMPLETED',
                details: {
                    message: `Order is not completed (Status: ${order.status})`,
                    status: order.status
                }
            };
        }

        // Extract guarantee days
        const guaranteeDays = this.extractGuaranteeDays(order.serviceName, config);

        // No guarantee found
        if (!guaranteeDays) {
            // Handle based on noGuaranteeAction
            switch (config.noGuaranteeAction) {
                case 'ALLOW':
                    return {
                        valid: true,
                        reason: 'NO_GUARANTEE_ALLOW',
                        details: { message: 'No guarantee found, but refill allowed' }
                    };
                case 'ASK':
                    return {
                        valid: false,
                        reason: 'NO_GUARANTEE_ASK',
                        details: {
                            message: 'This service does not have a guarantee. Are you sure you want to request a refill?',
                            requiresConfirmation: true
                        }
                    };
                case 'DENY':
                default:
                    return {
                        valid: false,
                        reason: 'NO_GUARANTEE',
                        details: {
                            message: `❌ Refill not available. This service (${order.serviceName}) does not include a guarantee.`
                        }
                    };
            }
        }

        // Calculate expiry date
        const completedAt = order.completedAt || order.updatedAt;
        if (!completedAt) {
            // No completion date, can't validate - allow as fallback
            return {
                valid: true,
                reason: 'NO_COMPLETION_DATE',
                details: {
                    message: 'Completion date not recorded, refill allowed',
                    guaranteeDays
                }
            };
        }

        const expiryDate = new Date(completedAt);
        expiryDate.setDate(expiryDate.getDate() + guaranteeDays);

        const now = new Date();
        const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

        if (now > expiryDate) {
            // Guarantee expired
            return {
                valid: false,
                reason: 'EXPIRED',
                details: {
                    message: `❌ Guarantee expired. The ${guaranteeDays}-day guarantee period ended on ${expiryDate.toLocaleDateString()}.`,
                    guaranteeDays,
                    completedAt,
                    expiredAt: expiryDate,
                    daysOverdue: Math.abs(daysRemaining)
                }
            };
        }

        // Still valid
        return {
            valid: true,
            reason: 'VALID',
            details: {
                message: `✅ Guarantee valid (${daysRemaining} days remaining)`,
                guaranteeDays,
                completedAt,
                expiresAt: expiryDate,
                daysRemaining
            }
        };
    }

    /**
     * Format guarantee message for user response
     * @param {Object} checkResult - Result from checkGuarantee
     * @param {Object} order - Order object
     * @returns {string} Formatted message
     */
    formatGuaranteeMessage(checkResult, order) {
        const orderId = order.externalOrderId || order.id;

        switch (checkResult.reason) {
            case 'VALID':
                return `✅ Order #${orderId} - Guarantee valid (${checkResult.details.daysRemaining} days remaining)`;

            case 'EXPIRED':
                return `❌ Order #${orderId} - Guarantee expired on ${checkResult.details.expiredAt.toLocaleDateString()}. Refill not available.`;

            case 'NO_GUARANTEE':
                return `❌ Order #${orderId} - This service does not include a refill guarantee.`;

            case 'NO_GUARANTEE_ASK':
                return `⚠️ Order #${orderId} - No guarantee found. Reply "YES" to proceed with refill anyway.`;

            case 'NOT_COMPLETED':
                return `❌ Order #${orderId} - Cannot refill. Order status: ${checkResult.details.status}`;

            case 'VALIDATION_DISABLED':
            case 'NO_GUARANTEE_ALLOW':
            case 'NO_COMPLETION_DATE':
                return `✅ Order #${orderId} - Refill request allowed`;

            default:
                return `❓ Order #${orderId} - Unable to validate guarantee`;
        }
    }

    /**
     * Get guarantee info for an order (for display purposes)
     * @param {Object} order - Order object
     * @param {Object} config - User's config
     * @returns {Object} Guarantee info
     */
    getGuaranteeInfo(order, config = null) {
        const guaranteeDays = this.extractGuaranteeDays(order.serviceName, config);

        if (!guaranteeDays) {
            return {
                hasGuarantee: false,
                days: null,
                status: 'No guarantee',
                icon: '❌'
            };
        }

        const completedAt = order.completedAt || order.updatedAt;
        if (!completedAt || order.status !== 'COMPLETED') {
            return {
                hasGuarantee: true,
                days: guaranteeDays,
                status: 'Pending completion',
                icon: '⏳'
            };
        }

        const expiryDate = new Date(completedAt);
        expiryDate.setDate(expiryDate.getDate() + guaranteeDays);

        const now = new Date();
        const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

        if (now > expiryDate) {
            return {
                hasGuarantee: true,
                days: guaranteeDays,
                status: 'Expired',
                expiresAt: expiryDate,
                daysOverdue: Math.abs(daysRemaining),
                icon: '⛔'
            };
        }

        return {
            hasGuarantee: true,
            days: guaranteeDays,
            status: 'Active',
            expiresAt: expiryDate,
            daysRemaining,
            icon: daysRemaining <= 3 ? '⚠️' : '✅'
        };
    }
}

module.exports = new GuaranteeService();
