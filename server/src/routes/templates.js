/**
 * Response Templates API Routes
 * 
 * Endpoints for managing customizable bot response templates
 * Feature 1: Customizable Bot Responses
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { successResponse } = require('../utils/response');
const responseTemplateService = require('../services/responseTemplateService');

/**
 * GET /api/templates
 * Get all response templates for the logged-in user
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const templates = await responseTemplateService.getAllTemplates(req.user.id);
        successResponse(res, templates, 'Templates retrieved successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/templates/reset-all
 * Reset all templates to default
 * NOTE: This route MUST be defined before /:command
 */
router.post('/reset-all', authenticate, async (req, res, next) => {
    try {
        const resetCommands = await responseTemplateService.resetAllTemplates(req.user.id);

        successResponse(res, {
            resetCommands,
            count: resetCommands.length
        }, 'All templates reset to default');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/templates/preview
 * Preview a template with sample variables
 * NOTE: This route MUST be defined before /:command
 */
router.post('/preview', authenticate, async (req, res, next) => {
    try {
        const { command, template } = req.body;

        if (!template) {
            return res.status(400).json({
                success: false,
                message: 'Template content is required'
            });
        }

        // Sample variables for preview
        const sampleVariables = {
            order_id: '12345',
            status: 'Completed',
            service: 'TikTok Followers | 30 Days ♻️',
            link: 'https://tiktok.com/@example',
            remains: '0',
            start_count: '1000',
            charge: '2.50',
            provider: 'smmnepal.com',
            provider_order_id: '7392622',
            date: new Date().toLocaleDateString(),
            guarantee: '30',
            error: 'Connection timeout',
            quantity: '500'
        };

        const preview = responseTemplateService.formatTemplate(template, sampleVariables);
        const validation = responseTemplateService.validateTemplate(command || 'STATUS_SUCCESS', template);

        successResponse(res, {
            preview,
            variables: sampleVariables,
            validation
        }, 'Template preview generated');
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/templates/:command
 * Get a specific template by command
 */
router.get('/:command', authenticate, async (req, res, next) => {
    try {
        const { command } = req.params;
        const template = await responseTemplateService.getTemplate(req.user.id, command);
        const variables = responseTemplateService.getVariables(command);

        successResponse(res, {
            command,
            template,
            variables
        }, 'Template retrieved');
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/templates/:command
 * Update or create a custom template
 */
router.put('/:command', authenticate, async (req, res, next) => {
    try {
        const { command } = req.params;
        const { template, isActive } = req.body;

        if (!template || typeof template !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Template content is required'
            });
        }

        // Validate template
        const validation = responseTemplateService.validateTemplate(command, template);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: `Invalid variables used: ${validation.invalidVariables.join(', ')}`,
                allowedVariables: validation.allowedVariables
            });
        }

        const updated = await responseTemplateService.updateTemplate(
            req.user.id,
            command,
            template,
            isActive !== undefined ? isActive : true
        );

        successResponse(res, updated, 'Template updated successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/templates/:command
 * Reset a template to default
 */
router.delete('/:command', authenticate, async (req, res, next) => {
    try {
        const { command } = req.params;
        const defaultTemplate = await responseTemplateService.resetTemplate(req.user.id, command);

        successResponse(res, {
            command,
            template: defaultTemplate?.template || null,
            resetToDefault: true
        }, 'Template reset to default');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
