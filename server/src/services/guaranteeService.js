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
const { isRegexSafe } = require('../utils/safeRegex');

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
                        if (!isRegexSafe(patternStr)) {
                            console.log(`[GuaranteeService] Blocked unsafe pattern: ${patternStr}`);
                            continue;
                        }
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

        // ==================== METHOD 1: API-Based Detection ====================
        // If config says "api" or "both", check order.canRefill field from Admin API
        if (config.detectionMethod === 'api' || config.detectionMethod === 'both') {
            if (order.canRefill === false) {
                // API says no refill available
                return {
                    valid: false,
                    reason: 'API_NO_REFILL',
                    details: {
                        message: `❌ Refill not available. Provider API indicates this order cannot be refilled.`,
                        source: 'api'
                    }
                };
            }
            // If detectionMethod is "api" only (not "both"), and canRefill is true, allow it
            if (config.detectionMethod === 'api' && order.canRefill === true) {
                return {
                    valid: true,
                    reason: 'API_REFILL_ALLOWED',
                    details: {
                        message: '✅ Refill allowed (API confirmed)',
                        source: 'api'
                    }
                };
            }
        }

        // ==================== METHOD 2 Enhanced: Rules-Based Detection ====================
        // Check user's custom keyword rules before falling back to pattern matching
        try {
            const rulesResult = await this.checkGuaranteeByRules(order.serviceName, userId, order.panelId);
            if (rulesResult.source === 'rule') {
                if (!rulesResult.hasGuarantee) {
                    // Rule says no guarantee
                    switch (config.noGuaranteeAction) {
                        case 'ALLOW':
                            return { valid: true, reason: 'NO_GUARANTEE_ALLOW', details: { message: 'No guarantee found by rules, but refill allowed', source: 'rule', matchedRule: rulesResult.matchedRule } };
                        case 'ASK':
                            return { valid: false, reason: 'NO_GUARANTEE_ASK', details: { message: 'This service does not have a guarantee. Are you sure you want to request a refill?', requiresConfirmation: true, source: 'rule', matchedRule: rulesResult.matchedRule } };
                        case 'DENY':
                        default:
                            return { valid: false, reason: 'NO_GUARANTEE', details: { message: `❌ Refill not available. Service matched rule: "${rulesResult.matchedRule}".`, source: 'rule', matchedRule: rulesResult.matchedRule } };
                    }
                }
                // Rule says has guarantee — use rule's days for expiry check
                const ruleDays = rulesResult.days;
                if (ruleDays) {
                    const completedAt = order.completedAt || order.updatedAt;
                    if (completedAt) {
                        const expiryDate = new Date(completedAt);
                        expiryDate.setDate(expiryDate.getDate() + ruleDays);
                        const now = new Date();
                        const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

                        if (now > expiryDate) {
                            return {
                                valid: false,
                                reason: 'EXPIRED',
                                details: {
                                    message: `❌ Guarantee expired. The ${ruleDays}-day guarantee period ended on ${expiryDate.toLocaleDateString()}.`,
                                    guaranteeDays: ruleDays, completedAt, expiredAt: expiryDate,
                                    daysOverdue: Math.abs(daysRemaining), source: 'rule', matchedRule: rulesResult.matchedRule
                                }
                            };
                        }
                        return {
                            valid: true,
                            reason: 'VALID',
                            details: {
                                message: `✅ Guarantee valid (${daysRemaining} days remaining)`,
                                guaranteeDays: ruleDays, completedAt, expiresAt: expiryDate,
                                daysRemaining, source: 'rule', matchedRule: rulesResult.matchedRule
                            }
                        };
                    }
                    // No completion date — allow as fallback
                    return { valid: true, reason: 'NO_COMPLETION_DATE', details: { message: 'Completion date not recorded, refill allowed', guaranteeDays: ruleDays, source: 'rule' } };
                }
            }
        } catch (e) {
            // Rules check failed — fall through to original pattern-based logic
            console.log('[GuaranteeService] Rules check failed, using pattern fallback:', e.message);
        }

        // ==================== ORIGINAL: Pattern-Based Detection (fallback) ====================
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

    // ==================== GUARANTEE RULES (Method 2 Enhancement) ====================

    /**
     * Get all guarantee rules for a user, optionally filtered by panel
     * @param {string} userId
     * @param {string|null} panelId - null for all rules
     * @returns {Array} Rules sorted by priority
     */
    async getRules(userId, panelId = null) {
        const where = { userId };
        if (panelId !== undefined && panelId !== null) {
            where.OR = [
                { panelId: null },   // Global rules
                { panelId }          // Panel-specific rules
            ];
        }

        return prisma.guaranteeRule.findMany({
            where,
            orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }]
        });
    }

    /**
     * Create a new guarantee rule
     */
    async createRule(userId, data) {
        return prisma.guaranteeRule.create({
            data: {
                userId,
                panelId: data.panelId || null,
                keyword: data.keyword,
                action: data.action, // "no_guarantee" or "guarantee"
                days: data.action === 'guarantee' ? (data.isLifetime ? null : (data.days || 30)) : null,
                isLifetime: data.isLifetime || false,
                priority: data.priority || 100,
                isActive: data.isActive !== undefined ? data.isActive : true
            }
        });
    }

    /**
     * Update a guarantee rule
     */
    async updateRule(ruleId, userId, data) {
        // Verify ownership
        const existing = await prisma.guaranteeRule.findFirst({
            where: { id: ruleId, userId }
        });
        if (!existing) throw new Error('Rule not found');

        return prisma.guaranteeRule.update({
            where: { id: ruleId },
            data: {
                keyword: data.keyword !== undefined ? data.keyword : existing.keyword,
                action: data.action !== undefined ? data.action : existing.action,
                days: data.days !== undefined ? data.days : existing.days,
                isLifetime: data.isLifetime !== undefined ? data.isLifetime : existing.isLifetime,
                priority: data.priority !== undefined ? data.priority : existing.priority,
                panelId: data.panelId !== undefined ? data.panelId : existing.panelId,
                isActive: data.isActive !== undefined ? data.isActive : existing.isActive
            }
        });
    }

    /**
     * Delete a guarantee rule
     */
    async deleteRule(ruleId, userId) {
        const existing = await prisma.guaranteeRule.findFirst({
            where: { id: ruleId, userId }
        });
        if (!existing) throw new Error('Rule not found');

        return prisma.guaranteeRule.delete({ where: { id: ruleId } });
    }

    /**
     * Seed default rules for a user (called on first access)
     */
    async seedDefaultRules(userId) {
        const count = await prisma.guaranteeRule.count({ where: { userId } });
        if (count > 0) return; // Already seeded

        const defaults = [
            // No guarantee keywords
            { keyword: 'No Refill', action: 'no_guarantee', priority: 10 },
            { keyword: 'No Guarantee', action: 'no_guarantee', priority: 10 },
            { keyword: 'Non Refill', action: 'no_guarantee', priority: 10 },
            { keyword: 'Without Guarantee', action: 'no_guarantee', priority: 10 },
            // Guarantee keywords
            { keyword: '7 Days ♻️', action: 'guarantee', days: 7, priority: 50 },
            { keyword: '15 Days ♻️', action: 'guarantee', days: 15, priority: 50 },
            { keyword: '20 Days ♻️', action: 'guarantee', days: 20, priority: 50 },
            { keyword: '30 Days ♻️', action: 'guarantee', days: 30, priority: 50 },
            { keyword: '60 Days ♻️', action: 'guarantee', days: 60, priority: 50 },
            { keyword: '90 Days ♻️', action: 'guarantee', days: 90, priority: 50 },
            { keyword: '365 Days ♻️', action: 'guarantee', days: 365, priority: 50 },
            { keyword: 'Lifetime ♻️', action: 'guarantee', days: null, isLifetime: true, priority: 50 },
        ];

        for (const d of defaults) {
            await prisma.guaranteeRule.create({
                data: {
                    userId,
                    keyword: d.keyword,
                    action: d.action,
                    days: d.days || null,
                    isLifetime: d.isLifetime || false,
                    priority: d.priority,
                    isActive: true
                }
            });
        }
    }

    /**
     * Check guarantee using RULES first, then fall back to existing pattern logic
     * This is a NEW method — does NOT replace checkGuarantee
     * @param {string} serviceName
     * @param {string} userId
     * @param {string|null} panelId
     * @returns {Object} { hasGuarantee, days, isLifetime, matchedRule }
     */
    async checkGuaranteeByRules(serviceName, userId, panelId = null) {
        if (!serviceName) return { hasGuarantee: null, days: null };

        // Get active rules for this user + panel
        const rules = await prisma.guaranteeRule.findMany({
            where: {
                userId,
                isActive: true,
                OR: [
                    { panelId: null },   // Global
                    ...(panelId ? [{ panelId }] : [])
                ]
            },
            orderBy: [{ priority: 'asc' }]
        });

        const lowerName = serviceName.toLowerCase();

        for (const rule of rules) {
            if (lowerName.includes(rule.keyword.toLowerCase())) {
                if (rule.action === 'no_guarantee') {
                    return {
                        hasGuarantee: false,
                        days: null,
                        isLifetime: false,
                        matchedRule: rule.keyword,
                        source: 'rule'
                    };
                } else {
                    return {
                        hasGuarantee: true,
                        days: rule.isLifetime ? 99999 : rule.days,
                        isLifetime: rule.isLifetime,
                        matchedRule: rule.keyword,
                        source: 'rule'
                    };
                }
            }
        }

        // No rule matched — fall back to existing pattern-based detection
        const config = await this.getConfig(userId);
        const days = this.extractGuaranteeDays(serviceName, config);
        return {
            hasGuarantee: days !== null,
            days,
            isLifetime: false,
            matchedRule: null,
            source: days !== null ? 'pattern' : null
        };
    }
}

module.exports = new GuaranteeService();
