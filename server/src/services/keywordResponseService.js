/**
 * Keyword Response Service
 * 
 * Service for managing keyword-based auto-replies
 * From clientupdate2.md: "Create a separate section where keywords define replies"
 * 
 * Features:
 * - Multiple match types (EXACT, CONTAINS, STARTS_WITH, ENDS_WITH, REGEX)
 * - Priority-based matching
 * - Optional trigger actions (forward to admin, create ticket, etc.)
 * - Platform targeting (WhatsApp, Telegram, or both)
 */

const prisma = require('../utils/prisma');

class KeywordResponseService {
    constructor() {
        this.matchTypes = ['EXACT', 'CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'REGEX'];
        this.triggerActions = ['NONE', 'FORWARD_TO_ADMIN', 'CREATE_TICKET', 'TRIGGER_WEBHOOK', 'BLOCK_USER'];
        this.platforms = ['ALL', 'WHATSAPP', 'TELEGRAM'];
    }

    /**
     * Get all keyword responses for a user
     * @param {string} userId - User ID
     * @param {Object} options - { deviceId, platform, isActive }
     * @returns {Array} Keyword responses
     */
    async getAll(userId, options = {}) {
        const where = { userId };

        if (options.deviceId) {
            where.OR = [
                { deviceId: options.deviceId },
                { deviceId: null }
            ];
        }

        if (options.platform) {
            where.OR = [
                ...(where.OR || []),
                { platform: options.platform },
                { platform: 'ALL' }
            ];
        }

        if (options.isActive !== undefined) {
            where.isActive = options.isActive;
        }

        return prisma.keywordResponse.findMany({
            where,
            orderBy: [
                { priority: 'desc' },
                { createdAt: 'desc' }
            ]
        });
    }

    /**
     * Get a single keyword response by ID
     */
    async getById(id, userId) {
        return prisma.keywordResponse.findFirst({
            where: { id, userId }
        });
    }

    /**
     * Create a new keyword response
     */
    async create(userId, data) {
        // Validate match type
        if (!this.matchTypes.includes(data.matchType || 'CONTAINS')) {
            throw new Error(`Invalid match type. Must be one of: ${this.matchTypes.join(', ')}`);
        }

        // Validate regex if applicable
        if (data.matchType === 'REGEX') {
            try {
                new RegExp(data.keyword);
            } catch (e) {
                throw new Error(`Invalid regex pattern: ${data.keyword}`);
            }
        }

        // Validate trigger action
        if (data.triggerAction && !this.triggerActions.includes(data.triggerAction)) {
            throw new Error(`Invalid trigger action. Must be one of: ${this.triggerActions.join(', ')}`);
        }

        // Validate platform
        if (data.platform && !this.platforms.includes(data.platform)) {
            throw new Error(`Invalid platform. Must be one of: ${this.platforms.join(', ')}`);
        }

        return prisma.keywordResponse.create({
            data: {
                userId,
                keyword: data.keyword,
                matchType: data.matchType || 'CONTAINS',
                caseSensitive: data.caseSensitive || false,
                responseText: data.responseText,
                responseMedia: data.responseMedia || null,
                triggerAction: data.triggerAction || 'NONE',
                actionConfig: data.actionConfig ? JSON.stringify(data.actionConfig) : '{}',
                deviceId: data.deviceId || null,
                platform: data.platform || 'ALL',
                applyToGroups: data.applyToGroups !== false,
                applyToDMs: data.applyToDMs !== false,
                priority: data.priority || 0,
                isActive: data.isActive !== false
            }
        });
    }

    /**
     * Update a keyword response
     */
    async update(id, userId, data) {
        // Check ownership
        const existing = await this.getById(id, userId);
        if (!existing) {
            throw new Error('Keyword response not found');
        }

        // Validate if provided
        if (data.matchType && !this.matchTypes.includes(data.matchType)) {
            throw new Error(`Invalid match type`);
        }

        if (data.matchType === 'REGEX' || (existing.matchType === 'REGEX' && data.keyword)) {
            try {
                new RegExp(data.keyword || existing.keyword);
            } catch (e) {
                throw new Error(`Invalid regex pattern`);
            }
        }

        const updateData = {};
        const allowedFields = [
            'keyword', 'matchType', 'caseSensitive', 'responseText', 'responseMedia',
            'triggerAction', 'deviceId', 'platform', 'applyToGroups', 'applyToDMs',
            'priority', 'isActive'
        ];

        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                updateData[field] = data[field];
            }
        }

        if (data.actionConfig !== undefined) {
            updateData.actionConfig = typeof data.actionConfig === 'string'
                ? data.actionConfig
                : JSON.stringify(data.actionConfig);
        }

        return prisma.keywordResponse.update({
            where: { id },
            data: updateData
        });
    }

    /**
     * Delete a keyword response
     */
    async delete(id, userId) {
        const existing = await this.getById(id, userId);
        if (!existing) {
            throw new Error('Keyword response not found');
        }

        return prisma.keywordResponse.delete({
            where: { id }
        });
    }

    /**
     * Toggle active status
     */
    async toggleActive(id, userId) {
        const existing = await this.getById(id, userId);
        if (!existing) {
            throw new Error('Keyword response not found');
        }

        return prisma.keywordResponse.update({
            where: { id },
            data: { isActive: !existing.isActive }
        });
    }

    /**
     * Find matching keyword response for a message
     * @param {string} userId - User ID
     * @param {string} message - Incoming message content
     * @param {Object} context - { deviceId, platform, isGroup }
     * @returns {Object|null} Matched keyword response or null
     */
    async findMatch(userId, message, context = {}) {
        const { deviceId, platform = 'WHATSAPP', isGroup = false } = context;

        // Get active responses for this context
        const responses = await prisma.keywordResponse.findMany({
            where: {
                userId,
                isActive: true,
                OR: [
                    { deviceId: deviceId },
                    { deviceId: null }
                ]
            },
            orderBy: { priority: 'desc' }
        });

        // Filter by platform and group/DM settings
        const filtered = responses.filter(r => {
            // Check platform
            if (r.platform !== 'ALL' && r.platform !== platform) {
                return false;
            }

            // Check group/DM
            if (isGroup && !r.applyToGroups) return false;
            if (!isGroup && !r.applyToDMs) return false;

            return true;
        });

        // Find first match
        for (const response of filtered) {
            if (this.matchKeyword(message, response)) {
                // Increment trigger count
                await prisma.keywordResponse.update({
                    where: { id: response.id },
                    data: {
                        triggerCount: { increment: 1 },
                        lastTriggeredAt: new Date()
                    }
                });

                return response;
            }
        }

        return null;
    }

    /**
     * Check if message matches keyword rule
     * @param {string} message - Message to check
     * @param {Object} rule - Keyword response rule
     * @returns {boolean}
     */
    matchKeyword(message, rule) {
        const keyword = rule.caseSensitive ? rule.keyword : rule.keyword.toLowerCase();
        const content = rule.caseSensitive ? message : message.toLowerCase();

        switch (rule.matchType) {
            case 'EXACT':
                return content === keyword;

            case 'CONTAINS':
                return content.includes(keyword);

            case 'STARTS_WITH':
                return content.startsWith(keyword);

            case 'ENDS_WITH':
                return content.endsWith(keyword);

            case 'REGEX':
                try {
                    const regex = new RegExp(rule.keyword, rule.caseSensitive ? '' : 'i');
                    return regex.test(message);
                } catch {
                    return false;
                }

            default:
                return content.includes(keyword);
        }
    }

    /**
     * Execute trigger action for matched response
     * @param {Object} response - Matched keyword response
     * @param {Object} context - { senderNumber, message, deviceId }
     * @returns {Object} Action result
     */
    async executeTriggerAction(response, context) {
        const action = response.triggerAction;
        if (!action || action === 'NONE') {
            return { executed: false };
        }

        let config = {};
        try {
            config = JSON.parse(response.actionConfig || '{}');
        } catch {
            config = {};
        }

        switch (action) {
            case 'FORWARD_TO_ADMIN':
                return this.forwardToAdmin(response, context, config);

            case 'CREATE_TICKET':
                return this.createTicket(response, context, config);

            case 'TRIGGER_WEBHOOK':
                return this.triggerWebhook(response, context, config);

            case 'BLOCK_USER':
                return this.blockUser(response, context, config);

            default:
                return { executed: false, reason: 'Unknown action' };
        }
    }

    // Action implementations
    async forwardToAdmin(response, context, config) {
        // Implementation would forward message to admin phone
        console.log('[KeywordResponse] Forward to admin:', config.adminPhone || 'not configured');
        return { executed: true, action: 'FORWARD_TO_ADMIN' };
    }

    async createTicket(response, context, config) {
        // Implementation would create support ticket
        console.log('[KeywordResponse] Create ticket for:', context.senderNumber);
        return { executed: true, action: 'CREATE_TICKET' };
    }

    async triggerWebhook(response, context, config) {
        if (!config.webhookUrl) {
            return { executed: false, reason: 'Webhook URL not configured' };
        }

        try {
            const { safeFetch } = require('../utils/safeFetch');
            await safeFetch(config.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword: response.keyword,
                    message: context.message,
                    sender: context.senderNumber,
                    timestamp: new Date().toISOString()
                })
            });
            return { executed: true, action: 'TRIGGER_WEBHOOK' };
        } catch (error) {
            return { executed: false, action: 'TRIGGER_WEBHOOK', error: error.message };
        }
    }

    async blockUser(response, context, config) {
        // Implementation would add user to block list
        console.log('[KeywordResponse] Block user:', context.senderNumber);
        return { executed: true, action: 'BLOCK_USER' };
    }

    /**
     * Get statistics for keyword responses
     */
    async getStats(userId) {
        const [total, active, topTriggered] = await Promise.all([
            prisma.keywordResponse.count({ where: { userId } }),
            prisma.keywordResponse.count({ where: { userId, isActive: true } }),
            prisma.keywordResponse.findMany({
                where: { userId, triggerCount: { gt: 0 } },
                orderBy: { triggerCount: 'desc' },
                take: 5,
                select: {
                    id: true,
                    keyword: true,
                    triggerCount: true,
                    lastTriggeredAt: true
                }
            })
        ]);

        return { total, active, inactive: total - active, topTriggered };
    }
}

module.exports = new KeywordResponseService();
