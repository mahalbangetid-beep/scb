/**
 * Keyword Response Routes
 * 
 * API endpoints for managing keyword-based auto-replies
 * From clientupdate2.md: "Create a separate section where keywords define replies"
 */

const express = require('express');
const router = express.Router();
const keywordResponseService = require('../services/keywordResponseService');
const { authenticate } = require('../middleware/auth');
const { successResponse, createdResponse, paginatedResponse, parsePagination } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');

// Safe JSON parse helper
const safeJSONParse = (str, defaultValue = {}) => {
    try {
        return JSON.parse(str || JSON.stringify(defaultValue));
    } catch {
        return defaultValue;
    }
};

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/keyword-responses
 * Get all keyword responses for current user
 */
router.get('/', async (req, res, next) => {
    try {
        const { deviceId, platform, active } = req.query;

        const options = {};
        if (deviceId) options.deviceId = deviceId;
        if (platform) options.platform = platform;
        if (active !== undefined) options.isActive = active === 'true';

        const responses = await keywordResponseService.getAll(req.user.id, options);

        // Parse actionConfig for each response
        const parsed = responses.map(r => ({
            ...r,
            actionConfig: safeJSONParse(r.actionConfig, {})
        }));

        successResponse(res, parsed);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/keyword-responses/stats
 * Get keyword response statistics
 */
router.get('/stats', async (req, res, next) => {
    try {
        const stats = await keywordResponseService.getStats(req.user.id);
        successResponse(res, stats);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/keyword-responses/:id
 * Get a single keyword response
 */
router.get('/:id', async (req, res, next) => {
    try {
        const response = await keywordResponseService.getById(req.params.id, req.user.id);

        if (!response) {
            throw new AppError('Keyword response not found', 404);
        }

        // Parse actionConfig
        const parsed = {
            ...response,
            actionConfig: safeJSONParse(response.actionConfig, {})
        };

        successResponse(res, parsed);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/keyword-responses
 * Create a new keyword response
 */
router.post('/', async (req, res, next) => {
    try {
        const { keyword, responseText, ...rest } = req.body;

        if (!keyword) {
            throw new AppError('Keyword is required', 400);
        }

        if (!responseText) {
            throw new AppError('Response text is required', 400);
        }

        const response = await keywordResponseService.create(req.user.id, {
            keyword,
            responseText,
            ...rest
        });

        createdResponse(res, {
            ...response,
            actionConfig: safeJSONParse(response.actionConfig, {})
        }, 'Keyword response created');
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/keyword-responses/:id
 * Update a keyword response
 */
router.put('/:id', async (req, res, next) => {
    try {
        const response = await keywordResponseService.update(
            req.params.id,
            req.user.id,
            req.body
        );

        successResponse(res, {
            ...response,
            actionConfig: safeJSONParse(response.actionConfig, {})
        }, 'Keyword response updated');
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/keyword-responses/:id
 * Delete a keyword response
 */
router.delete('/:id', async (req, res, next) => {
    try {
        await keywordResponseService.delete(req.params.id, req.user.id);
        successResponse(res, null, 'Keyword response deleted');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/keyword-responses/:id/toggle
 * Toggle active status
 */
router.post('/:id/toggle', async (req, res, next) => {
    try {
        const response = await keywordResponseService.toggleActive(req.params.id, req.user.id);
        successResponse(res, response, `Keyword response ${response.isActive ? 'activated' : 'deactivated'}`);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/keyword-responses/test
 * Test a message against current rules
 */
router.post('/test', async (req, res, next) => {
    try {
        const { message, platform, isGroup } = req.body;

        if (!message) {
            throw new AppError('Message is required', 400);
        }

        const match = await keywordResponseService.findMatch(req.user.id, message, {
            platform: platform || 'WHATSAPP',
            isGroup: isGroup || false
        });

        if (match) {
            successResponse(res, {
                matched: true,
                keyword: match.keyword,
                matchType: match.matchType,
                responseText: match.responseText,
                triggerAction: match.triggerAction
            });
        } else {
            successResponse(res, {
                matched: false,
                message: 'No matching keyword found'
            });
        }
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/keyword-responses/bulk
 * Bulk create keyword responses
 */
router.post('/bulk', async (req, res, next) => {
    try {
        const { items } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            throw new AppError('Items array is required', 400);
        }

        if (items.length > 50) {
            throw new AppError('Maximum 50 items per bulk operation', 400);
        }

        const results = [];
        const errors = [];

        for (const item of items) {
            try {
                if (!item.keyword || !item.responseText) {
                    errors.push({ item, error: 'keyword and responseText are required' });
                    continue;
                }

                const response = await keywordResponseService.create(req.user.id, item);
                results.push(response);
            } catch (error) {
                errors.push({ item, error: error.message });
            }
        }

        successResponse(res, {
            created: results.length,
            failed: errors.length,
            results,
            errors
        }, `${results.length} keyword responses created`);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
