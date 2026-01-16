/**
 * High-Risk Features Service
 * 
 * Service for managing high-risk bot operations
 * Phase 4: Rule-Based Bot Control - High-Risk Features
 * 
 * ⚠️ WARNING: These features can cause irreversible changes
 * All actions are extensively logged and require explicit confirmation
 * 
 * Features:
 * - Force Order Completed
 * - Order Link Update via Bot
 * - Payment Verification via Bot
 * - User Account Details via Bot
 */

const prisma = require('../utils/prisma');

class HighRiskService {
    constructor() {
        // Feature definitions with risk levels
        this.features = {
            FORCE_COMPLETE: {
                name: 'Force Order Complete',
                risk: 'CRITICAL',
                description: 'Marks an order as completed without actual completion',
                requireConfirmation: true,
                cooldownMinutes: 5
            },
            UPDATE_ORDER_LINK: {
                name: 'Update Order Link',
                risk: 'HIGH',
                description: 'Changes the target link of an active order',
                requireConfirmation: true,
                cooldownMinutes: 1
            },
            VERIFY_PAYMENT: {
                name: 'Verify Payment via Bot',
                risk: 'HIGH',
                description: 'Confirms payment receipt through bot command',
                requireConfirmation: true,
                cooldownMinutes: 2
            },
            VIEW_USER_DETAILS: {
                name: 'View User Details',
                risk: 'MEDIUM',
                description: 'Retrieves user account information',
                requireConfirmation: false,
                cooldownMinutes: 0
            }
        };

        // Rate limit tracking
        this.cooldowns = new Map(); // key: `${userId}:${feature}` -> lastUsed timestamp
    }

    /**
     * Check if a high-risk feature is enabled for user
     */
    async isFeatureEnabled(userId, featureKey) {
        // Check bot feature settings
        const botFeatureService = require('./botFeatureService');
        const settings = await botFeatureService.getResolvedSettings(userId);

        // Map feature keys to bot settings
        const settingMap = {
            FORCE_COMPLETE: 'allowForceComplete',
            UPDATE_ORDER_LINK: 'allowLinkUpdate',
            VERIFY_PAYMENT: 'allowPaymentVerify',
            VIEW_USER_DETAILS: 'allowUserDetails'
        };

        const settingKey = settingMap[featureKey];
        return settings?.highRiskFeatures?.[settingKey] === true;
    }

    /**
     * Execute high-risk action with full logging
     */
    async executeAction(userId, featureKey, params, executorInfo) {
        const feature = this.features[featureKey];
        if (!feature) {
            throw new Error('Unknown feature');
        }

        // Check if enabled
        const enabled = await this.isFeatureEnabled(userId, featureKey);
        if (!enabled) {
            throw new Error(`Feature "${feature.name}" is not enabled`);
        }

        // Check cooldown
        if (!this.checkCooldown(userId, featureKey)) {
            throw new Error(`Please wait before using "${feature.name}" again`);
        }

        // Log the action BEFORE execution
        const logId = await this.logAction(userId, featureKey, params, executorInfo, 'INITIATED');

        try {
            let result;

            switch (featureKey) {
                case 'FORCE_COMPLETE':
                    result = await this.forceCompleteOrder(userId, params);
                    break;
                case 'UPDATE_ORDER_LINK':
                    result = await this.updateOrderLink(userId, params);
                    break;
                case 'VERIFY_PAYMENT':
                    result = await this.verifyPayment(userId, params);
                    break;
                case 'VIEW_USER_DETAILS':
                    result = await this.getUserDetails(userId, params);
                    break;
                default:
                    throw new Error('Feature not implemented');
            }

            // Update log with success
            await this.updateLog(logId, 'SUCCESS', result);

            // Set cooldown
            this.setCooldown(userId, featureKey);

            return {
                success: true,
                feature: feature.name,
                result
            };
        } catch (error) {
            // Update log with failure
            await this.updateLog(logId, 'FAILED', { error: error.message });
            throw error;
        }
    }

    /**
     * Force complete an order
     * ⚠️ CRITICAL RISK
     */
    async forceCompleteOrder(userId, params) {
        const { orderId, reason } = params;

        if (!orderId) throw new Error('Order ID required');
        if (!reason) throw new Error('Reason required for force complete');

        const order = await prisma.order.findFirst({
            where: { id: orderId, userId }
        });

        if (!order) throw new Error('Order not found');

        // Update order
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'COMPLETED',
                completedAt: new Date(),
                internalNotes: `Force completed: ${reason}\nPrevious status: ${order.status}\nForced at: ${new Date().toISOString()}`
            }
        });

        return {
            orderId,
            previousStatus: order.status,
            newStatus: 'COMPLETED',
            reason
        };
    }

    /**
     * Update order link
     * ⚠️ HIGH RISK
     */
    async updateOrderLink(userId, params) {
        const { orderId, newLink, reason } = params;

        if (!orderId) throw new Error('Order ID required');
        if (!newLink) throw new Error('New link required');

        const order = await prisma.order.findFirst({
            where: { id: orderId, userId }
        });

        if (!order) throw new Error('Order not found');

        const oldLink = order.link;

        await prisma.order.update({
            where: { id: orderId },
            data: {
                link: newLink,
                internalNotes: `Link updated\nOld: ${oldLink}\nNew: ${newLink}\nReason: ${reason || 'Not specified'}\nUpdated at: ${new Date().toISOString()}`
            }
        });

        return {
            orderId,
            oldLink,
            newLink,
            reason
        };
    }

    /**
     * Verify payment via bot command
     * ⚠️ HIGH RISK
     */
    async verifyPayment(userId, params) {
        const { paymentId, amount, reference } = params;

        // Find pending payment
        const payment = await prisma.payment.findFirst({
            where: {
                userId,
                OR: [
                    { id: paymentId },
                    { reference }
                ],
                status: 'PENDING'
            }
        });

        if (!payment) throw new Error('Pending payment not found');

        // Verify and process payment
        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: 'COMPLETED',
                verifiedAt: new Date(),
                notes: `Verified via bot command at ${new Date().toISOString()}`
            }
        });

        // Add balance to user
        await prisma.user.update({
            where: { id: userId },
            data: {
                creditBalance: { increment: payment.amount }
            }
        });

        // Create transaction record
        await prisma.creditTransaction.create({
            data: {
                userId,
                type: 'CREDIT',
                amount: payment.amount,
                description: `Payment verified (Bot): ${payment.reference}`,
                reference: payment.reference,
                balanceAfter: 0 // Will be calculated
            }
        });

        return {
            paymentId: payment.id,
            amount: payment.amount,
            reference: payment.reference
        };
    }

    /**
     * Get user account details
     * ⚠️ MEDIUM RISK
     */
    async getUserDetails(userId, params) {
        const { username, phone } = params;

        if (!username && !phone) throw new Error('Username or phone required');

        // Find user mapping
        const userMappingService = require('./userMappingService');
        let mapping = null;

        if (username) {
            mapping = await userMappingService.findByUsername(userId, username);
        } else if (phone) {
            mapping = await userMappingService.findByPhone(userId, phone);
        }

        if (!mapping) throw new Error('User not found');

        // Get related stats
        const orderCount = await prisma.order.count({
            where: {
                userId,
                customerUsername: mapping.panelUsername
            }
        });

        return {
            username: mapping.panelUsername,
            email: mapping.panelEmail,
            isVerified: mapping.isVerified,
            isBotEnabled: mapping.isBotEnabled,
            isSuspended: mapping.isAutoSuspended,
            phones: mapping.whatsappNumbers,
            totalOrders: orderCount,
            lastActivity: mapping.lastMessageAt
        };
    }

    // ==================== LOGGING ====================

    /**
     * Log high-risk action
     */
    async logAction(userId, featureKey, params, executorInfo, status) {
        const feature = this.features[featureKey];

        const log = await prisma.activityLog.create({
            data: {
                userId,
                action: `HIGH_RISK_${featureKey}`,
                category: 'SECURITY',
                details: JSON.stringify({
                    feature: feature.name,
                    riskLevel: feature.risk,
                    params: this.sanitizeParams(params),
                    executor: executorInfo,
                    status,
                    timestamp: new Date().toISOString()
                }),
                ipAddress: executorInfo?.ip || 'bot'
            }
        });

        console.log(`[HighRisk] ${status}: ${feature.name} by user ${userId}`);

        return log.id;
    }

    /**
     * Update log entry
     */
    async updateLog(logId, status, result) {
        try {
            const log = await prisma.activityLog.findUnique({
                where: { id: logId }
            });

            if (log) {
                const details = JSON.parse(log.details || '{}');
                details.status = status;
                details.result = this.sanitizeParams(result);
                details.completedAt = new Date().toISOString();

                await prisma.activityLog.update({
                    where: { id: logId },
                    data: { details: JSON.stringify(details) }
                });
            }
        } catch (error) {
            console.error('[HighRisk] Failed to update log:', error.message);
        }
    }

    /**
     * Get action history
     */
    async getActionHistory(userId, options = {}) {
        const logs = await prisma.activityLog.findMany({
            where: {
                userId,
                action: { startsWith: 'HIGH_RISK_' }
            },
            orderBy: { createdAt: 'desc' },
            take: options.limit || 50
        });

        return logs.map(log => ({
            ...log,
            details: this.safeJSONParse(log.details, {})
        }));
    }

    // ==================== COOLDOWN ====================

    checkCooldown(userId, featureKey) {
        const key = `${userId}:${featureKey}`;
        const lastUsed = this.cooldowns.get(key);
        const cooldownMs = (this.features[featureKey]?.cooldownMinutes || 0) * 60 * 1000;

        if (!lastUsed || !cooldownMs) return true;
        return Date.now() - lastUsed > cooldownMs;
    }

    setCooldown(userId, featureKey) {
        const key = `${userId}:${featureKey}`;
        this.cooldowns.set(key, Date.now());
    }

    // ==================== HELPERS ====================

    sanitizeParams(params) {
        if (!params) return {};
        // Remove sensitive fields
        const { password, apiKey, token, ...safe } = params;
        return safe;
    }

    safeJSONParse(str, defaultValue = null) {
        try {
            return JSON.parse(str || '{}');
        } catch {
            return defaultValue;
        }
    }

    /**
     * Get all feature definitions
     */
    getFeatureDefinitions() {
        return this.features;
    }

    /**
     * Get enabled features for a user
     */
    async getEnabledFeatures(userId) {
        const enabled = [];

        for (const key of Object.keys(this.features)) {
            if (await this.isFeatureEnabled(userId, key)) {
                enabled.push({
                    key,
                    ...this.features[key]
                });
            }
        }

        return enabled;
    }
}

module.exports = new HighRiskService();
