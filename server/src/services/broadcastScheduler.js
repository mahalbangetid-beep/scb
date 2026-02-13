/**
 * Broadcast Scheduler Service
 * 
 * Periodically checks for scheduled broadcasts that are due
 * and triggers their processing.
 */

const prisma = require('../utils/prisma');

const CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds
let schedulerInterval = null;
let whatsappInstance = null;

/**
 * Process a single broadcast campaign
 * Reused logic from broadcast route
 */
async function processBroadcast(broadcastId) {
    const broadcast = await prisma.broadcast.findUnique({
        where: { id: broadcastId },
        include: { device: true }
    });

    if (!broadcast || !whatsappInstance) {
        console.error(`[Scheduler] Cannot process broadcast ${broadcastId}: not found or no WhatsApp instance`);
        return;
    }

    // Mark as processing
    await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status: 'processing', startedAt: new Date() }
    });

    const recipients = await prisma.broadcastRecipient.findMany({
        where: { broadcastId, status: 'pending' }
    });

    let sent = 0, failed = 0;

    for (const recipient of recipients) {
        try {
            if (broadcast.mediaUrl) {
                // Embed watermark in caption for image broadcasts
                let finalCaption = broadcast.message;
                const broadcastUserId = broadcast.device?.userId || null;
                if (broadcastUserId) {
                    try {
                        const { watermarkService } = require('./watermarkService');
                        const result = await watermarkService.createAndEmbed({
                            text: broadcast.message, userId: broadcastUserId,
                            deviceId: broadcast.deviceId, recipientId: recipient.phone, broadcastId
                        });
                        finalCaption = result.watermarkedText;
                    } catch (e) { /* watermark is non-critical */ }
                }
                await whatsappInstance.sendImage(broadcast.deviceId, recipient.phone, broadcast.mediaUrl, finalCaption);
            } else {
                await whatsappInstance.sendMessage(broadcast.deviceId, recipient.phone, broadcast.message, {
                    userId: broadcast.device?.userId || null,
                    broadcastId
                });
            }

            await prisma.broadcastRecipient.update({
                where: { id: recipient.id },
                data: { status: 'sent', sentAt: new Date() }
            });
            sent++;
        } catch (error) {
            await prisma.broadcastRecipient.update({
                where: { id: recipient.id },
                data: { status: 'failed', error: error.message }
            });
            failed++;
        }

        // Delay between messages
        await new Promise(r => setTimeout(r, 1500));
    }

    // Update campaign status
    await prisma.broadcast.update({
        where: { id: broadcastId },
        data: {
            status: failed === recipients.length ? 'failed' : 'completed',
            sent,
            failed,
            completedAt: new Date()
        }
    });

    console.log(`[Scheduler] Broadcast ${broadcastId} completed: ${sent} sent, ${failed} failed`);
}

/**
 * Check for due scheduled broadcasts and trigger them
 */
async function checkScheduledBroadcasts() {
    try {
        const dueBroadcasts = await prisma.broadcast.findMany({
            where: {
                status: 'scheduled',
                scheduledAt: {
                    lte: new Date()
                }
            },
            include: {
                device: { select: { status: true } }
            }
        });

        const MAX_WAIT_MS = 24 * 60 * 60 * 1000; // 24 hours max wait for device reconnect

        for (const broadcast of dueBroadcasts) {
            // Skip if device is not connected
            if (broadcast.device?.status !== 'connected') {
                const waitedMs = Date.now() - new Date(broadcast.scheduledAt).getTime();

                // If waited more than 24 hours, mark as failed
                if (waitedMs > MAX_WAIT_MS) {
                    console.error(`[Scheduler] Broadcast ${broadcast.id} (${broadcast.name}) TIMED OUT after 24h — device still offline. Marking as failed.`);
                    await prisma.broadcast.update({
                        where: { id: broadcast.id },
                        data: {
                            status: 'failed',
                            completedAt: new Date()
                        }
                    });
                    // Mark all pending recipients as failed too
                    await prisma.broadcastRecipient.updateMany({
                        where: { broadcastId: broadcast.id, status: 'pending' },
                        data: { status: 'failed', error: 'Broadcast timed out: device was offline for more than 24 hours' }
                    });
                } else {
                    const hoursWaited = Math.round(waitedMs / (60 * 60 * 1000) * 10) / 10;
                    console.warn(`[Scheduler] Skipping broadcast ${broadcast.id} (${broadcast.name}): device not connected (waiting ${hoursWaited}h / max 24h)`);
                }
                continue;
            }

            console.log(`[Scheduler] Triggering scheduled broadcast: ${broadcast.name} (${broadcast.id})`);

            // Mark as processing IMMEDIATELY to prevent duplicate triggers on next tick
            await prisma.broadcast.update({
                where: { id: broadcast.id },
                data: { status: 'processing', startedAt: new Date() }
            });

            // Process in background, don't await
            processBroadcast(broadcast.id)
                .catch(err => console.error(`[Scheduler] Error processing broadcast ${broadcast.id}:`, err.message));
        }
    } catch (error) {
        console.error('[Scheduler] Error checking scheduled broadcasts:', error.message);
    }
}

/**
 * Start the broadcast scheduler
 */
function startScheduler(whatsapp) {
    whatsappInstance = whatsapp;

    if (schedulerInterval) {
        clearInterval(schedulerInterval);
    }

    schedulerInterval = setInterval(checkScheduledBroadcasts, CHECK_INTERVAL);
    console.log(`[Scheduler] Broadcast scheduler started (checking every ${CHECK_INTERVAL / 1000}s)`);
}

/**
 * Stop the broadcast scheduler
 */
function stopScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('[Scheduler] Broadcast scheduler stopped');
    }
}

module.exports = { startScheduler, stopScheduler };
