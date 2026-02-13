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
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
} catch (err) {
    console.warn(`[Broadcast] Could not create upload dir: ${err.message}. Image uploads may fail.`);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
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
        let { recipients, mediaUrl } = req.body;

        // Handle recipients from form data (recipients[]) or JSON array
        if (!recipients && req.body['recipients[]']) {
            recipients = Array.isArray(req.body['recipients[]'])
                ? req.body['recipients[]']
                : [req.body['recipients[]']];
        }

        if (!name || !deviceId || !recipients || !message) {
            throw new AppError('name, deviceId, recipients, and message are required', 400);
        }

        if (!Array.isArray(recipients) || recipients.length === 0) {
            throw new AppError('recipients must be a non-empty array', 400);
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

        const campaign = await prisma.broadcast.create({
            data: {
                name,
                deviceId,
                message,
                mediaUrl: mediaUrl || null,
                status: scheduledAt ? 'scheduled' : 'processing',
                totalRecipients: recipients.length,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null
            }
        });

        // Create recipients
        const recipientData = recipients.map(phone => ({
            broadcastId: campaign.id,
            phone,
            status: 'pending'
        }));

        await prisma.broadcastRecipient.createMany({
            data: recipientData
        });

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

// Background broadcast processor
async function processBroadcast(whatsapp, broadcastId, deviceId, message, mediaUrl, userId) {
    const recipients = await prisma.broadcastRecipient.findMany({
        where: { broadcastId, status: 'pending' }
    });

    let sent = 0, failed = 0;

    for (const recipient of recipients) {
        try {
            if (mediaUrl) {
                // Embed watermark in caption for image broadcasts
                let finalCaption = message;
                if (userId) {
                    try {
                        const { watermarkService } = require('../services/watermarkService');
                        const result = await watermarkService.createAndEmbed({
                            text: message, userId, deviceId, recipientId: recipient.phone, broadcastId
                        });
                        finalCaption = result.watermarkedText;
                    } catch (e) { /* watermark is non-critical */ }
                }
                await whatsapp.sendImage(deviceId, recipient.phone, mediaUrl, finalCaption);
            } else {
                await whatsapp.sendMessage(deviceId, recipient.phone, message,
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

    console.log(`[Broadcast] Campaign ${broadcastId} completed: ${sent} sent, ${failed} failed`);
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

        if (campaign.status !== 'pending' && campaign.status !== 'scheduled') {
            throw new AppError('Only pending or scheduled campaigns can be cancelled', 400);
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
