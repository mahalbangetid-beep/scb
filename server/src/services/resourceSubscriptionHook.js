/**
 * Resource Subscription Hook
 * 
 * Service for auto-creating subscriptions when resources are created
 * Implements "First Connection Free" logic from client requirements
 * 
 * Features:
 * - First device/bot/panel is FREE
 * - Subsequent connections create subscriptions automatically
 * - Auto-deduct monthly charges from balance
 */

const prisma = require('../utils/prisma');
const subscriptionService = require('./subscriptionService');

class ResourceSubscriptionHook {
    constructor() {
        // Resource types and their settings
        this.resourceTypes = {
            DEVICE: {
                model: 'device',
                nameField: 'name',
                freeFirstCount: 1
            },
            TELEGRAM_BOT: {
                model: 'telegramBot',
                nameField: 'name',
                freeFirstCount: 1
            },
            SMM_PANEL: {
                model: 'smmPanel',
                nameField: 'name',
                freeFirstCount: 1
            }
        };
    }

    /**
     * Check if user is eligible for free resource
     * @returns {Object} { isEligible, currentCount, freeLimit, reason }
     */
    async checkFreeEligibility(userId, resourceType) {
        const config = this.resourceTypes[resourceType];
        if (!config) {
            return { isEligible: false, reason: 'Unknown resource type' };
        }

        // Count existing resources of this type
        const currentCount = await this.getResourceCount(userId, resourceType);
        const freeLimit = config.freeFirstCount;

        const isEligible = currentCount < freeLimit;

        return {
            isEligible,
            currentCount,
            freeLimit,
            reason: isEligible
                ? `Free ${resourceType} available (${currentCount}/${freeLimit})`
                : `Free limit reached (${currentCount}/${freeLimit}), subscription required`
        };
    }

    /**
     * Get count of existing resources for user
     */
    async getResourceCount(userId, resourceType) {
        switch (resourceType) {
            case 'DEVICE':
                return prisma.device.count({ where: { userId } });
            case 'TELEGRAM_BOT':
                return prisma.telegramBot.count({ where: { userId } });
            case 'SMM_PANEL':
                return prisma.smmPanel.count({ where: { userId } });
            default:
                return 0;
        }
    }

    /**
     * Hook to call AFTER creating a resource
     * Creates subscription if not eligible for free
     */
    async onResourceCreated(userId, resourceType, resourceId, resourceName) {
        console.log(`[ResourceHook] Resource created: ${resourceType} ${resourceId} for user ${userId}`);

        // Check if this resource is free
        const eligibility = await this.checkFreeEligibility(userId, resourceType);

        // Since resource is already created, currentCount includes the new one
        // So we check if currentCount > freeLimit
        const shouldCharge = eligibility.currentCount > eligibility.freeLimit;

        if (!shouldCharge) {
            console.log(`[ResourceHook] Free resource granted: ${resourceType} (${eligibility.currentCount}/${eligibility.freeLimit})`);
            return {
                charged: false,
                message: `Your first ${resourceType.toLowerCase().replace('_', ' ')} is free!`
            };
        }

        // Create subscription
        try {
            const subscription = await subscriptionService.createSubscription(userId, {
                resourceType,
                resourceId,
                resourceName: resourceName || `${resourceType} ${resourceId.slice(-6)}`
            });

            console.log(`[ResourceHook] Subscription created: ${subscription.id} for ${resourceType}`);

            return {
                charged: true,
                subscription,
                message: `Subscription created. Monthly fee: $${subscription.monthlyFee}`
            };
        } catch (error) {
            console.error(`[ResourceHook] Failed to create subscription:`, error.message);
            return {
                charged: false,
                error: error.message,
                message: 'Subscription creation failed, but resource was created'
            };
        }
    }

    /**
     * Hook to call BEFORE creating a resource
     * Checks if user can afford the subscription (if not free)
     */
    async beforeResourceCreate(userId, resourceType) {
        const eligibility = await this.checkFreeEligibility(userId, resourceType);

        if (eligibility.isEligible) {
            return {
                canCreate: true,
                isFree: true,
                message: eligibility.reason
            };
        }

        // Check if user has enough balance for first month
        const fees = subscriptionService.getResourceFees();
        const fee = fees[resourceType] || 0;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { creditBalance: true }
        });

        const hasBalance = (user?.creditBalance || 0) >= fee;

        return {
            canCreate: hasBalance,
            isFree: false,
            requiredBalance: fee,
            currentBalance: user?.creditBalance || 0,
            message: hasBalance
                ? `Additional ${resourceType.toLowerCase().replace('_', ' ')} requires $${fee}/month subscription`
                : `Insufficient balance. Required: $${fee}, Available: $${user?.creditBalance || 0}`
        };
    }

    /**
     * Hook to call when resource is deleted
     * Cancels the subscription
     */
    async onResourceDeleted(userId, resourceType, resourceId) {
        console.log(`[ResourceHook] Resource deleted: ${resourceType} ${resourceId}`);

        // Find and cancel subscription
        const subscription = await prisma.monthlySubscription.findFirst({
            where: {
                userId,
                resourceType,
                resourceId
            }
        });

        if (subscription) {
            await subscriptionService.cancelSubscription(subscription.id, userId);
            console.log(`[ResourceHook] Subscription cancelled: ${subscription.id}`);
            return { cancelled: true };
        }

        return { cancelled: false };
    }

    /**
     * Get subscription status for a resource
     */
    async getResourceSubscription(userId, resourceType, resourceId) {
        const subscription = await prisma.monthlySubscription.findFirst({
            where: {
                userId,
                resourceType,
                resourceId
            }
        });

        if (!subscription) {
            // Check if this is a free resource
            const count = await this.getResourceCount(userId, resourceType);
            const config = this.resourceTypes[resourceType] || { freeFirstCount: 1 };

            if (count <= config.freeFirstCount) {
                return {
                    status: 'FREE',
                    message: 'This is a free resource'
                };
            }

            return {
                status: 'NO_SUBSCRIPTION',
                message: 'No subscription found'
            };
        }

        return {
            status: subscription.status,
            subscription,
            nextBilling: subscription.nextBillingDate,
            fee: subscription.monthlyFee
        };
    }

    /**
     * Get summary of user's resources and subscriptions
     */
    async getUserResourceSummary(userId) {
        const [devices, bots, panels, subscriptions] = await Promise.all([
            prisma.device.count({ where: { userId } }),
            prisma.telegramBot.count({ where: { userId } }),
            prisma.smmPanel.count({ where: { userId } }),
            prisma.monthlySubscription.findMany({
                where: { userId },
                select: { resourceType: true, status: true, monthlyFee: true }
            })
        ]);

        const activeMonthly = subscriptions
            .filter(s => s.status === 'ACTIVE')
            .reduce((sum, s) => sum + (s.monthlyFee || 0), 0);

        return {
            counts: {
                devices,
                telegramBots: bots,
                smmPanels: panels
            },
            freeLimits: {
                devices: this.resourceTypes.DEVICE.freeFirstCount,
                telegramBots: this.resourceTypes.TELEGRAM_BOT.freeFirstCount,
                smmPanels: this.resourceTypes.SMM_PANEL.freeFirstCount
            },
            subscriptions: subscriptions.length,
            activeMonthlyFee: activeMonthly
        };
    }
}

module.exports = new ResourceSubscriptionHook();
