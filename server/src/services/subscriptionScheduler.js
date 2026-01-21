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
        if (this.isRunning) {
            console.log('[SubscriptionScheduler] Already running, skipping...');
            return;
        }

        try {
            this.isRunning = true;
            const startTime = Date.now();

            const results = await subscriptionService.processAllRenewals();

            const duration = Date.now() - startTime;
            this.lastRun = new Date();
            this.lastResults = {
                ...results,
                duration,
                timestamp: this.lastRun
            };

            console.log(`[SubscriptionScheduler] Completed in ${duration}ms:`, {
                processed: results.processed,
                success: results.success,
                failed: results.failed,
                paused: results.paused
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

        for (const failure of failures) {
            // TODO: Send WhatsApp/Telegram notification to affected user
            // This would use the messaging service to notify users
            console.log(`[SubscriptionScheduler] Notification needed for user ${failure.userId}: ${failure.reason}`);
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
