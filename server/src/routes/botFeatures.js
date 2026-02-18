/**
 * Bot Features Routes
 * 
 * API endpoints for managing bot feature toggles
 * Phase 4: Rule-Based Bot Control
 * 
 * Supports per-device and per-panel scoping via query parameters:
 *   ?deviceId=xxx&panelId=yyy
 * 
 * Fallback chain: device+panel → panel → device → user default
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
 * Helper: extract scope from query params
 */
function getScope(query) {
    const scope = {};
    if (query.deviceId) scope.deviceId = query.deviceId;
    if (query.panelId) scope.panelId = query.panelId;
    return scope;
}

/**
 * GET /api/bot-features
 * Get current user's bot feature toggles
 * Query: ?deviceId=xxx&panelId=yyy (optional scope)
 */
router.get('/', async (req, res, next) => {
    try {
        const scope = getScope(req.query);
        const toggles = await botFeatureService.getToggles(req.user.id, scope);
        successResponse(res, toggles);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/bot-features/scopes
 * List all scoped configs for the current user
 * Shows default + per-device + per-panel + per-device+panel configs
 */
router.get('/scopes', async (req, res, next) => {
    try {
        const scopes = await botFeatureService.getAllScopes(req.user.id);
        successResponse(res, scopes);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/bot-features
 * Update bot feature toggles
 * Query: ?deviceId=xxx&panelId=yyy (optional scope)
 */
router.put('/', async (req, res, next) => {
    try {
        const scope = getScope(req.query);
        const updates = req.body;

        // Sanitize numeric fields to prevent NaN reaching Prisma
        const numericKeys = [
            'bulkResponseThreshold', 'maxBulkOrders',
            'repeatedCallThreshold', 'repeatedCallWindowMinutes',
            'spamRepeatThreshold', 'spamTimeWindowMinutes', 'spamDisableDurationMin'
        ];
        for (const key of numericKeys) {
            if (updates[key] !== undefined) {
                const val = parseInt(updates[key], 10);
                if (isNaN(val)) {
                    delete updates[key]; // Skip invalid numeric values
                } else {
                    updates[key] = val;
                }
            }
        }

        // Sanitize nullable text fields: convert empty strings to null
        // This ensures scope inheritance works correctly (empty string would override parent)
        const nullableTextKeys = [
            'fallbackMessage', 'callReplyMessage', 'groupCallReplyMessage',
            'repeatedCallReplyMessage', 'spamWarningMessage',
            'massCommandReplyTemplate', 'massForwardingTemplate', 'massSupportReplyTemplate'
        ];
        for (const key of nullableTextKeys) {
            if (updates[key] !== undefined && (updates[key] === '' || updates[key] === null)) {
                updates[key] = null;
            }
        }

        // Log high-risk feature changes
        const highRiskKeys = [
            'autoHandleFailedOrders',
            'allowForceCompleted',
            'allowLinkUpdateViaBot'
        ];

        const enabledHighRisk = highRiskKeys.filter(key => updates[key] === true);
        if (enabledHighRisk.length > 0) {
            console.log(`[BOT-FEATURES] User ${req.user.id} enabling high-risk features:`, enabledHighRisk,
                scope.deviceId ? `Device: ${scope.deviceId}` : '',
                scope.panelId ? `Panel: ${scope.panelId}` : '');
        }

        const toggles = await botFeatureService.updateToggles(req.user.id, updates, scope);
        successResponse(res, toggles, 'Bot features updated successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/bot-features/reset
 * Reset all toggles to default values
 * Query: ?deviceId=xxx&panelId=yyy (optional scope)
 */
router.post('/reset', async (req, res, next) => {
    try {
        const scope = getScope(req.query);
        const toggles = await botFeatureService.resetToDefaults(req.user.id, scope);
        successResponse(res, toggles, 'Bot features reset to defaults');
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/bot-features/scope/:id
 * Delete a scoped config (reverts to parent fallback)
 * Cannot delete the user default config
 */
router.delete('/scope/:id', async (req, res, next) => {
    try {
        const result = await botFeatureService.deleteScope(req.user.id, req.params.id);
        successResponse(res, result, 'Scoped config deleted');
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/bot-features/high-risk
 * Get status of high-risk features
 * Query: ?deviceId=xxx&panelId=yyy (optional scope)
 */
router.get('/high-risk', async (req, res, next) => {
    try {
        const scope = getScope(req.query);
        const status = await botFeatureService.getHighRiskStatus(req.user.id, scope);
        successResponse(res, status);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/bot-features/command/:command
 * Check if a specific command is allowed
 * Query: ?deviceId=xxx&panelId=yyy (optional scope)
 */
router.get('/command/:command', async (req, res, next) => {
    try {
        const scope = getScope(req.query);
        const { command } = req.params;
        const allowed = await botFeatureService.isCommandAllowed(req.user.id, command, scope);
        successResponse(res, { command, allowed });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/bot-features/toggle/:feature
 * Quick toggle a single feature on/off
 * Query: ?deviceId=xxx&panelId=yyy (optional scope)
 */
router.put('/toggle/:feature', async (req, res, next) => {
    try {
        const scope = getScope(req.query);
        const { feature } = req.params;
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            throw new AppError('enabled must be a boolean', 400);
        }

        const toggles = await botFeatureService.updateToggles(req.user.id, {
            [feature]: enabled
        }, scope);

        successResponse(res, toggles, `Feature ${feature} ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/bot-features/bulk-settings
 * Get bulk response settings
 * Query: ?deviceId=xxx&panelId=yyy (optional scope)
 */
router.get('/bulk-settings', async (req, res, next) => {
    try {
        const scope = getScope(req.query);
        const settings = await botFeatureService.getBulkSettings(req.user.id, scope);
        successResponse(res, settings);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/bot-features/templates
 * Update provider command templates
 * Query: ?deviceId=xxx&panelId=yyy (optional scope)
 */
router.put('/templates', async (req, res, next) => {
    try {
        const scope = getScope(req.query);
        const { speedUpTemplate, refillTemplate, cancelTemplate } = req.body;

        const updates = {};
        if (speedUpTemplate) updates.providerSpeedUpTemplate = speedUpTemplate;
        if (refillTemplate) updates.providerRefillTemplate = refillTemplate;
        if (cancelTemplate) updates.providerCancelTemplate = cancelTemplate;

        const toggles = await botFeatureService.updateToggles(req.user.id, updates, scope);
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
