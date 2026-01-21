/**
 * Bot Features Routes
 * 
 * API endpoints for managing bot feature toggles
 * Phase 4: Rule-Based Bot Control
 */

const express = require('express');
const router = express.Router();
const botFeatureService = require('../services/botFeatureService');
const { authenticate } = require('../middleware/auth');
const { successResponse, createdResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/bot-features
 * Get current user's bot feature toggles
 */
router.get('/', async (req, res, next) => {
    try {
        const toggles = await botFeatureService.getToggles(req.user.id);
        successResponse(res, toggles);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/bot-features
 * Update bot feature toggles
 */
router.put('/', async (req, res, next) => {
    try {
        const updates = req.body;

        // Log high-risk feature changes
        const highRiskKeys = [
            'autoHandleFailedOrders',
            'allowForceCompleted',
            'allowLinkUpdateViaBot'
        ];

        const enabledHighRisk = highRiskKeys.filter(key => updates[key] === true);
        if (enabledHighRisk.length > 0) {
            console.log(`[BOT-FEATURES] User ${req.user.id} enabling high-risk features:`, enabledHighRisk);
        }

        const toggles = await botFeatureService.updateToggles(req.user.id, updates);
        successResponse(res, toggles, 'Bot features updated successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/bot-features/reset
 * Reset all toggles to default values
 */
router.post('/reset', async (req, res, next) => {
    try {
        const toggles = await botFeatureService.resetToDefaults(req.user.id);
        successResponse(res, toggles, 'Bot features reset to defaults');
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/bot-features/high-risk
 * Get status of high-risk features
 */
router.get('/high-risk', async (req, res, next) => {
    try {
        const status = await botFeatureService.getHighRiskStatus(req.user.id);
        successResponse(res, status);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/bot-features/command/:command
 * Check if a specific command is allowed
 */
router.get('/command/:command', async (req, res, next) => {
    try {
        const { command } = req.params;
        const allowed = await botFeatureService.isCommandAllowed(req.user.id, command);
        successResponse(res, { command, allowed });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/bot-features/toggle/:feature
 * Quick toggle a single feature on/off
 */
router.put('/toggle/:feature', async (req, res, next) => {
    try {
        const { feature } = req.params;
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            throw new AppError('enabled must be a boolean', 400);
        }

        const toggles = await botFeatureService.updateToggles(req.user.id, {
            [feature]: enabled
        });

        successResponse(res, toggles, `Feature ${feature} ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/bot-features/bulk-settings
 * Get bulk response settings
 */
router.get('/bulk-settings', async (req, res, next) => {
    try {
        const settings = await botFeatureService.getBulkSettings(req.user.id);
        successResponse(res, settings);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/bot-features/templates
 * Update provider command templates
 */
router.put('/templates', async (req, res, next) => {
    try {
        const { speedUpTemplate, refillTemplate, cancelTemplate } = req.body;

        const updates = {};
        if (speedUpTemplate) updates.providerSpeedUpTemplate = speedUpTemplate;
        if (refillTemplate) updates.providerRefillTemplate = refillTemplate;
        if (cancelTemplate) updates.providerCancelTemplate = cancelTemplate;

        const toggles = await botFeatureService.updateToggles(req.user.id, updates);
        successResponse(res, {
            providerSpeedUpTemplate: toggles.providerSpeedUpTemplate,
            providerRefillTemplate: toggles.providerRefillTemplate,
            providerCancelTemplate: toggles.providerCancelTemplate
        }, 'Templates updated');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
