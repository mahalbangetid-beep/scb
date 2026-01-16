/**
 * Monthly Subscription Service
 * 
 * Service for managing recurring subscriptions for devices, panels, bots
 * From clientupdate2.md: Auto-renewal system with auto-deduct from balance
 * 
 * Features:
 * - Auto-renewal for WhatsApp devices, Telegram bots, SMM panels
 * - Free first login with subsequent monthly charges
 * - Grace period handling
 * - Pause/resume services on insufficient balance
 * - Renewal notifications
 */

const prisma = require('../utils/prisma');
const creditService = require('./creditService');

class SubscriptionService {
    constructor() {
        // Default subscription fees (can be configured in SystemConfig)
        this.defaultFees = {
            DEVICE: 5.00,        // $5/month per WhatsApp device
            TELEGRAM_BOT: 3.00,  // $3/month per Telegram bot
            SMM_PANEL: 2.00      // $2/month per SMM panel
        };

        // Grace period in days
        this.defaultGracePeriod = 3;
    }

    /**
     * Get subscription fee for a resource type
     */
    async getFee(resourceType) {
        // Try to get from SystemConfig first
        const config = await prisma.systemConfig.findUnique({
            where: { key: `SUBSCRIPTION_FEE_${resourceType}` }
        });

        if (config) {
            return parseFloat(config.value);
        }

        return this.defaultFees[resourceType] || 0;
    }

    /**
     * Create a subscription for a resource
     */
    async createSubscription(userId, resourceType, resourceId, resourceName, isFreeFirst = false) {
        const monthlyFee = await this.getFee(resourceType);
        const now = new Date();

        // Calculate next billing date (1 month from now)
        const nextBillingDate = new Date(now);
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

        return prisma.monthlySubscription.create({
            data: {
                userId,
                resourceType,
                resourceId,
                resourceName: resourceName || `${resourceType} ${resourceId}`,
                monthlyFee,
                status: 'ACTIVE',
                startDate: now,
                nextBillingDate,
                isFreeFirst,
                gracePeriodDays: this.defaultGracePeriod
            }
        });
    }

    /**
     * Get all subscriptions for a user
     */
    async getUserSubscriptions(userId) {
        return prisma.monthlySubscription.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Get active subscriptions for a user
     */
    async getActiveSubscriptions(userId) {
        return prisma.monthlySubscription.findMany({
            where: {
                userId,
                status: 'ACTIVE'
            }
        });
    }

    /**
     * Get subscription by resource
     */
    async getByResource(userId, resourceType, resourceId) {
        return prisma.monthlySubscription.findFirst({
            where: {
                userId,
                resourceType,
                resourceId
            }
        });
    }

    /**
     * Get subscriptions due for renewal
     */
    async getDueSubscriptions() {
        const now = new Date();

        return prisma.monthlySubscription.findMany({
            where: {
                status: 'ACTIVE',
                nextBillingDate: {
                    lte: now
                }
            },
            include: {
                // We need user info for balance check
            }
        });
    }

    /**
     * Process a single renewal
     * @returns {Object} { success, subscription, reason }
     */
    async processRenewal(subscription) {
        const user = await prisma.user.findUnique({
            where: { id: subscription.userId }
        });

        if (!user) {
            return { success: false, reason: 'USER_NOT_FOUND' };
        }

        const fee = subscription.monthlyFee;

        // Check balance
        if ((user.creditBalance || 0) < fee) {
            // Insufficient balance - handle based on failed attempts
            const failedAttempts = (subscription.failedAttempts || 0) + 1;

            await prisma.monthlySubscription.update({
                where: { id: subscription.id },
                data: {
                    failedAttempts,
                    lastFailReason: 'INSUFFICIENT_BALANCE',
                    lastFailedAt: new Date()
                }
            });

            // If exceeded grace period, pause the subscription
            if (failedAttempts >= subscription.gracePeriodDays) {
                await this.pauseSubscription(subscription.id, 'Insufficient balance');
                return { success: false, reason: 'PAUSED_INSUFFICIENT_BALANCE' };
            }

            return { success: false, reason: 'INSUFFICIENT_BALANCE', failedAttempts };
        }

        // Deduct balance
        try {
            await creditService.deductCredit(
                user.id,
                fee,
                `Monthly subscription: ${subscription.resourceType} - ${subscription.resourceName}`,
                `SUBSCRIPTION_${subscription.id}`
            );
        } catch (error) {
            return { success: false, reason: 'DEDUCTION_FAILED', error: error.message };
        }

        // Calculate next billing date
        const nextBillingDate = new Date();
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

        // Update subscription
        const updated = await prisma.monthlySubscription.update({
            where: { id: subscription.id },
            data: {
                lastBilledAt: new Date(),
                nextBillingDate,
                failedAttempts: 0,
                lastFailReason: null,
                lastFailedAt: null
            }
        });

        console.log(`[Subscription] Renewed: ${subscription.resourceType} for user ${subscription.userId} - $${fee}`);

        return { success: true, subscription: updated };
    }

    /**
     * Process all due renewals (to be called by cron job)
     */
    async processAllRenewals() {
        const dueSubscriptions = await this.getDueSubscriptions();

        console.log(`[Subscription] Processing ${dueSubscriptions.length} due renewals...`);

        const results = {
            processed: 0,
            success: 0,
            failed: 0,
            paused: 0,
            details: []
        };

        for (const subscription of dueSubscriptions) {
            const result = await this.processRenewal(subscription);

            results.processed++;

            if (result.success) {
                results.success++;
            } else if (result.reason === 'PAUSED_INSUFFICIENT_BALANCE') {
                results.paused++;
            } else {
                results.failed++;
            }

            results.details.push({
                subscriptionId: subscription.id,
                resourceType: subscription.resourceType,
                userId: subscription.userId,
                ...result
            });
        }

        console.log(`[Subscription] Renewal complete: ${results.success} success, ${results.failed} failed, ${results.paused} paused`);

        return results;
    }

    /**
     * Pause a subscription
     */
    async pauseSubscription(subscriptionId, reason = null) {
        const subscription = await prisma.monthlySubscription.update({
            where: { id: subscriptionId },
            data: {
                status: 'PAUSED',
                pausedAt: new Date(),
                lastFailReason: reason
            }
        });

        // Also pause the associated resource
        await this.pauseResource(subscription);

        console.log(`[Subscription] Paused: ${subscription.resourceType} ${subscription.resourceId}`);

        return subscription;
    }

    /**
     * Resume a paused subscription (after balance added)
     */
    async resumeSubscription(subscriptionId, userId) {
        const subscription = await prisma.monthlySubscription.findFirst({
            where: { id: subscriptionId, userId }
        });

        if (!subscription) {
            throw new Error('Subscription not found');
        }

        if (subscription.status !== 'PAUSED') {
            throw new Error('Subscription is not paused');
        }

        // Check if user now has sufficient balance
        const user = await prisma.user.findUnique({
            where: { id: subscription.userId }
        });

        if ((user.creditBalance || 0) < subscription.monthlyFee) {
            throw new Error('Insufficient balance to resume subscription');
        }

        // Process immediate renewal
        const renewalResult = await this.processRenewal({
            ...subscription,
            failedAttempts: 0
        });

        if (!renewalResult.success) {
            throw new Error(`Failed to resume: ${renewalResult.reason}`);
        }

        // Update status
        const updated = await prisma.monthlySubscription.update({
            where: { id: subscriptionId },
            data: {
                status: 'ACTIVE',
                pausedAt: null,
                failedAttempts: 0
            }
        });

        // Resume the associated resource
        await this.resumeResource(subscription);

        return updated;
    }

    /**
     * Cancel a subscription
     */
    async cancelSubscription(subscriptionId, userId) {
        const subscription = await prisma.monthlySubscription.findFirst({
            where: { id: subscriptionId, userId }
        });

        if (!subscription) {
            throw new Error('Subscription not found');
        }

        return prisma.monthlySubscription.update({
            where: { id: subscriptionId },
            data: {
                status: 'CANCELLED',
                updatedAt: new Date()
            }
        });
    }

    /**
     * Pause the actual resource (device, bot, panel)
     */
    async pauseResource(subscription) {
        const { resourceType, resourceId } = subscription;

        switch (resourceType) {
            case 'DEVICE':
                await prisma.device.update({
                    where: { id: resourceId },
                    data: { status: 'PAUSED' }
                }).catch(() => { }); // Ignore if not found
                break;

            case 'TELEGRAM_BOT':
                await prisma.telegramBot.update({
                    where: { id: resourceId },
                    data: { status: 'PAUSED' }
                }).catch(() => { });
                break;

            case 'SMM_PANEL':
                await prisma.smmPanel.update({
                    where: { id: resourceId },
                    data: { isActive: false }
                }).catch(() => { });
                break;
        }
    }

    /**
     * Resume the actual resource
     */
    async resumeResource(subscription) {
        const { resourceType, resourceId } = subscription;

        switch (resourceType) {
            case 'DEVICE':
                await prisma.device.update({
                    where: { id: resourceId },
                    data: { status: 'connected' }
                }).catch(() => { });
                break;

            case 'TELEGRAM_BOT':
                await prisma.telegramBot.update({
                    where: { id: resourceId },
                    data: { status: 'connected' }  // TelegramBot uses 'connected' status
                }).catch(() => { });
                break;

            case 'SMM_PANEL':
                await prisma.smmPanel.update({
                    where: { id: resourceId },
                    data: { isActive: true }
                }).catch(() => { });
                break;
        }
    }

    /**
     * Check if resource has active subscription
     */
    async hasActiveSubscription(resourceType, resourceId) {
        const subscription = await prisma.monthlySubscription.findFirst({
            where: {
                resourceType,
                resourceId,
                status: 'ACTIVE'
            }
        });

        return !!subscription;
    }

    /**
     * Get subscriptions expiring soon (for reminders)
     */
    async getExpiringSoon(daysAhead = 3) {
        const now = new Date();
        const futureDate = new Date(now);
        futureDate.setDate(futureDate.getDate() + daysAhead);

        return prisma.monthlySubscription.findMany({
            where: {
                status: 'ACTIVE',
                nextBillingDate: {
                    gte: now,
                    lte: futureDate
                },
                reminderSentAt: null // Not yet reminded
            }
        });
    }

    /**
     * Mark reminder as sent
     */
    async markReminderSent(subscriptionId) {
        return prisma.monthlySubscription.update({
            where: { id: subscriptionId },
            data: { reminderSentAt: new Date() }
        });
    }

    /**
     * Get subscription summary for a user
     */
    async getUserSummary(userId) {
        const subscriptions = await this.getUserSubscriptions(userId);

        const summary = {
            total: subscriptions.length,
            active: 0,
            paused: 0,
            cancelled: 0,
            monthlyTotal: 0,
            nextBilling: null,
            subscriptions: []
        };

        for (const sub of subscriptions) {
            if (sub.status === 'ACTIVE') {
                summary.active++;
                summary.monthlyTotal += sub.monthlyFee;

                if (!summary.nextBilling || sub.nextBillingDate < summary.nextBilling) {
                    summary.nextBilling = sub.nextBillingDate;
                }
            } else if (sub.status === 'PAUSED') {
                summary.paused++;
            } else if (sub.status === 'CANCELLED') {
                summary.cancelled++;
            }

            summary.subscriptions.push({
                id: sub.id,
                type: sub.resourceType,
                name: sub.resourceName,
                status: sub.status,
                fee: sub.monthlyFee,
                nextBilling: sub.nextBillingDate
            });
        }

        return summary;
    }
}

module.exports = new SubscriptionService();
