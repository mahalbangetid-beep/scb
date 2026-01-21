/**
 * Provider Domain Routes
 * 
 * API endpoints for managing provider domain mappings
 * Phase 5: Provider Integration - Hidden Domain Storage
 */

const express = require('express');
const router = express.Router();
const providerDomainService = require('../services/providerDomainService');
const { authenticate } = require('../middleware/auth');
const { successResponse, createdResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/provider-domains
 * Get all provider domain mappings
 */
router.get('/', async (req, res, next) => {
    try {
        const { search, active } = req.query;

        const options = {};
        if (search) options.search = search;
        if (active !== undefined) options.isActive = active === 'true';

        const mappings = await providerDomainService.getMappings(req.user.id, options);
        successResponse(res, mappings);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/provider-domains/stats
 * Get provider domain statistics
 */
router.get('/stats', async (req, res, next) => {
    try {
        const stats = await providerDomainService.getStats(req.user.id);
        successResponse(res, stats);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/provider-domains/:id
 * Get a single mapping
 */
router.get('/:id', async (req, res, next) => {
    try {
        const mapping = await providerDomainService.getById(req.params.id, req.user.id, true);

        if (!mapping) {
            throw new AppError('Mapping not found', 404);
        }

        successResponse(res, mapping);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/provider-domains
 * Create a new mapping
 */
router.post('/', async (req, res, next) => {
    try {
        const mapping = await providerDomainService.createMapping(req.user.id, req.body);
        createdResponse(res, providerDomainService.parseMapping(mapping), 'Provider domain mapping created');
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/provider-domains/:id
 * Update a mapping
 */
router.put('/:id', async (req, res, next) => {
    try {
        const mapping = await providerDomainService.updateMapping(
            req.params.id,
            req.user.id,
            req.body
        );
        successResponse(res, providerDomainService.parseMapping(mapping), 'Mapping updated');
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/provider-domains/:id
 * Delete a mapping
 */
router.delete('/:id', async (req, res, next) => {
    try {
        await providerDomainService.deleteMapping(req.params.id, req.user.id);
        successResponse(res, null, 'Mapping deleted');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/provider-domains/:id/toggle
 * Toggle active status
 */
router.post('/:id/toggle', async (req, res, next) => {
    try {
        const mapping = await providerDomainService.toggleActive(req.params.id, req.user.id);
        successResponse(res, providerDomainService.parseMapping(mapping),
            `Provider ${mapping.isActive ? 'activated' : 'deactivated'}`);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/provider-domains/:id/add-alias
 * Add an alias
 */
router.post('/:id/add-alias', async (req, res, next) => {
    try {
        const { alias } = req.body;
        if (!alias) {
            throw new AppError('Alias is required', 400);
        }

        const mapping = await providerDomainService.addAlias(req.params.id, req.user.id, alias);
        successResponse(res, providerDomainService.parseMapping(mapping), 'Alias added');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/provider-domains/:id/remove-alias
 * Remove an alias
 */
router.post('/:id/remove-alias', async (req, res, next) => {
    try {
        const { alias } = req.body;
        if (!alias) {
            throw new AppError('Alias is required', 400);
        }

        const mapping = await providerDomainService.removeAlias(req.params.id, req.user.id, alias);
        successResponse(res, providerDomainService.parseMapping(mapping), 'Alias removed');
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/provider-domains/find/:provider
 * Find mapping by provider name or alias
 */
router.get('/find/:provider', async (req, res, next) => {
    try {
        const mapping = await providerDomainService.findByProvider(req.user.id, req.params.provider);

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
 * POST /api/provider-domains/detect
 * Detect provider from service name
 */
router.post('/detect', async (req, res, next) => {
    try {
        const { serviceName } = req.body;
        if (!serviceName) {
            throw new AppError('Service name is required', 400);
        }

        const result = await providerDomainService.detectFromServiceName(req.user.id, serviceName);

        successResponse(res, {
            detected: !!result,
            provider: result
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/provider-domains/bulk-import
 * Bulk import mappings
 */
router.post('/bulk-import', async (req, res, next) => {
    try {
        const { mappings } = req.body;

        if (!Array.isArray(mappings) || mappings.length === 0) {
            throw new AppError('Mappings array is required', 400);
        }

        if (mappings.length > 50) {
            throw new AppError('Maximum 50 mappings per import', 400);
        }

        const results = await providerDomainService.bulkImport(req.user.id, mappings);
        successResponse(res, results, `Imported ${results.success} mappings`);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
