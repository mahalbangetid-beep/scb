/**
 * Subscription Scheduler
 * 
 * Cron job for processing subscription renewals
 * Runs daily to check and process due subscriptions
 */

const cron = require('node-cron');
const subscriptionService = require('./subscriptionService');

class SubscriptionScheduler {
    constructor() {
        this.isRunning = false;
        this.lastRun = null;
        this.lastResults = null;
    }

    /**
     * Initialize the scheduler
     */
    initialize() {
        // Run every day at 00:05 AM
        cron.schedule('5 0 * * *', async () => {
            console.log('[SubscriptionScheduler] Starting daily renewal processing...');
            await this.runRenewalProcess();
        });

        // Also run every 6 hours to catch any missed renewals
        cron.schedule('0 */6 * * *', async () => {
            console.log('[SubscriptionScheduler] Running periodic renewal check...');
            await this.runRenewalProcess();
        });

        console.log('[SubscriptionScheduler] Initialized with daily and periodic schedules');
    }

    /**
     * Run the renewal process
     */
    async runRenewalProcess() {
        const MAX_RUN_TIME = 5 * 60 * 1000; // 5 minutes max

        if (this.isRunning) {
            // Force reset if stuck too long
            if (this.runStartTime && (Date.now() - this.runStartTime > MAX_RUN_TIME)) {
                console.warn('[SubscriptionScheduler] Previous run exceeded timeout (' + MAX_RUN_TIME + 'ms), force resetting...');
                this.isRunning = false;
            } else {
                console.log('[SubscriptionScheduler] Already running, skipping...');
                return;
            }
        }

        try {
            this.isRunning = true;
            this.runStartTime = Date.now();
            const startTime = this.runStartTime;

            const results = await subscriptionService.processAllRenewals();

            // Also process system bot subscription renewals
            let systemBotResults = { processed: 0, success: 0, failed: 0 };
            try {
                const { processSystemBotRenewals } = require('../routes/systemBots');
                systemBotResults = await processSystemBotRenewals();
                console.log(`[SubscriptionScheduler] System bot renewals:`, {
                    processed: systemBotResults.processed,
                    success: systemBotResults.success,
                    failed: systemBotResults.failed
                });
            } catch (err) {
                console.error('[SubscriptionScheduler] System bot renewal error:', err.message);
            }

            const duration = Date.now() - startTime;
            this.lastRun = new Date();
            this.lastResults = {
                ...results,
                systemBots: systemBotResults,
                duration,
                timestamp: this.lastRun
            };

            console.log(`[SubscriptionScheduler] Completed in ${duration}ms:`, {
                processed: results.processed,
                success: results.success,
                failed: results.failed,
                paused: results.paused,
                systemBots: systemBotResults.processed
            });

            // Send notifications for failed renewals
            await this.sendFailureNotifications(results);

        } catch (error) {
            console.error('[SubscriptionScheduler] Error:', error.message);
            this.lastResults = {
                error: error.message,
                timestamp: new Date()
            };
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Send notifications for failed renewals
     */
    async sendFailureNotifications(results) {
        if (!results.details) return;

        const failures = results.details.filter(d => !d.success);
        if (failures.length === 0) return;

        const { activityLogService } = require('./activityLog');

        for (const failure of failures) {
            try {
                // Log activity so user sees it in their dashboard
                await activityLogService.log({
                    userId: failure.userId,
                    action: 'subscription_renewal_failed',
                    category: 'billing',
                    description: `Subscription renewal failed for ${failure.resourceType || 'resource'}: ${failure.reason || 'Insufficient balance'}. Please top up your balance to restore service.`,
                    metadata: {
                        subscriptionId: failure.subscriptionId,
                        resourceType: failure.resourceType,
                        reason: failure.reason
                    },
                    status: 'failed'
                });

                console.log(`[SubscriptionScheduler] Failure notification logged for user ${failure.userId}: ${failure.reason}`);
            } catch (notifErr) {
                console.error(`[SubscriptionScheduler] Failed to send notification for user ${failure.userId}:`, notifErr.message);
            }
        }
    }

    /**
     * Get scheduler status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            lastRun: this.lastRun,
            lastResults: this.lastResults
        };
    }

    /**
     * Manually trigger renewal process
     */
    async triggerManually() {
        return this.runRenewalProcess();
    }
}

// Create singleton instance
const subscriptionScheduler = new SubscriptionScheduler();

module.exports = subscriptionScheduler;
