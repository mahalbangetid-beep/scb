const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate, getEffectiveUserId } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { successResponse, paginatedResponse, parsePagination } = require('../utils/response');
const { watermarkService } = require('../services/watermarkService');

// All routes require authentication
router.use(authenticate);
// Resolve effective userId (staff → owner's ID, others → own ID)
router.use(async (req, res, next) => {
    try {
        req.effectiveUserId = await getEffectiveUserId(req);
        next();
    } catch (err) {
        next(err);
    }
});

// GET /api/watermarks - Get user's watermarks
router.get('/', async (req, res, next) => {
    try {
        const { page, limit } = parsePagination(req.query);
        const { onlyDetected } = req.query;

        const result = await watermarkService.getUserWatermarks(req.effectiveUserId, {
            page,
            limit,
            onlyDetected: onlyDetected === 'true'
        });

        paginatedResponse(res, result.watermarks, {
            page: result.page,
            limit: result.limit,
            total: result.total
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/watermarks/stats - Get watermark stats
router.get('/stats', async (req, res, next) => {
    try {
        const stats = await watermarkService.getUserStats(req.effectiveUserId);
        successResponse(res, stats);
    } catch (error) {
        next(error);
    }
});

// POST /api/watermarks/check - Check text for watermark
router.post('/check', async (req, res, next) => {
    try {
        const { text } = req.body;

        if (!text) {
            throw new AppError('text is required', 400);
        }

        const hasWatermark = watermarkService.hasWatermark(text);

        if (!hasWatermark) {
            successResponse(res, {
                found: false,
                message: 'No watermark detected in this text'
            });
            return;
        }

        // Try to decode and look up
        const watermark = await watermarkService.detectWatermark(text);

        if (!watermark) {
            successResponse(res, {
                found: false,
                message: 'Watermark characters detected but could not decode a valid code'
            });
            return;
        }

        // Get sender info
        let senderInfo = null;
        if (watermark.userId) {
            const user = await prisma.user.findUnique({
                where: { id: watermark.userId },
                select: { id: true, username: true, name: true, email: true }
            });
            senderInfo = user;
        }

        successResponse(res, {
            found: true,
            watermark: {
                code: watermark.code,
                sender: senderInfo,
                deviceId: watermark.deviceId,
                recipientId: watermark.recipientId,
                messagePreview: watermark.messagePreview,
                platform: watermark.platform,
                broadcastId: watermark.broadcastId,
                detectedCount: watermark.detectedCount,
                sentAt: watermark.createdAt
            }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/watermarks/embed - Manually embed watermark (for testing)
router.post('/embed', async (req, res, next) => {
    try {
        const { text } = req.body;

        if (!text) {
            throw new AppError('text is required', 400);
        }

        const { watermarkedText, watermark } = await watermarkService.createAndEmbed({
            text,
            userId: req.effectiveUserId,
            platform: 'WHATSAPP'
        });

        successResponse(res, {
            original: text,
            watermarked: watermarkedText,
            watermarkCode: watermark.code,
            note: 'The watermarked text contains invisible characters that track message origin'
        }, 'Watermark embedded successfully');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
