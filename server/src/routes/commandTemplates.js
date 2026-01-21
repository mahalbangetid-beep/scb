/**
 * Command Templates Routes
 * 
 * API routes for managing custom bot command response templates
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { successResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const commandTemplateService = require('../services/commandTemplateService');

// All routes require authentication
router.use(authenticate);

// ==================== GET TEMPLATES ====================

/**
 * GET /api/command-templates
 * Get all templates for the current user
 */
router.get('/', async (req, res, next) => {
    try {
        const templates = await commandTemplateService.getTemplates(req.user.id);
        const variables = commandTemplateService.getAvailableVariables();
        const commandList = commandTemplateService.getCommandList();

        successResponse(res, {
            templates,
            variables,
            commandList
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/command-templates/defaults
 * Get all default templates (for reference)
 */
router.get('/defaults', async (req, res, next) => {
    try {
        const defaults = commandTemplateService.getDefaultTemplates();
        successResponse(res, defaults);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/command-templates/variables
 * Get all available template variables
 */
router.get('/variables', async (req, res, next) => {
    try {
        const variables = commandTemplateService.getAvailableVariables();
        successResponse(res, variables);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/command-templates/:command
 * Get a specific template
 */
router.get('/:command', async (req, res, next) => {
    try {
        const { command } = req.params;
        const template = await commandTemplateService.getTemplate(req.user.id, command);
        const defaults = commandTemplateService.getDefaultTemplates();

        if (!defaults[command]) {
            throw new AppError(`Unknown command: ${command}`, 400);
        }

        successResponse(res, {
            command,
            template: template || defaults[command].template,
            description: defaults[command].description,
            variables: defaults[command].variables,
            isCustom: !!template && template !== defaults[command].template
        });
    } catch (error) {
        next(error);
    }
});

// ==================== UPDATE TEMPLATES ====================

/**
 * PUT /api/command-templates/:command
 * Save/update a template for a specific command
 */
router.put('/:command', async (req, res, next) => {
    try {
        const { command } = req.params;
        const { template, isActive } = req.body;

        const defaults = commandTemplateService.getDefaultTemplates();
        if (!defaults[command]) {
            throw new AppError(`Unknown command: ${command}`, 400);
        }

        if (!template || typeof template !== 'string') {
            throw new AppError('Template content is required', 400);
        }

        const result = await commandTemplateService.saveTemplate(
            req.user.id,
            command,
            template,
            isActive !== false
        );

        successResponse(res, {
            ...result,
            message: 'Template saved successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/command-templates/preview
 * Preview a template with sample data
 */
router.post('/preview', async (req, res, next) => {
    try {
        const { template } = req.body;

        if (!template || typeof template !== 'string') {
            throw new AppError('Template content is required', 400);
        }

        const preview = commandTemplateService.previewTemplate(template);

        successResponse(res, {
            preview,
            original: template
        });
    } catch (error) {
        next(error);
    }
});

// ==================== RESET TEMPLATES ====================

/**
 * DELETE /api/command-templates/:command
 * Reset a specific template to default
 */
router.delete('/:command', async (req, res, next) => {
    try {
        const { command } = req.params;

        const defaults = commandTemplateService.getDefaultTemplates();
        if (!defaults[command]) {
            throw new AppError(`Unknown command: ${command}`, 400);
        }

        const result = await commandTemplateService.resetTemplate(req.user.id, command);

        successResponse(res, {
            ...result,
            message: 'Template reset to default'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/command-templates
 * Reset all templates to defaults
 */
router.delete('/', async (req, res, next) => {
    try {
        const templates = await commandTemplateService.resetAllTemplates(req.user.id);

        successResponse(res, {
            templates,
            message: 'All templates reset to defaults'
        });
    } catch (error) {
        next(error);
    }
});

// ==================== BULK UPDATE ====================

/**
 * POST /api/command-templates/bulk
 * Update multiple templates at once
 */
router.post('/bulk', async (req, res, next) => {
    try {
        const { templates } = req.body;

        if (!templates || !Array.isArray(templates)) {
            throw new AppError('Templates array is required', 400);
        }

        const defaults = commandTemplateService.getDefaultTemplates();
        const results = [];

        for (const item of templates) {
            if (!item.command || !item.template) continue;
            if (!defaults[item.command]) continue;

            const result = await commandTemplateService.saveTemplate(
                req.user.id,
                item.command,
                item.template,
                item.isActive !== false
            );
            results.push(result);
        }

        successResponse(res, {
            saved: results.length,
            templates: results,
            message: `${results.length} templates saved successfully`
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
