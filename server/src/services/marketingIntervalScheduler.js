/**
 * Marketing Interval Scheduler
 * 
 * Handles time-based marketing intervals.
 * Runs every 30 seconds, checks for intervals where nextRunAt <= now,
 * sends the marketing message, and schedules the next run.
 * 
 * Counter-based intervals are handled separately by botMessageHandler.trackMarketingInterval()
 */

const prisma = require('../utils/prisma');

class MarketingIntervalScheduler {
    constructor() {
        this.timer = null;
        this.whatsappService = null;
        this.isRunning = false;
        this.POLL_INTERVAL = 30000; // 30 seconds
    }

    /**
     * Initialize and start the scheduler
     */
    start(whatsappService) {
        this.whatsappService = whatsappService;
        if (this.timer) {
            clearInterval(this.timer);
        }
        this.timer = setInterval(() => this.tick(), this.POLL_INTERVAL);
        console.log('[MarketingScheduler] Started (polling every 30s)');
    }

    /**
     * Stop the scheduler
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        console.log('[MarketingScheduler] Stopped');
    }

    /**
     * Main tick — find and execute due time-based intervals
     */
    async tick() {
        if (this.isRunning) return; // Prevent overlapping runs
        this.isRunning = true;

        try {
            const now = new Date();

            // Find all time-based intervals that are:
            // 1. Active
            // 2. scheduleType = 'time'
            // 3. nextRunAt <= now (due for execution)
            // 4. scheduledAt <= now OR scheduledAt is null (start time passed)
            const dueIntervals = await prisma.marketingInterval.findMany({
                where: {
                    scheduleType: 'time',
                    isActive: true,
                    nextRunAt: { lte: now },
                    OR: [
                        { scheduledAt: null },
                        { scheduledAt: { lte: now } }
                    ]
                },
                include: {
                    device: { select: { id: true, name: true, status: true } }
                },
                take: 50 // Process max 50 per tick to avoid overload
            });

            if (dueIntervals.length === 0) {
                this.isRunning = false;
                return;
            }

            console.log(`[MarketingScheduler] Processing ${dueIntervals.length} due interval(s)`);

            for (const interval of dueIntervals) {
                await this.processInterval(interval, now);
            }
        } catch (error) {
            console.error('[MarketingScheduler] Tick error:', error.message);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Process a single time-based interval
     */
    async processInterval(interval, now) {
        const { id, deviceId, groupJid, message, mediaUrl, repeatCount, repeatsDone, timeInterval } = interval;

        // Check if device is connected
        if (interval.device?.status !== 'connected') {
            console.log(`[MarketingScheduler] Device ${deviceId} not connected, skipping interval ${id}`);
            // Advance nextRunAt so we don't re-query every tick while device is offline
            const retryMinutes = Math.min(timeInterval || 60, 30); // Retry in min(timeInterval, 30min)
            await prisma.marketingInterval.update({
                where: { id },
                data: { nextRunAt: new Date(now.getTime() + retryMinutes * 60000) }
            });
            return;
        }

        // Check repeat limit
        if (repeatCount !== null && repeatsDone >= repeatCount) {
            // Reached max repeats — deactivate
            await prisma.marketingInterval.update({
                where: { id },
                data: { isActive: false, nextRunAt: null }
            });
            console.log(`[MarketingScheduler] Interval ${id} completed all ${repeatCount} repeats, deactivated`);
            return;
        }

        // Send the message
        let status = 'sent';
        let errorMessage = null;

        try {
            if (mediaUrl && this.whatsappService?.sendImage) {
                await this.whatsappService.sendImage(deviceId, groupJid, mediaUrl, message);
            } else if (this.whatsappService) {
                const session = this.whatsappService.getSession(deviceId);
                if (session) {
                    await session.sendMessage(groupJid, { text: message });
                } else {
                    throw new Error('WhatsApp session not found');
                }
            } else {
                throw new Error('WhatsApp service not available');
            }

            console.log(`[MarketingScheduler] Sent to ${groupJid} (interval ${id}, repeat ${repeatsDone + 1}/${repeatCount || '∞'})`);
        } catch (err) {
            status = 'failed';
            errorMessage = err.message;
            console.error(`[MarketingScheduler] Failed to send to ${groupJid}:`, err.message);
        }

        // Calculate next run time
        const minutesUntilNext = timeInterval || 60; // Default 60 min
        const nextRunAt = new Date(now.getTime() + minutesUntilNext * 60000);
        const newRepeatsDone = repeatsDone + (status === 'sent' ? 1 : 0);

        // Check if this was the last repeat
        const shouldDeactivate = repeatCount !== null && newRepeatsDone >= repeatCount;

        // Update interval record
        await prisma.marketingInterval.update({
            where: { id },
            data: {
                repeatsDone: newRepeatsDone,
                lastTriggeredAt: now,
                triggerCount: { increment: status === 'sent' ? 1 : 0 },
                nextRunAt: shouldDeactivate ? null : nextRunAt,
                isActive: shouldDeactivate ? false : true
            }
        });

        // Create log entry
        try {
            await prisma.marketingIntervalLog.create({
                data: {
                    intervalId: id,
                    groupJid,
                    status,
                    errorMessage
                }
            });
        } catch (logErr) {
            console.error('[MarketingScheduler] Failed to create log:', logErr.message);
        }

        if (shouldDeactivate) {
            console.log(`[MarketingScheduler] Interval ${id} completed all repeats, deactivated`);
        }
    }
}

module.exports = new MarketingIntervalScheduler();
