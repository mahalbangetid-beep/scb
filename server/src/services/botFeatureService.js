/**
 * Bot Feature Service
 * 
 * Service for managing bot feature toggles
 * Phase 4: Rule-Based Bot Control
 * 
 * Each user can configure which bot features are enabled/disabled
 * High-risk features are disabled by default and require explicit opt-in
 */

const prisma = require('../utils/prisma');

class BotFeatureService {
    constructor() {
        // Default settings for new users
        this.defaultSettings = {
            // High-risk rules (all disabled by default)
            autoHandleFailedOrders: false,
            failedOrderAction: 'NOTIFY',
            allowForceCompleted: false,
            allowLinkUpdateViaBot: false,
            allowPaymentVerification: false,
            allowAccountDetailsViaBot: false,
            allowTicketAutoReply: false,

            // Command toggles (all enabled by default)
            allowRefillCommand: true,
            allowCancelCommand: true,
            allowSpeedUpCommand: true,
            allowStatusCommand: true,

            // Processing status rules
            processingSpeedUpEnabled: true,
            processingCancelEnabled: false,
            autoForwardProcessingCancel: false,

            // Provider command templates
            providerSpeedUpTemplate: '{speed}',
            providerRefillTemplate: '{refill}',
            providerCancelTemplate: '{cancel}',

            // Response settings
            bulkResponseThreshold: 5,
            maxBulkOrders: 100,
            showProviderInResponse: false,
            showDetailedStatus: false
        };
    }

    /**
     * Get feature toggles for a user
     * Creates default settings if none exist
     * @param {string} userId - User ID
     * @returns {Object} Feature toggles
     */
    async getToggles(userId) {
        if (!userId) {
            throw new Error('User ID is required');
        }

        let toggles = await prisma.botFeatureToggles.findUnique({
            where: { userId }
        });

        // Create default settings if none exist
        if (!toggles) {
            toggles = await prisma.botFeatureToggles.create({
                data: {
                    userId,
                    ...this.defaultSettings
                }
            });
        }

        return toggles;
    }

    /**
     * Update feature toggles for a user
     * @param {string} userId - User ID
     * @param {Object} updates - Partial updates
     * @returns {Object} Updated toggles
     */
    async updateToggles(userId, updates) {
        if (!userId) {
            throw new Error('User ID is required');
        }

        // Make sure user has toggles record first
        await this.getToggles(userId);

        // Filter out invalid fields
        const validFields = Object.keys(this.defaultSettings);
        const filteredUpdates = {};

        for (const [key, value] of Object.entries(updates)) {
            if (validFields.includes(key)) {
                filteredUpdates[key] = value;
            }
        }

        const toggles = await prisma.botFeatureToggles.update({
            where: { userId },
            data: filteredUpdates
        });

        return toggles;
    }

    /**
     * Check if a specific command is allowed
     * @param {string} userId - User ID
     * @param {string} command - Command type (REFILL, CANCEL, SPEEDUP, STATUS)
     * @returns {boolean} Whether command is allowed
     */
    async isCommandAllowed(userId, command) {
        const toggles = await this.getToggles(userId);

        const commandMap = {
            'REFILL': toggles.allowRefillCommand,
            'CANCEL': toggles.allowCancelCommand,
            'SPEEDUP': toggles.allowSpeedUpCommand,
            'SPEED_UP': toggles.allowSpeedUpCommand,
            'STATUS': toggles.allowStatusCommand
        };

        const commandUpper = command.toUpperCase();
        return commandMap[commandUpper] ?? true; // Default to allowed if unknown
    }

    /**
     * Check if a feature is enabled
     * @param {string} userId - User ID
     * @param {string} feature - Feature name
     * @returns {boolean} Whether feature is enabled
     */
    async isFeatureEnabled(userId, feature) {
        const toggles = await this.getToggles(userId);
        return toggles[feature] ?? false;
    }

    /**
     * Get provider command template
     * @param {string} userId - User ID
     * @param {string} command - Command type
     * @returns {string} Template string
     */
    async getProviderTemplate(userId, command) {
        const toggles = await this.getToggles(userId);

        const templateMap = {
            'REFILL': toggles.providerRefillTemplate,
            'CANCEL': toggles.providerCancelTemplate,
            'SPEEDUP': toggles.providerSpeedUpTemplate,
            'SPEED_UP': toggles.providerSpeedUpTemplate
        };

        return templateMap[command.toUpperCase()] || `{${command.toLowerCase()}}`;
    }

    /**
     * Check if processing status action is allowed
     * @param {string} userId - User ID
     * @param {string} action - speedup or cancel
     * @returns {Object} { allowed, autoForward }
     */
    async checkProcessingAction(userId, action) {
        const toggles = await this.getToggles(userId);

        if (action.toUpperCase() === 'SPEEDUP' || action.toUpperCase() === 'SPEED_UP') {
            return {
                allowed: toggles.processingSpeedUpEnabled,
                autoForward: true
            };
        }

        if (action.toUpperCase() === 'CANCEL') {
            return {
                allowed: toggles.processingCancelEnabled,
                autoForward: toggles.autoForwardProcessingCancel
            };
        }

        return { allowed: false, autoForward: false };
    }

    /**
     * Get bulk response settings
     * @param {string} userId - User ID
     * @returns {Object} { threshold, maxOrders }
     */
    async getBulkSettings(userId) {
        const toggles = await this.getToggles(userId);
        return {
            threshold: toggles.bulkResponseThreshold,
            maxOrders: toggles.maxBulkOrders
        };
    }

    /**
     * Reset toggles to default
     * @param {string} userId - User ID
     * @returns {Object} Reset toggles
     */
    async resetToDefaults(userId) {
        await this.getToggles(userId); // Ensure exists

        return prisma.botFeatureToggles.update({
            where: { userId },
            data: this.defaultSettings
        });
    }

    /**
     * Get high-risk features status
     * Returns which dangerous features are enabled
     * @param {string} userId - User ID
     * @returns {Object[]} List of enabled high-risk features
     */
    async getHighRiskStatus(userId) {
        const toggles = await this.getToggles(userId);

        const highRiskFeatures = [
            { key: 'autoHandleFailedOrders', label: 'Auto Handle Failed Orders', danger: 'medium' },
            { key: 'allowForceCompleted', label: 'Force Order Completed', danger: 'high' },
            { key: 'allowLinkUpdateViaBot', label: 'Order Link Update via Bot', danger: 'medium' },
            { key: 'allowPaymentVerification', label: 'Payment Verification via Bot', danger: 'low' },
            { key: 'allowAccountDetailsViaBot', label: 'Account Details via Bot', danger: 'low' },
            { key: 'allowTicketAutoReply', label: 'Ticket Auto-Reply', danger: 'medium' }
        ];

        return highRiskFeatures.map(feature => ({
            ...feature,
            enabled: toggles[feature.key]
        }));
    }
}

module.exports = new BotFeatureService();
