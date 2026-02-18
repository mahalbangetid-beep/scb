/**
 * Marketing Service
 * 
 * Handles Section 6 marketing features:
 * - 6.1 Auto ID Numbering
 * - 6.2 Watermark Templates
 * - 6.3 Campaign Features (dedup, country code normalization)
 * - 6.4 Group Messaging
 * - 6.5 Charge Categories
 */

const prisma = require('../utils/prisma');

class MarketingService {

    // ==================== 6.0 MARKETING CONFIG ====================

    /**
     * Get or create marketing config for a user
     */
    async getConfig(userId) {
        let config = await prisma.marketingConfig.findUnique({
            where: { userId }
        });

        if (!config) {
            config = await prisma.marketingConfig.create({
                data: {
                    userId,
                    autoIdEnabled: true,   // Enabled by default per bug4.md
                    autoIdPrefix: '',
                    autoIdCounter: 1,
                    watermarkEnabled: false,
                    watermarkTemplates: [],
                    removeDuplicates: true,
                    ownDeviceRate: 1,
                    systemBotRate: 1,
                    telegramRate: 1
                }
            });
        }

        return config;
    }

    /**
     * Update marketing config
     */
    async updateConfig(userId, updates) {
        // Ensure config exists
        await this.getConfig(userId);

        const allowedFields = [
            'autoIdEnabled', 'autoIdPrefix', 'autoIdCounter',
            'watermarkEnabled', 'defaultWatermark', 'watermarkTemplates',
            'removeDuplicates', 'countryCode',
            'ownDeviceRate', 'systemBotRate', 'telegramRate'
        ];

        const data = {};
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                data[field] = updates[field];
            }
        }

        return await prisma.marketingConfig.update({
            where: { userId },
            data
        });
    }

    // ==================== 6.1 AUTO ID NUMBERING ====================

    /**
     * Get the next auto ID and increment counter
     * @param {string} userId
     * @returns {Object} { id, formattedId }
     */
    async getNextAutoId(userId) {
        const config = await this.getConfig(userId);

        if (!config.autoIdEnabled) {
            return { id: null, formattedId: null };
        }

        const currentId = config.autoIdCounter;
        const prefix = config.autoIdPrefix || '';
        const formattedId = `${prefix}${currentId}`;

        // Increment counter atomically
        await prisma.marketingConfig.update({
            where: { userId },
            data: { autoIdCounter: { increment: 1 } }
        });

        return { id: currentId, formattedId };
    }

    /**
     * Reset auto ID counter
     */
    async resetAutoIdCounter(userId, startFrom = 1) {
        await this.getConfig(userId);
        return await prisma.marketingConfig.update({
            where: { userId },
            data: { autoIdCounter: Math.max(1, startFrom) }
        });
    }

    /**
     * Compose message with auto ID appended
     * Format: message text + \nID: PREFIX123
     */
    composeMessageWithId(message, formattedId) {
        if (!formattedId) return message;
        return `${message}\nID: ${formattedId}`;
    }

    // ==================== 6.2 WATERMARK TEMPLATES ====================

    /**
     * Get watermark templates for a user
     */
    async getWatermarkTemplates(userId) {
        const config = await this.getConfig(userId);
        let templates = config.watermarkTemplates || [];
        if (typeof templates === 'string') {
            try { templates = JSON.parse(templates); } catch { templates = []; }
        }
        return Array.isArray(templates) ? templates : [];
    }

    /**
     * Save a watermark template
     */
    async saveWatermarkTemplate(userId, name, text) {
        const config = await this.getConfig(userId);
        let templates = config.watermarkTemplates || [];
        if (typeof templates === 'string') {
            try { templates = JSON.parse(templates); } catch { templates = []; }
        }
        if (!Array.isArray(templates)) templates = [];

        // Check for duplicate name
        const existingIdx = templates.findIndex(t => t.name === name);
        if (existingIdx >= 0) {
            templates[existingIdx] = { name, text };
        } else {
            templates.push({ name, text });
        }

        await prisma.marketingConfig.update({
            where: { userId },
            data: { watermarkTemplates: templates }
        });

        return templates;
    }

    /**
     * Delete a watermark template
     */
    async deleteWatermarkTemplate(userId, name) {
        const config = await this.getConfig(userId);
        let templates = config.watermarkTemplates || [];
        if (typeof templates === 'string') {
            try { templates = JSON.parse(templates); } catch { templates = []; }
        }
        if (!Array.isArray(templates)) templates = [];

        templates = templates.filter(t => t.name !== name);

        await prisma.marketingConfig.update({
            where: { userId },
            data: { watermarkTemplates: templates }
        });

        return templates;
    }

    /**
     * Compose message with watermark appended
     * Format: message + \n\n--- watermark text ---
     */
    composeMessageWithWatermark(message, watermarkText) {
        if (!watermarkText) return message;
        return `${message}\n\n${watermarkText}`;
    }

    // ==================== 6.3 CAMPAIGN FEATURES ====================

    /**
     * Normalize phone number by removing country code
     * Supports: +62, 62, 0 prefixes (Indonesia), +1, 1
     * @param {string} phone
     * @param {string} countryCode - e.g. '62' for Indonesia
     * @returns {string} normalized number
     */
    normalizePhoneNumber(phone, countryCode = null) {
        if (!phone) return '';
        // Remove all non-digit characters
        let normalized = phone.replace(/\D/g, '');

        if (countryCode) {
            // Remove country code prefix
            if (normalized.startsWith(countryCode)) {
                normalized = normalized.substring(countryCode.length);
            }
        }

        // Remove leading zeros
        normalized = normalized.replace(/^0+/, '');

        return normalized;
    }

    /**
     * Remove duplicate phone numbers from a list
     * Uses country code normalization for matching
     * @param {string[]} numbers
     * @param {string} countryCode
     * @returns {Object} { unique, removed, duplicateCount }
     */
    removeDuplicateNumbers(numbers, countryCode = null) {
        if (!Array.isArray(numbers)) return { unique: [], removed: [], duplicateCount: 0 };

        const seen = new Map(); // normalized -> original
        const unique = [];
        const removed = [];

        for (const num of numbers) {
            const normalized = this.normalizePhoneNumber(num, countryCode);
            if (!normalized) continue;

            if (seen.has(normalized)) {
                removed.push(num);
            } else {
                seen.set(normalized, num);
                unique.push(num);
            }
        }

        return {
            unique,
            removed,
            duplicateCount: removed.length,
            originalCount: numbers.length,
            uniqueCount: unique.length
        };
    }

    /**
     * Get campaign report
     * @param {string} broadcastId
     * @param {string} userId
     */
    async getCampaignReport(broadcastId, userId) {
        const broadcast = await prisma.broadcast.findFirst({
            where: { id: broadcastId, device: { userId } },
            include: {
                device: { select: { id: true, name: true, phone: true } },
                _count: { select: { recipients: true } }
            }
        });

        if (!broadcast) return null;

        const [sentCount, failedCount, pendingCount] = await Promise.all([
            prisma.broadcastRecipient.count({
                where: { broadcastId, status: 'sent' }
            }),
            prisma.broadcastRecipient.count({
                where: { broadcastId, status: 'failed' }
            }),
            prisma.broadcastRecipient.count({
                where: { broadcastId, status: 'pending' }
            })
        ]);

        return {
            id: broadcast.id,
            name: broadcast.name,
            status: broadcast.status,
            device: broadcast.device,
            totalRecipients: broadcast.totalRecipients,
            sent: sentCount,
            failed: failedCount,
            remaining: pendingCount,
            chargeCategory: broadcast.chargeCategory,
            broadcastType: broadcast.broadcastType,
            autoIdEnabled: broadcast.autoIdEnabled,
            watermarkText: broadcast.watermarkText,
            createdAt: broadcast.createdAt,
            startedAt: broadcast.startedAt,
            completedAt: broadcast.completedAt
        };
    }

    // ==================== 6.2 FINAL MESSAGE COMPOSITION ====================

    /**
     * Compose final message: Message + Watermark + Auto Generated ID
     * As specified in bug4.md section 6.2:
     * "Final message format: Message + Watermark + Auto Generated ID + Images (if available)"
     * 
     * @param {string} userId
     * @param {string} baseMessage
     * @param {Object} options
     * @param {string} options.watermarkText - Override watermark text
     * @param {boolean} options.preview - If true, don't increment auto ID counter (BUG #7 fix)
     */
    async composeFinalMessage(userId, baseMessage, options = {}) {
        const config = await this.getConfig(userId);
        let finalMessage = baseMessage;

        // Step 1: Add watermark (if enabled)
        if (options.watermarkText || (config.watermarkEnabled && config.defaultWatermark)) {
            const watermark = options.watermarkText || config.defaultWatermark;
            finalMessage = this.composeMessageWithWatermark(finalMessage, watermark);
        }

        // Step 2: Add auto ID (if enabled)
        if (config.autoIdEnabled) {
            if (options.preview) {
                // Preview mode: show current counter without incrementing
                const prefix = config.autoIdPrefix || '';
                const formattedId = `${prefix}${config.autoIdCounter}`;
                finalMessage = this.composeMessageWithId(finalMessage, formattedId);
            } else {
                // Real mode: increment counter permanently
                const { formattedId } = await this.getNextAutoId(userId);
                finalMessage = this.composeMessageWithId(finalMessage, formattedId);
            }
        }

        return finalMessage;
    }

    // ==================== 6.4 GROUP MESSAGING ====================

    /**
     * Get groups for a device
     * Attempts to fetch live groups from WhatsApp session first,
     * falls back to cached groups from MarketingInterval records.
     * bug4.md requires "One-click select all groups"
     */
    async getDeviceGroups(deviceId, userId, whatsappService = null) {
        // Verify device ownership
        const device = await prisma.device.findFirst({
            where: { id: deviceId, userId },
            select: { id: true, name: true, phone: true, status: true }
        });

        if (!device) return [];

        // Try live WhatsApp groups first (BUG #5 fix)
        if (whatsappService || global.whatsappService) {
            try {
                const wa = whatsappService || global.whatsappService;
                const socket = wa.getSession ? wa.getSession(deviceId) : null;
                if (socket && typeof socket.groupFetchAllParticipating === 'function') {
                    const groups = await socket.groupFetchAllParticipating();
                    return Object.values(groups).map(g => ({
                        groupJid: g.id,
                        groupName: g.subject || g.id
                    }));
                }
            } catch (e) {
                console.warn(`[Marketing] Failed to fetch live groups for ${deviceId}:`, e.message);
            }
        }

        // Fallback: get groups from marketing intervals (cached group data)
        const intervals = await prisma.marketingInterval.findMany({
            where: { deviceId, userId },
            select: { groupJid: true, groupName: true }
        });

        return intervals.map(i => ({
            groupJid: i.groupJid,
            groupName: i.groupName || i.groupJid
        }));
    }

    // ==================== 6.5 CHARGE CATEGORIES ====================

    /**
     * Get charge rate for a specific category
     * @param {string} userId
     * @param {string} category - own_device, system_bot, telegram
     * @returns {number} credits per message
     */
    async getChargeRate(userId, category = 'own_device') {
        const config = await this.getConfig(userId);

        switch (category) {
            case 'system_bot': return config.systemBotRate;
            case 'telegram': return config.telegramRate;
            case 'own_device':
            default: return config.ownDeviceRate;
        }
    }
}

module.exports = new MarketingService();
