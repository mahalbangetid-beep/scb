/**
 * User Mapping Routes
 * 
 * API endpoints for managing WhatsApp-to-panel username mappings
 * Phase 1: Username & User Validation System
 */

const express = require('express');
const router = express.Router();
const userMappingService = require('../services/userMappingService');
const { authenticate } = require('../middleware/auth');
const { successResponse, createdResponse, paginatedResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/user-mappings
 * Get all mappings for current user
 */
router.get('/', async (req, res, next) => {
    try {
        const { search, verified, botEnabled, suspended, limit, offset } = req.query;

        const options = {};
        if (search) options.search = search;
        if (verified !== undefined) options.isVerified = verified === 'true';
        if (botEnabled !== undefined) options.isBotEnabled = botEnabled === 'true';
        if (suspended !== undefined) options.isAutoSuspended = suspended === 'true';
        if (limit) options.limit = parseInt(limit);
        if (offset) options.offset = parseInt(offset);

        const mappings = await userMappingService.getMappings(req.user.id, options);
        successResponse(res, mappings);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/user-mappings/stats
 * Get mapping statistics
 */
router.get('/stats', async (req, res, next) => {
    try {
        const stats = await userMappingService.getStats(req.user.id);
        successResponse(res, stats);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/user-mappings/find/by-phone/:phone
 * Find mapping by phone number
 * NOTE: Must be before /:id route
 */
router.get('/find/by-phone/:phone', async (req, res, next) => {
    try {
        const mapping = await userMappingService.findByPhone(req.user.id, req.params.phone);

        if (!mapping) {
            successResponse(res, { found: false, mapping: null });
        } else {
            successResponse(res, { found: true, mapping });
        }
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/user-mappings/find/by-username/:username
 * Find mapping by panel username
 * NOTE: Must be before /:id route
 */
router.get('/find/by-username/:username', async (req, res, next) => {
    try {
        const mapping = await userMappingService.findByUsername(req.user.id, req.params.username);

        if (!mapping) {
            successResponse(res, { found: false, mapping: null });
        } else {
            successResponse(res, { found: true, mapping });
        }
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/user-mappings/bulk-import
 * Bulk import mappings
 * NOTE: Must be before /:id route
 */
router.post('/bulk-import', async (req, res, next) => {
    try {
        const { mappings } = req.body;

        if (!Array.isArray(mappings) || mappings.length === 0) {
            throw new AppError('Mappings array is required', 400);
        }

        if (mappings.length > 100) {
            throw new AppError('Maximum 100 mappings per import', 400);
        }

        const results = await userMappingService.bulkImport(req.user.id, mappings);
        successResponse(res, results, `Imported ${results.success} mappings`);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/user-mappings/check-sender
 * Check if a sender is allowed to use bot
 * NOTE: Must be before /:id route
 */
router.post('/check-sender', async (req, res, next) => {
    try {
        const { phone, isGroup, groupId } = req.body;

        const result = await userMappingService.checkSenderAllowed(
            req.user.id,
            phone,
            isGroup || false,
            groupId
        );

        successResponse(res, result);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/user-mappings/:id
 * Get a single mapping
 * NOTE: This must be AFTER all named routes
 */
router.get('/:id', async (req, res, next) => {
    try {
        const mapping = await userMappingService.getById(req.params.id, req.user.id);

        if (!mapping) {
            throw new AppError('Mapping not found', 404);
        }

        successResponse(res, mapping);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/user-mappings
 * Create a new mapping
 */
router.post('/', async (req, res, next) => {
    try {
        console.log('[UserMapping] Creating mapping with data:', JSON.stringify(req.body));
        const mapping = await userMappingService.createMapping(req.user.id, req.body);
        createdResponse(res, userMappingService.parseMapping(mapping), 'Mapping created successfully');
    } catch (error) {
        console.error('[UserMapping] Create mapping error:', error.message, error.stack);
        next(error);
    }
});

/**
 * PUT /api/user-mappings/:id
 * Update a mapping
 */
router.put('/:id', async (req, res, next) => {
    try {
        const mapping = await userMappingService.updateMapping(
            req.params.id,
            req.user.id,
            req.body
        );
        successResponse(res, mapping, 'Mapping updated successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/user-mappings/:id
 * Delete a mapping
 */
router.delete('/:id', async (req, res, next) => {
    try {
        await userMappingService.deleteMapping(req.params.id, req.user.id);
        successResponse(res, null, 'Mapping deleted successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/user-mappings/:id/add-phone
 * Add a phone number to existing mapping
 */
router.post('/:id/add-phone', async (req, res, next) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            throw new AppError('Phone number is required', 400);
        }

        const mapping = await userMappingService.addPhone(req.params.id, req.user.id, phone);
        successResponse(res, mapping, 'Phone number added');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/user-mappings/:id/remove-phone
 * Remove a phone number from mapping
 */
router.post('/:id/remove-phone', async (req, res, next) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            throw new AppError('Phone number is required', 400);
        }

        const mapping = await userMappingService.removePhone(req.params.id, req.user.id, phone);
        successResponse(res, mapping, 'Phone number removed');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/user-mappings/:id/add-group
 * Add a group ID to mapping
 */
router.post('/:id/add-group', async (req, res, next) => {
    try {
        const { groupId } = req.body;
        if (!groupId) {
            throw new AppError('Group ID is required', 400);
        }

        const mapping = await userMappingService.addGroup(req.params.id, req.user.id, groupId);
        successResponse(res, mapping, 'Group added');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/user-mappings/:id/remove-group
 * Remove a group ID from mapping
 */
router.post('/:id/remove-group', async (req, res, next) => {
    try {
        const { groupId } = req.body;
        if (!groupId) {
            throw new AppError('Group ID is required', 400);
        }

        const mapping = await userMappingService.removeGroup(req.params.id, req.user.id, groupId);
        successResponse(res, mapping, 'Group removed');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/user-mappings/:id/toggle-bot
 * Toggle bot enabled status
 */
router.post('/:id/toggle-bot', async (req, res, next) => {
    try {
        const mapping = await userMappingService.toggleBot(req.params.id, req.user.id);
        const parsed = userMappingService.parseMapping(mapping);
        successResponse(res, parsed, `Bot ${parsed.isBotEnabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/user-mappings/:id/verify
 * Verify a mapping
 */
router.post('/:id/verify', async (req, res, next) => {
    try {
        const mapping = await userMappingService.verifyMapping(req.params.id, req.user.id, 'ADMIN');
        successResponse(res, userMappingService.parseMapping(mapping), 'Mapping verified');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/user-mappings/:id/unverify
 * Unverify a mapping
 */
router.post('/:id/unverify', async (req, res, next) => {
    try {
        const mapping = await userMappingService.unverifyMapping(req.params.id, req.user.id);
        successResponse(res, userMappingService.parseMapping(mapping), 'Verification removed');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/user-mappings/:id/suspend
 * Suspend a mapping
 */
router.post('/:id/suspend', async (req, res, next) => {
    try {
        const { reason } = req.body;
        const mapping = await userMappingService.suspendMapping(req.params.id, req.user.id, reason);
        successResponse(res, userMappingService.parseMapping(mapping), 'User suspended');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/user-mappings/:id/unsuspend
 * Unsuspend a mapping
 */
router.post('/:id/unsuspend', async (req, res, next) => {
    try {
        const mapping = await userMappingService.unsuspendMapping(req.params.id, req.user.id);
        successResponse(res, userMappingService.parseMapping(mapping), 'User unsuspended');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
