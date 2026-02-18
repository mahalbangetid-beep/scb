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
 * Section 6 enhanced — supports auto ID, watermark, group targets, charge categories
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

    const { watermarkService } = require('./watermarkService');
    const marketingService = require('./marketingService');
    const broadcastUserId = broadcast.device?.userId || null;

    // Note: status is already set to 'processing' by checkScheduledBroadcasts()

    // Auto ID counter for this campaign (Section 6.1)
    let autoIdCounter = broadcast.autoIdStart || 1;
    const autoIdEnabled = broadcast.autoIdEnabled;
    const visibleWatermark = broadcast.watermarkText;

    // BUG #12 fix: use prefix from broadcast record (snapshot at create time)
    const autoIdPrefix = broadcast.autoIdPrefix || '';

    function composeFinalText(baseMessage) {
        let text = baseMessage;
        if (visibleWatermark) {
            text = `${text}\n\n${visibleWatermark}`;
        }
        if (autoIdEnabled) {
            text = `${text}\nID: ${autoIdPrefix}${autoIdCounter}`;
            autoIdCounter++;
        }
        return text;
    }

    // Phase 1: number recipients
    const recipients = await prisma.broadcastRecipient.findMany({
        where: { broadcastId, status: 'pending' }
    });

    let sent = 0, failed = 0;

    for (const recipient of recipients) {
        try {
            const finalText = composeFinalText(broadcast.message);

            if (broadcast.mediaUrl) {
                let finalCaption = finalText;
                if (broadcastUserId) {
                    try {
                        const result = await watermarkService.createAndEmbed({
                            text: finalText, userId: broadcastUserId,
                            deviceId: broadcast.deviceId, recipientId: recipient.phone, broadcastId
                        });
                        finalCaption = result.watermarkedText;
                    } catch (e) { /* watermark is non-critical */ }
                }
                await whatsappInstance.sendImage(broadcast.deviceId, recipient.phone, broadcast.mediaUrl, finalCaption);
            } else {
                await whatsappInstance.sendMessage(broadcast.deviceId, recipient.phone, finalText,
                    broadcastUserId ? { userId: broadcastUserId, broadcastId } : null
                );
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

        // Check cancellation
        if ((sent + failed) % 3 === 0 && (sent + failed) > 0) {
            const current = await prisma.broadcast.findUnique({ where: { id: broadcastId }, select: { status: true } });
            if (current?.status === 'cancelled') {
                console.log(`[Scheduler] Broadcast ${broadcastId} was cancelled, stopping processing.`);
                break;
            }
        }
    }

    // Phase 2: group targets (Section 6.4)
    let targetGroups = broadcast.targetGroups;
    if (targetGroups && typeof targetGroups === 'string') {
        try { targetGroups = JSON.parse(targetGroups); } catch { targetGroups = []; }
    }

    if (Array.isArray(targetGroups) && targetGroups.length > 0) {
        for (const groupJid of targetGroups) {
            const current = await prisma.broadcast.findUnique({ where: { id: broadcastId }, select: { status: true } });
            if (current?.status === 'cancelled') break;

            try {
                const finalText = composeFinalText(broadcast.message);
                if (broadcast.mediaUrl) {
                    await whatsappInstance.sendImage(broadcast.deviceId, groupJid, broadcast.mediaUrl, finalText);
                } else {
                    await whatsappInstance.sendMessage(broadcast.deviceId, groupJid, finalText,
                        broadcastUserId ? { userId: broadcastUserId, broadcastId } : null
                    );
                }
                sent++;
            } catch (error) {
                console.error(`[Scheduler] Failed to send to group ${groupJid}:`, error.message);
                failed++;
            }

            await new Promise(r => setTimeout(r, 2000));
        }
    }

    // Phase 3 (REMOVED): Auto ID counter update no longer needed here.
    // IDs are reserved upfront at broadcast creation time.

    // Phase 4: Charge credits (Section 6.5)
    if (broadcastUserId && sent > 0) {
        try {
            const messageCreditService = require('./messageCreditService');
            const chargeCategory = broadcast.chargeCategory || 'own_device';
            const rate = await marketingService.getChargeRate(broadcastUserId, chargeCategory);
            const totalCharge = sent * rate;

            if (totalCharge > 0) {
                await messageCreditService.deductCredits(
                    broadcastUserId, totalCharge,
                    `Broadcast: ${broadcast.name} (${chargeCategory})`,
                    broadcastId
                );
            }
        } catch (e) {
            console.warn('[Scheduler] Failed to charge credits:', e.message);
        }
    }

    // Phase 5: Update campaign status
    const current = await prisma.broadcast.findUnique({ where: { id: broadcastId }, select: { status: true } });
    const totalTargets = recipients.length + (Array.isArray(targetGroups) ? targetGroups.length : 0);
    let finalStatus;
    if (current?.status === 'cancelled') {
        finalStatus = 'cancelled';
    } else if (failed === totalTargets) {
        finalStatus = 'failed';
    } else if (failed > 0 && sent > 0) {
        finalStatus = 'partial'; // BUG #10 fix: was missing partial status
    } else {
        finalStatus = 'completed';
    }

    await prisma.broadcast.update({
        where: { id: broadcastId },
        data: {
            status: finalStatus,
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
