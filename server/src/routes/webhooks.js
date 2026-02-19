const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { successResponse, paginatedResponse, parsePagination } = require('../utils/response');
const { validateUrlSafety, safeAxiosRequest } = require('../utils/safeFetch');

/**
 * Validate webhook URL to prevent SSRF
 * Resolves DNS and blocks private/internal IPs (DNS rebinding safe)
 */
async function validateWebhookUrl(urlString) {
    try {
        const { url } = await validateUrlSafety(urlString);
        return url.href;
    } catch (error) {
        throw new AppError(error.message || 'Invalid or unsafe webhook URL', 400);
    }
}

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

// GET /api/webhooks/meta/events - Get available events
// NOTE: This MUST be before /:id route to prevent "meta" being matched as an ID
router.get('/meta/events', authenticate, async (req, res, next) => {
    try {
        successResponse(res, validEvents);
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

        // Validate webhook URL (SSRF prevention — resolves DNS)
        const validatedUrl = await validateWebhookUrl(url);

        const webhook = await prisma.webhook.create({
            data: {
                name,
                url: validatedUrl,
                events: JSON.stringify(events),
                secret: secret || `whsec_${crypto.randomBytes(16).toString('hex')}`,
                userId: req.user.id
            }
        });

        const webhookSecret = webhook.secret;
        successResponse(res, { ...webhook, secret: '***', events }, 'Webhook created. Save your secret: ' + webhookSecret, 201);
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

        // Validate URL if being updated (async DNS check)
        let safeUrl = url;
        if (url) {
            safeUrl = await validateWebhookUrl(url);
        }

        // Validate events if being updated
        if (events) {
            if (!Array.isArray(events)) {
                throw new AppError('events must be an array', 400);
            }
            const invalidEvents = events.filter(e => !validEvents.includes(e));
            if (invalidEvents.length > 0) {
                throw new AppError(`Invalid events: ${invalidEvents.join(', ')}`, 400);
            }
        }

        const webhook = await prisma.webhook.update({
            where: { id: req.params.id },
            data: {
                name,
                url: safeUrl,
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
router.post('/:id/test', authenticate, async (req, res, next) => {
    try {
        const webhook = await prisma.webhook.findFirst({
            where: { id: req.params.id, userId: req.user.id }
        });

        if (!webhook) {
            throw new AppError('Webhook not found', 404);
        }

        const startTime = Date.now();

        const testPayload = {
            event: 'test',
            timestamp: new Date().toISOString(),
            data: {
                message: 'This is a test webhook from SMMChatBot',
                webhookId: webhook.id
            }
        };

        try {
            // Sign payload with HMAC instead of sending raw secret
            const signature = webhook.secret
                ? crypto.createHmac('sha256', webhook.secret)
                    .update(JSON.stringify(testPayload))
                    .digest('hex')
                : undefined;

            const response = await safeAxiosRequest(webhook.url, {
                method: 'POST',
                data: testPayload,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Event': 'test',
                    ...(signature && { 'X-Webhook-Signature': `sha256=${signature}` })
                },
                timeout: 10000
            });

            const responseTime = Date.now() - startTime;

            // Log test
            await prisma.webhookLog.create({
                data: {
                    webhookId: webhook.id,
                    event: 'test',
                    payload: testPayload,
                    response: { status: response.status, data: response.data },
                    statusCode: response.status,
                    success: true
                }
            });

            successResponse(res, {
                success: true,
                responseCode: response.status,
                responseTime: `${responseTime}ms`
            }, 'Webhook test successful');
        } catch (error) {
            const responseTime = Date.now() - startTime;

            await prisma.webhookLog.create({
                data: {
                    webhookId: webhook.id,
                    event: 'test',
                    payload: testPayload,
                    response: { error: error.message },
                    statusCode: error.response?.status || 0,
                    success: false
                }
            });

            throw new AppError(`Webhook test failed: ${error.message}`, 400);
        }
    } catch (error) {
        next(error);
    }
});

module.exports = router;
