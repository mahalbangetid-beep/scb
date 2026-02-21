/**
 * Bot Feature Service
 * 
 * Service for managing bot feature toggles
 * Phase 4: Rule-Based Bot Control
 * 
 * Each user can configure which bot features are enabled/disabled.
 * Supports per-device and per-panel scoping with fallback chain:
 *   device+panel → panel only → device only → user default
 * 
 * High-risk features are disabled by default and require explicit opt-in
 * 
 * NOTE: Prisma doesn't support null in composite unique findUnique/upsert,
 * so we use findFirst + manual create/update pattern throughout.
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
            showDetailedStatus: false,

            // Reply to all messages
            replyToAllMessages: false,
            fallbackMessage: null,

            // Call response (1.2 / 1.3)
            callAutoReplyEnabled: true,
            callReplyMessage: null,
            groupCallReplyMessage: null,
            repeatedCallReplyMessage: null,
            repeatedCallThreshold: 3,
            repeatedCallWindowMinutes: 5,

            // Spam protection (1.4)
            spamProtectionEnabled: true,
            spamWarningMessage: null,
            spamRepeatThreshold: 3,
            spamTimeWindowMinutes: 5,
            spamDisableDurationMin: 60,

            // Mass/Bulk templates (Section 18)
            massCommandReplyTemplate: null,
            massForwardingTemplate: null,
            massSupportReplyTemplate: null,

            // Support contact (3.1)
            supportContactNumber: null,

            // Registration messages (3.2)
            registrationPromptMsg: null,
            registrationSuccessMsg: null,
            registrationNotFoundMsg: null,
            registrationAlreadyLinkedMsg: null
        };

        // Fields that should NOT be inherited from parent scope
        this.scopeFields = ['deviceId', 'panelId', 'id', 'userId', 'createdAt', 'updatedAt'];
    }

    /**
     * Build a findFirst-compatible where clause for scoped lookups.
     * Prisma doesn't support null in composite unique findUnique,
     * so we use findFirst with explicit null checks instead.
     * 
     * @param {string} userId
     * @param {string|null} deviceId
     * @param {string|null} panelId
     * @returns {Object} Where clause for prisma.findFirst
     */
    _buildWhere(userId, deviceId = null, panelId = null) {
        const where = { userId };

        // Explicitly handle null vs value for each scope field
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
     * Find a scoped toggle record
     */
    async _findScoped(userId, deviceId = null, panelId = null) {
        return prisma.botFeatureToggles.findFirst({
            where: this._buildWhere(userId, deviceId, panelId)
        });
    }

    /**
     * Merge a scoped toggle with its parent, preferring scoped values for non-default fields
     */
    _mergeToggles(parentToggles, scopedToggles) {
        if (!scopedToggles) return parentToggles;
        if (!parentToggles) return scopedToggles;

        const merged = { ...parentToggles };
        for (const [key, value] of Object.entries(scopedToggles)) {
            if (!this.scopeFields.includes(key) && value !== null && value !== undefined) {
                merged[key] = value;
            }
        }
        merged.id = scopedToggles.id;
        merged.deviceId = scopedToggles.deviceId;
        merged.panelId = scopedToggles.panelId;
        return merged;
    }

    /**
     * Get feature toggles with fallback chain:
     *   device+panel → panel only → device only → user default
     * 
     * @param {string} userId - User ID
     * @param {Object} scope - Optional { deviceId, panelId }
     * @returns {Object} Resolved feature toggles
     */
    async getToggles(userId, scope = {}) {
        if (!userId) {
            throw new Error('User ID is required');
        }

        const { deviceId = null, panelId = null } = scope;

        // Always get user default first (deviceId=null, panelId=null)
        let userDefault = await this._findScoped(userId, null, null);

        // Create user default if none exists
        if (!userDefault) {
            userDefault = await prisma.botFeatureToggles.create({
                data: {
                    userId,
                    deviceId: null,
                    panelId: null,
                    ...this.defaultSettings
                }
            });
        }

        // If no scope requested, return user default
        if (!deviceId && !panelId) {
            return userDefault;
        }

        // Build fallback chain: device+panel → panel → device → user default
        const candidates = [];

        // Try device+panel specific (most specific)
        if (deviceId && panelId) {
            const specific = await this._findScoped(userId, deviceId, panelId);
            if (specific) candidates.push(specific);
        }

        // Try panel-only
        if (panelId) {
            const panelOnly = await this._findScoped(userId, null, panelId);
            if (panelOnly) candidates.push(panelOnly);
        }

        // Try device-only
        if (deviceId) {
            const deviceOnly = await this._findScoped(userId, deviceId, null);
            if (deviceOnly) candidates.push(deviceOnly);
        }

        // If no scoped config found, return user default with requested scope info
        if (candidates.length === 0) {
            return { ...userDefault, _resolvedFrom: 'user_default', _requestedDeviceId: deviceId, _requestedPanelId: panelId };
        }

        // Most specific match wins (first candidate)
        const resolved = this._mergeToggles(userDefault, candidates[0]);
        resolved._resolvedFrom = candidates[0].deviceId && candidates[0].panelId
            ? 'device_panel'
            : candidates[0].panelId ? 'panel' : 'device';
        return resolved;
    }

    /**
     * Update feature toggles for a specific scope
     * Uses find + create/update pattern (Prisma doesn't support null in upsert composite keys)
     */
    async updateToggles(userId, updates, scope = {}) {
        if (!userId) {
            throw new Error('User ID is required');
        }

        const { deviceId = null, panelId = null } = scope;

        // Filter out invalid fields
        const validFields = Object.keys(this.defaultSettings);
        const filteredUpdates = {};

        for (const [key, value] of Object.entries(updates)) {
            if (validFields.includes(key)) {
                filteredUpdates[key] = value;
            }
        }

        // Find existing record
        const existing = await this._findScoped(userId, deviceId, panelId);

        if (existing) {
            // Update existing
            return prisma.botFeatureToggles.update({
                where: { id: existing.id },
                data: filteredUpdates
            });
        } else {
            // Create new
            return prisma.botFeatureToggles.create({
                data: {
                    userId,
                    deviceId: deviceId || null,
                    panelId: panelId || null,
                    ...this.defaultSettings,
                    ...filteredUpdates
                }
            });
        }
    }

    /**
     * Get all scoped configs for a user (for listing in UI)
     */
    async getAllScopes(userId) {
        const allToggles = await prisma.botFeatureToggles.findMany({
            where: { userId },
            include: {
                device: { select: { id: true, name: true, phone: true } },
                panel: { select: { id: true, name: true, alias: true } }
            },
            orderBy: { createdAt: 'asc' }
        });

        return allToggles.map(t => ({
            ...t,
            scopeType: !t.deviceId && !t.panelId ? 'default'
                : t.deviceId && t.panelId ? 'device_panel'
                    : t.deviceId ? 'device' : 'panel'
        }));
    }

    /**
     * Delete a scoped config (reverts to parent fallback)
     * Cannot delete user default (deviceId=null, panelId=null)
     */
    async deleteScope(userId, toggleId) {
        const toggle = await prisma.botFeatureToggles.findFirst({
            where: { id: toggleId, userId }
        });

        if (!toggle) {
            throw new Error('Toggle config not found');
        }

        if (!toggle.deviceId && !toggle.panelId) {
            throw new Error('Cannot delete default user config. Use reset instead.');
        }

        await prisma.botFeatureToggles.delete({
            where: { id: toggleId }
        });

        return { deleted: true };
    }

    /**
     * Check if a specific command is allowed
     */
    async isCommandAllowed(userId, command, scope = {}) {
        const toggles = await this.getToggles(userId, scope);

        const commandMap = {
            'REFILL': toggles.allowRefillCommand,
            'CANCEL': toggles.allowCancelCommand,
            'SPEEDUP': toggles.allowSpeedUpCommand,
            'SPEED_UP': toggles.allowSpeedUpCommand,
            'STATUS': toggles.allowStatusCommand
        };

        const commandUpper = command.toUpperCase();
        return commandMap[commandUpper] ?? true;
    }

    /**
     * Check if a user command (verify, account) is allowed
     */
    async isUserCommandAllowed(userId, command, scope = {}) {
        const toggles = await this.getToggles(userId, scope);

        const commandMap = {
            'verify': toggles.allowPaymentVerification,
            'account': toggles.allowAccountDetailsViaBot
        };

        const commandLower = command.toLowerCase();
        return commandMap[commandLower] ?? false;
    }

    /**
     * Check if a feature is enabled
     */
    async isFeatureEnabled(userId, feature, scope = {}) {
        const toggles = await this.getToggles(userId, scope);
        return toggles[feature] ?? false;
    }

    /**
     * Get provider command template
     */
    async getProviderTemplate(userId, command, scope = {}) {
        const toggles = await this.getToggles(userId, scope);

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
     */
    async checkProcessingAction(userId, action, scope = {}) {
        const toggles = await this.getToggles(userId, scope);

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
     */
    async getBulkSettings(userId, scope = {}) {
        const toggles = await this.getToggles(userId, scope);
        return {
            threshold: toggles.bulkResponseThreshold,
            maxOrders: toggles.maxBulkOrders
        };
    }

    /**
     * Reset toggles to default for a specific scope
     */
    async resetToDefaults(userId, scope = {}) {
        const { deviceId = null, panelId = null } = scope;

        // Find existing record
        const existing = await this._findScoped(userId, deviceId, panelId);

        if (existing) {
            return prisma.botFeatureToggles.update({
                where: { id: existing.id },
                data: this.defaultSettings
            });
        } else {
            // Create with defaults
            return prisma.botFeatureToggles.create({
                data: {
                    userId,
                    deviceId: deviceId || null,
                    panelId: panelId || null,
                    ...this.defaultSettings
                }
            });
        }
    }

    /**
     * Get high-risk features status
     */
    async getHighRiskStatus(userId, scope = {}) {
        const toggles = await this.getToggles(userId, scope);

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
