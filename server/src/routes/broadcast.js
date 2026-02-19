const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { successResponse, paginatedResponse, parsePagination } = require('../utils/response');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Setup multer for broadcast media uploads
const UPLOAD_DIR = path.join(__dirname, '../../uploads/broadcast');
try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (err) {
    console.warn(`[Broadcast] Could not create upload dir: ${err.message}. Image uploads may fail.`);
}

// Map MIME types to safe extensions
const MIME_TO_EXT = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp'
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        // Use extension from validated MIME type, not user-controlled originalname
        const ext = MIME_TO_EXT[file.mimetype] || '.bin';
        cb(null, `broadcast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new AppError('Only image files (JPEG, PNG, GIF, WebP) are allowed', 400));
        }
    }
});
// GET /api/broadcast - List all campaigns for user
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { status } = req.query;

        const where = {
            device: {
                userId: req.user.id
            }
        };

        if (status) where.status = status;

        const [campaigns, total] = await Promise.all([
            prisma.broadcast.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    device: {
                        select: { name: true }
                    }
                }
            }),
            prisma.broadcast.count({ where })
        ]);

        paginatedResponse(res, campaigns, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// GET /api/broadcast/:id
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const campaign = await prisma.broadcast.findFirst({
            where: {
                id: req.params.id,
                device: {
                    userId: req.user.id
                }
            },
            include: {
                device: {
                    select: { name: true }
                }
            }
        });

        if (!campaign) {
            throw new AppError('Campaign not found', 404);
        }

        successResponse(res, campaign);
    } catch (error) {
        next(error);
    }
});

// POST /api/broadcast - Create and send broadcast
router.post('/', authenticate, upload.single('media'), async (req, res, next) => {
    try {
        const { name, deviceId, message, scheduledAt } = req.body;
        let { recipients, mediaUrl, broadcastType, targetGroups, watermarkText, autoIdEnabled, chargeCategory } = req.body;

        // Section 6.4: Determine broadcast type
        broadcastType = broadcastType || 'number'; // number, group, both

        // Handle recipients from form data (recipients[]) or JSON array
        if (!recipients && req.body['recipients[]']) {
            recipients = Array.isArray(req.body['recipients[]'])
                ? req.body['recipients[]']
                : [req.body['recipients[]']];
        }

        // Parse targetGroups if string
        if (targetGroups && typeof targetGroups === 'string') {
            try { targetGroups = JSON.parse(targetGroups); } catch { targetGroups = [targetGroups]; }
        }

        // Validate required fields first
        if (!name || !deviceId || !message) {
            throw new AppError('name, deviceId, and message are required', 400);
        }

        // Validate based on broadcast type
        if (broadcastType === 'group') {
            // Group-only: requires targetGroups, recipients optional
            if (!targetGroups || (Array.isArray(targetGroups) && targetGroups.length === 0)) {
                throw new AppError('targetGroups is required for group broadcast', 400);
            }
        } else if (broadcastType === 'both') {
            // Both: requires at least one of recipients or targetGroups
            const hasRecipients = recipients && Array.isArray(recipients) && recipients.length > 0;
            const hasGroups = targetGroups && Array.isArray(targetGroups) && targetGroups.length > 0;
            if (!hasRecipients && !hasGroups) {
                throw new AppError('At least one of recipients or targetGroups is required for combined broadcast', 400);
            }
        } else {
            // Number-only: requires recipients
            if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
                throw new AppError('recipients must be a non-empty array', 400);
            }
        }

        // Section 6.3: Auto duplicate removal with country code normalization
        const marketingService = require('../services/marketingService');
        // Pre-fetch config (needed for dedup, auto ID, watermark, charges)
        const mktConfig = await marketingService.getConfig(req.user.id);

        if (recipients && recipients.length > 0) {
            // Validate and clean recipient phone numbers
            recipients = recipients
                .map(r => String(r).trim().replace(/[^\d+]/g, ''))
                .filter(r => r.length >= 5);

            if (recipients.length === 0) {
                throw new AppError('No valid phone numbers found in recipients', 400);
            }

            // Auto-remove duplicates (Section 6.3)
            if (mktConfig.removeDuplicates) {
                const dedupResult = marketingService.removeDuplicateNumbers(recipients, mktConfig.countryCode);
                if (dedupResult.duplicateCount > 0) {
                    console.log(`[Broadcast] Removed ${dedupResult.duplicateCount} duplicate numbers`);
                }
                recipients = dedupResult.unique;
            }
        }

        // If file was uploaded via multer, use its path as mediaUrl
        if (req.file && !mediaUrl) {
            mediaUrl = req.file.path; // Absolute file path — Baileys accepts local file paths
        }

        // Verify device ownership
        const device = await prisma.device.findFirst({
            where: { id: deviceId, userId: req.user.id }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        if (device.status !== 'connected') {
            throw new AppError('Device is not connected', 400);
        }

        // Section 6.1 & 6.2: Compose final message (Message + Watermark + Auto ID)
        const useAutoId = autoIdEnabled !== undefined ? autoIdEnabled === true || autoIdEnabled === 'true' : mktConfig.autoIdEnabled;
        let autoIdStart = null;
        const autoIdPrefix = mktConfig.autoIdPrefix || '';

        // Determine total recipients including groups (needed for ID reservation)
        const totalRecipients = (recipients ? recipients.length : 0) + (targetGroups ? targetGroups.length : 0);

        if (useAutoId) {
            autoIdStart = mktConfig.autoIdCounter;

            // BUG #9 fix: Immediately reserve the ID range by advancing the counter
            // This prevents duplicate IDs when multiple broadcasts are created concurrently
            await prisma.marketingConfig.update({
                where: { userId: req.user.id },
                data: { autoIdCounter: { increment: totalRecipients } }
            });
        }

        // Section 6.5: Charge category
        const effectiveChargeCategory = chargeCategory || (device.isSystemBot ? 'system_bot' : 'own_device');

        const campaign = await prisma.broadcast.create({
            data: {
                name,
                deviceId,
                message,
                mediaUrl: mediaUrl || null,
                status: scheduledAt ? 'scheduled' : 'processing',
                totalRecipients,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                // Section 6.1
                autoIdEnabled: useAutoId,
                autoIdStart,
                autoIdPrefix,  // BUG #12 fix: snapshot prefix at create time
                // Section 6.2
                watermarkText: watermarkText || (mktConfig.watermarkEnabled ? mktConfig.defaultWatermark : null),
                // Section 6.4
                broadcastType,
                targetGroups: targetGroups || null,
                // Section 6.5
                chargeCategory: effectiveChargeCategory
            }
        });

        // Create recipients for number broadcast
        if (recipients && recipients.length > 0) {
            const recipientData = recipients.map(phone => ({
                broadcastId: campaign.id,
                phone,
                status: 'pending'
            }));

            await prisma.broadcastRecipient.createMany({
                data: recipientData
            });
        }

        // Process broadcast in background (don't await)
        if (!scheduledAt) {
            processBroadcast(req.app.get('whatsapp'), campaign.id, deviceId, message, mediaUrl, req.user.id)
                .catch(err => console.error('[Broadcast] Error:', err.message));
        }

        successResponse(res, campaign, 'Broadcast campaign created', 201);
    } catch (error) {
        next(error);
    }
});

// Background broadcast processor — Section 6 enhanced
async function processBroadcast(whatsapp, broadcastId, deviceId, message, mediaUrl, userId) {
    try {
        const broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
        if (!broadcast) return;

        const marketingService = require('../services/marketingService');
        const { watermarkService } = require('../services/watermarkService');

        // Auto ID counter for this campaign
        let autoIdCounter = broadcast.autoIdStart || 1;
        const autoIdEnabled = broadcast.autoIdEnabled;
        const visibleWatermark = broadcast.watermarkText;

        // BUG #12 fix: use prefix from broadcast record (snapshot at create time)
        const autoIdPrefix = broadcast.autoIdPrefix || '';

        // Compose a per-message final text: Message + Watermark + Auto ID (Section 6.2)
        function composeFinalText(baseMessage) {
            let text = baseMessage;
            // Step 1: Add visible watermark (Section 6.2)
            if (visibleWatermark) {
                text = `${text}\n\n${visibleWatermark}`;
            }
            // Step 2: Add auto ID with prefix (Section 6.1)
            if (autoIdEnabled) {
                text = `${text}\nID: ${autoIdPrefix}${autoIdCounter}`;
                autoIdCounter++;
            }
            return text;
        }

        // ==================== PHASE 1: SEND TO NUMBER RECIPIENTS ====================
        const recipients = await prisma.broadcastRecipient.findMany({
            where: { broadcastId, status: 'pending' }
        });

        let sent = 0, failed = 0;

        for (const recipient of recipients) {
            try {
                const finalText = composeFinalText(message);

                if (mediaUrl) {
                    // Embed ZWC watermark in caption for tracking
                    let finalCaption = finalText;
                    if (userId) {
                        try {
                            const result = await watermarkService.createAndEmbed({
                                text: finalText, userId, deviceId, recipientId: recipient.phone, broadcastId
                            });
                            finalCaption = result.watermarkedText;
                        } catch (e) { /* watermark is non-critical */ }
                    }
                    await whatsapp.sendImage(deviceId, recipient.phone, mediaUrl, finalCaption);
                } else {
                    await whatsapp.sendMessage(deviceId, recipient.phone, finalText,
                        userId ? { userId, broadcastId } : null
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

            // Delay between messages to avoid spam detection
            await new Promise(r => setTimeout(r, 1500));

            // Check if campaign was cancelled mid-processing
            if ((sent + failed) % 10 === 0) {
                const current = await prisma.broadcast.findUnique({ where: { id: broadcastId }, select: { status: true } });
                if (current?.status === 'cancelled') {
                    console.log(`[Broadcast] Campaign ${broadcastId} was cancelled, stopping processing.`);
                    break;
                }
            }
        }

        // ==================== PHASE 2: SEND TO GROUP TARGETS (Section 6.4) ====================
        let targetGroups = broadcast.targetGroups;
        if (targetGroups && typeof targetGroups === 'string') {
            try { targetGroups = JSON.parse(targetGroups); } catch { targetGroups = []; }
        }

        if (Array.isArray(targetGroups) && targetGroups.length > 0) {
            for (const groupJid of targetGroups) {
                // Check cancellation
                const current = await prisma.broadcast.findUnique({ where: { id: broadcastId }, select: { status: true } });
                if (current?.status === 'cancelled') break;

                try {
                    const finalText = composeFinalText(message);

                    if (mediaUrl) {
                        await whatsapp.sendImage(deviceId, groupJid, mediaUrl, finalText);
                    } else {
                        await whatsapp.sendMessage(deviceId, groupJid, finalText,
                            userId ? { userId, broadcastId } : null
                        );
                    }
                    sent++;
                } catch (error) {
                    console.error(`[Broadcast] Failed to send to group ${groupJid}:`, error.message);
                    failed++;
                }

                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // PHASE 3 (REMOVED): Auto ID counter update no longer needed here.
        // IDs are now reserved upfront at broadcast creation time (BUG #9 fix).
        // Updating the counter here would overwrite IDs already reserved by newer campaigns.

        // ==================== PHASE 4: CHARGE CREDITS (Section 6.5) ====================
        if (userId && sent > 0) {
            try {
                const messageCreditService = require('../services/messageCreditService');
                const chargeCategory = broadcast.chargeCategory || 'own_device';
                const rate = await marketingService.getChargeRate(userId, chargeCategory);
                const totalCharge = sent * rate;

                if (totalCharge > 0) {
                    await messageCreditService.deductCredits(
                        userId, totalCharge,
                        `Broadcast: ${broadcast.name} (${chargeCategory})`,
                        broadcastId
                    );
                    console.log(`[Broadcast] Charged ${totalCharge} credits for ${sent} messages (${chargeCategory})`);
                }
            } catch (e) {
                console.warn('[Broadcast] Failed to charge credits:', e.message);
                // Don't fail the entire broadcast for a billing error
            }
        }

        // ==================== PHASE 5: UPDATE CAMPAIGN STATUS ====================
        const current = await prisma.broadcast.findUnique({ where: { id: broadcastId }, select: { status: true } });
        const totalTargets = recipients.length + (Array.isArray(targetGroups) ? targetGroups.length : 0);
        let finalStatus;
        if (current?.status === 'cancelled') {
            finalStatus = 'cancelled';
        } else if (failed === totalTargets) {
            finalStatus = 'failed';
        } else if (failed > 0 && sent > 0) {
            finalStatus = 'partial';
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

        console.log(`[Broadcast] Campaign ${broadcastId} completed: ${sent} sent, ${failed} failed`);
    } catch (error) {
        console.error(`[Broadcast] Campaign ${broadcastId} crashed:`, error.message);
        // Mark as failed so it doesn't stay stuck in 'processing'
        await prisma.broadcast.update({
            where: { id: broadcastId },
            data: { status: 'failed', completedAt: new Date() }
        }).catch(() => { });
    }
}

// POST /api/broadcast/:id/cancel - Cancel pending broadcast
router.post('/:id/cancel', authenticate, async (req, res, next) => {
    try {
        const campaign = await prisma.broadcast.findFirst({
            where: {
                id: req.params.id,
                device: { userId: req.user.id }
            }
        });

        if (!campaign) {
            throw new AppError('Campaign not found', 404);
        }

        if (!['pending', 'scheduled', 'processing'].includes(campaign.status)) {
            throw new AppError('Only pending, scheduled, or in-progress campaigns can be cancelled', 400);
        }

        const updated = await prisma.broadcast.update({
            where: { id: req.params.id },
            data: { status: 'cancelled' }
        });

        successResponse(res, updated, 'Broadcast cancelled');
    } catch (error) {
        next(error);
    }
});

// GET /api/broadcast/:id/recipients - Get recipients status
router.get('/:id/recipients', authenticate, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const where = {
            broadcastId: req.params.id,
            broadcast: {
                device: { userId: req.user.id }
            }
        };

        const [recipients, total] = await Promise.all([
            prisma.broadcastRecipient.findMany({
                where,
                skip,
                take: limit,
                orderBy: { id: 'asc' }
            }),
            prisma.broadcastRecipient.count({ where })
        ]);

        paginatedResponse(res, recipients, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
