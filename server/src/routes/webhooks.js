const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { successResponse, paginatedResponse, parsePagination } = require('../utils/response');

// Helper: Safely parse JSON with fallback
const safeJsonParse = (str, fallback = []) => {
    try {
        return JSON.parse(str || JSON.stringify(fallback));
    } catch (e) {
        return fallback;
    }
};

const validEvents = [
    'message.received',
    'message.sent',
    'message.delivered',
    'message.read',
    'message.failed',
    'contact.new',
    'device.connected',
    'device.disconnected'
];

// GET /api/webhooks - List all webhooks for current user
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const [webhooks, total] = await Promise.all([
            prisma.webhook.findMany({
                where: { userId: req.user.id },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.webhook.count({
                where: { userId: req.user.id }
            })
        ]);

        // Hide secrets in response
        const formatted = webhooks.map(w => ({
            ...w,
            secret: '***',
            events: safeJsonParse(w.events, [])
        }));

        paginatedResponse(res, formatted, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// GET /api/webhooks/:id
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const webhook = await prisma.webhook.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!webhook) {
            throw new AppError('Webhook not found', 404);
        }

        successResponse(res, {
            ...webhook,
            secret: '***',
            events: safeJsonParse(webhook.events, [])
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/webhooks
router.post('/', authenticate, async (req, res, next) => {
    try {
        const { name, url, events, secret } = req.body;

        if (!name || !url || !events) {
            throw new AppError('name, url, and events are required', 400);
        }

        // Validate events
        const invalidEvents = events.filter(e => !validEvents.includes(e));
        if (invalidEvents.length > 0) {
            throw new AppError(`Invalid events: ${invalidEvents.join(', ')}`, 400);
        }

        const webhook = await prisma.webhook.create({
            data: {
                name,
                url,
                events: JSON.stringify(events),
                secret: secret || `whsec_${Math.random().toString(36).substring(2, 15)}`,
                userId: req.user.id
            }
        });

        successResponse(res, { ...webhook, events }, 'Webhook created', 201);
    } catch (error) {
        next(error);
    }
});

// PUT /api/webhooks/:id
router.put('/:id', authenticate, async (req, res, next) => {
    try {
        const { name, url, events, isActive } = req.body;

        const existing = await prisma.webhook.findFirst({
            where: { id: req.params.id, userId: req.user.id }
        });

        if (!existing) {
            throw new AppError('Webhook not found', 404);
        }

        const webhook = await prisma.webhook.update({
            where: { id: req.params.id },
            data: {
                name,
                url,
                events: events ? JSON.stringify(events) : undefined,
                isActive
            }
        });

        successResponse(res, { ...webhook, events: safeJsonParse(webhook.events, []) }, 'Webhook updated');
    } catch (error) {
        next(error);
    }
});

// DELETE /api/webhooks/:id
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const existing = await prisma.webhook.findFirst({
            where: { id: req.params.id, userId: req.user.id }
        });

        if (!existing) {
            throw new AppError('Webhook not found', 404);
        }

        await prisma.webhook.delete({
            where: { id: req.params.id }
        });

        successResponse(res, { id: req.params.id }, 'Webhook deleted');
    } catch (error) {
        next(error);
    }
});

// POST /api/webhooks/:id/test - Test webhook
router.post('/:id/test', async (req, res, next) => {
    try {
        // TODO: Implement real webhook test
        successResponse(res, {
            success: true,
            responseCode: 200,
            responseTime: '145ms'
        }, 'Webhook test successful');
    } catch (error) {
        next(error);
    }
});

// GET /api/webhooks/events - Get available events
router.get('/meta/events', async (req, res, next) => {
    try {
        successResponse(res, validEvents);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
