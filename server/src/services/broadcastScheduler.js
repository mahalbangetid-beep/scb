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

// Default delays (ms) between messages
const DEFAULT_WA_DELAY = 1500;
const DEFAULT_TG_DELAY = 500;
const DEFAULT_GROUP_DELAY = 2000;

/**
 * Get user-configured broadcast delay from Setting table
 * Falls back to platform-specific defaults
 */
async function getUserBroadcastDelay(userId, platform = 'WHATSAPP') {
    try {
        if (!userId) return platform === 'TELEGRAM' ? DEFAULT_TG_DELAY : DEFAULT_WA_DELAY;
        const setting = await prisma.setting.findUnique({
            where: {
                key_userId: {
                    key: 'broadcast_message_delay_ms',
                    userId
                }
            }
        });
        if (setting && setting.value) {
            const val = parseInt(setting.value);
            // Enforce minimum 500ms to prevent spam/ban
            if (!isNaN(val) && val >= 500) return val;
        }
    } catch (e) {
        // Fail silently — use default
    }
    return platform === 'TELEGRAM' ? DEFAULT_TG_DELAY : DEFAULT_WA_DELAY;
}

/**
 * Process a single broadcast campaign
 * Section 6 enhanced — supports auto ID, watermark, group targets, charge categories
 */
async function processBroadcast(broadcastId) {
    const broadcast = await prisma.broadcast.findUnique({
        where: { id: broadcastId },
        include: { device: true, telegramBot: true }
    });

    if (!broadcast) {
        console.error(`[Scheduler] Cannot process broadcast ${broadcastId}: not found`);
        return;
    }

    // Route to Telegram processor if platform is TELEGRAM (Bug 5.1)
    if (broadcast.platform === 'TELEGRAM') {
        return processScheduledTelegramBroadcast(broadcast);
    }

    if (!whatsappInstance) {
        console.error(`[Scheduler] Cannot process broadcast ${broadcastId}: no WhatsApp instance`);
        return;
    }

    const { watermarkService } = require('./watermarkService');
    const marketingService = require('./marketingService');
    const broadcastUserId = broadcast.device?.userId || null;

    // Section 13.1 fix: Use per-campaign messageDelay first (set at broadcast time),
    // fallback to global user setting, then platform defaults
    const messageDelay = broadcast.messageDelay || await getUserBroadcastDelay(broadcastUserId, 'WHATSAPP');
    const groupDelay = Math.max(messageDelay, DEFAULT_GROUP_DELAY); // Groups need at least 2s

    // Note: status is already set to 'processing' by checkScheduledBroadcasts()

    // Auto ID counter for this campaign (Section 6.1)
    let autoIdCounter = broadcast.autoIdStart || 1;
    const autoIdEnabled = broadcast.autoIdEnabled;
    const visibleWatermark = broadcast.watermarkText;

    // BUG #12 fix: use prefix from broadcast record (snapshot at create time)
    const autoIdPrefix = broadcast.autoIdPrefix || '';
    const autoPadding = broadcast.autoPadding;

    // Zero-width characters for invisible padding (anti-spam)
    const ZWC_CHARS = ['\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF'];
    function generatePadding() {
        const len = 3 + Math.floor(Math.random() * 4); // 3-6 chars
        return Array.from({ length: len }, () => ZWC_CHARS[Math.floor(Math.random() * ZWC_CHARS.length)]).join('');
    }

    function composeFinalText(baseMessage) {
        let text = baseMessage;
        if (autoPadding) {
            text = text + generatePadding();
        }
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

        // Configurable delay between messages (admin can set per-user)
        await new Promise(r => setTimeout(r, messageDelay));

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

            await new Promise(r => setTimeout(r, groupDelay));
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
                    broadcastId,
                    'whatsapp_marketing'
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
 * Process scheduled Telegram broadcast (Bug 5.1)
 */
async function processScheduledTelegramBroadcast(broadcast) {
    const broadcastId = broadcast.id;
    const telegramService = require('./telegram');
    const marketingService = require('./marketingService');

    let autoIdCounter = broadcast.autoIdStart || 1;
    const autoIdEnabled = broadcast.autoIdEnabled;
    const visibleWatermark = broadcast.watermarkText;
    const autoIdPrefix = broadcast.autoIdPrefix || '';
    const broadcastUserId = broadcast.telegramBot?.userId || null;
    // Section 13.1 fix: Use per-campaign delay first, fallback to global
    const tgDelay = broadcast.messageDelay || await getUserBroadcastDelay(broadcastUserId, 'TELEGRAM');
    const autoPadding = broadcast.autoPadding;

    const ZWC_CHARS = ['\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF'];
    function generatePadding() {
        const len = 3 + Math.floor(Math.random() * 4);
        return Array.from({ length: len }, () => ZWC_CHARS[Math.floor(Math.random() * ZWC_CHARS.length)]).join('');
    }

    function composeFinalText(baseMessage) {
        let text = baseMessage;
        if (autoPadding) {
            text = text + generatePadding();
        }
        if (visibleWatermark) text = `${text}\n\n${visibleWatermark}`;
        if (autoIdEnabled) {
            text = `${text}\nID: ${autoIdPrefix}${autoIdCounter}`;
            autoIdCounter++;
        }
        return text;
    }

    const recipients = await prisma.broadcastRecipient.findMany({
        where: { broadcastId, status: 'pending' }
    });

    let sent = 0, failed = 0;

    for (const recipient of recipients) {
        try {
            const finalText = composeFinalText(broadcast.message);
            await telegramService.sendMessage(broadcast.telegramBotId, recipient.phone, finalText);
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
        await new Promise(r => setTimeout(r, tgDelay));
        if ((sent + failed) % 10 === 0) {
            const current = await prisma.broadcast.findUnique({ where: { id: broadcastId }, select: { status: true } });
            if (current?.status === 'cancelled') break;
        }
    }

    // Charge credits
    if (broadcastUserId && sent > 0) {
        try {
            const messageCreditService = require('./messageCreditService');
            const chargeCategory = broadcast.chargeCategory || 'telegram';
            const rate = await marketingService.getChargeRate(broadcastUserId, chargeCategory);
            const totalCharge = sent * rate;
            if (totalCharge > 0) {
                await messageCreditService.deductCredits(broadcastUserId, totalCharge, `Telegram Broadcast: ${broadcast.name}`, broadcastId, 'telegram_marketing');
            }
        } catch (e) {
            console.warn('[Scheduler/TG] Failed to charge credits:', e.message);
        }
    }

    const current = await prisma.broadcast.findUnique({ where: { id: broadcastId }, select: { status: true } });
    let finalStatus;
    if (current?.status === 'cancelled') finalStatus = 'cancelled';
    else if (failed === recipients.length) finalStatus = 'failed';
    else if (failed > 0 && sent > 0) finalStatus = 'partial';
    else finalStatus = 'completed';

    await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status: finalStatus, sent, failed, completedAt: new Date() }
    });

    console.log(`[Scheduler/TG] Broadcast ${broadcastId} completed: ${sent} sent, ${failed} failed`);
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
                device: { select: { status: true } },
                telegramBot: { select: { status: true } }
            }
        });

        const MAX_WAIT_MS = 24 * 60 * 60 * 1000; // 24 hours max wait for device reconnect

        for (const broadcast of dueBroadcasts) {
            // Platform-aware connectivity check (Bug 5.1)
            const isTelegram = broadcast.platform === 'TELEGRAM';
            const isConnected = isTelegram
                ? broadcast.telegramBot?.status === 'connected'
                : broadcast.device?.status === 'connected';

            if (!isConnected) {
                const waitedMs = Date.now() - new Date(broadcast.scheduledAt).getTime();

                // If waited more than 24 hours, mark as failed
                if (waitedMs > MAX_WAIT_MS) {
                    const deviceType = isTelegram ? 'bot' : 'device';
                    console.error(`[Scheduler] Broadcast ${broadcast.id} (${broadcast.name}) TIMED OUT after 24h — ${deviceType} still offline. Marking as failed.`);
                    await prisma.broadcast.update({
                        where: { id: broadcast.id },
                        data: { status: 'failed', completedAt: new Date() }
                    });
                    await prisma.broadcastRecipient.updateMany({
                        where: { broadcastId: broadcast.id, status: 'pending' },
                        data: { status: 'failed', error: `Broadcast timed out: ${deviceType} was offline for more than 24 hours` }
                    });
                } else {
                    const hoursWaited = Math.round(waitedMs / (60 * 60 * 1000) * 10) / 10;
                    console.warn(`[Scheduler] Skipping broadcast ${broadcast.id} (${broadcast.name}): ${isTelegram ? 'bot' : 'device'} not connected (waiting ${hoursWaited}h / max 24h)`);
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
