/**
 * Marketing Routes
 * 
 * Section 6: Marketing Page Improvements
 * - 6.1 Auto ID Numbering
 * - 6.2 Watermark Templates
 * - 6.3 Campaign Features (dedup, report)
 * - 6.4 Group Messaging
 * - 6.5 Charge Categories
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { successResponse } = require('../utils/response');
const marketingService = require('../services/marketingService');

// Apply authentication to all routes
router.use(authenticate);

// ==================== MARKETING CONFIG ====================

// GET /api/marketing/config - Get marketing configuration
router.get('/config', async (req, res, next) => {
    try {
        const config = await marketingService.getConfig(req.user.id);
        successResponse(res, {
            autoIdEnabled: config.autoIdEnabled,
            autoIdPrefix: config.autoIdPrefix,
            autoIdCounter: config.autoIdCounter,
            watermarkEnabled: config.watermarkEnabled,
            defaultWatermark: config.defaultWatermark,
            removeDuplicates: config.removeDuplicates,
            countryCode: config.countryCode,
            ownDeviceRate: config.ownDeviceRate,
            systemBotRate: config.systemBotRate,
            telegramRate: config.telegramRate
        }, 'Marketing config retrieved');
    } catch (error) {
        next(error);
    }
});

// PUT /api/marketing/config - Update marketing configuration
router.put('/config', async (req, res, next) => {
    try {
        const updated = await marketingService.updateConfig(req.user.id, req.body);
        successResponse(res, {
            autoIdEnabled: updated.autoIdEnabled,
            autoIdPrefix: updated.autoIdPrefix,
            autoIdCounter: updated.autoIdCounter,
            watermarkEnabled: updated.watermarkEnabled,
            defaultWatermark: updated.defaultWatermark,
            removeDuplicates: updated.removeDuplicates,
            countryCode: updated.countryCode,
            ownDeviceRate: updated.ownDeviceRate,
            systemBotRate: updated.systemBotRate,
            telegramRate: updated.telegramRate
        }, 'Marketing config updated');
    } catch (error) {
        next(error);
    }
});

// ==================== 6.1 AUTO ID NUMBERING ====================

// POST /api/marketing/auto-id/reset - Reset auto ID counter
router.post('/auto-id/reset', async (req, res, next) => {
    try {
        const { startFrom } = req.body;
        const config = await marketingService.resetAutoIdCounter(
            req.user.id,
            startFrom || 1
        );
        successResponse(res, {
            autoIdCounter: config.autoIdCounter,
            autoIdPrefix: config.autoIdPrefix
        }, 'Auto ID counter reset');
    } catch (error) {
        next(error);
    }
});

// GET /api/marketing/auto-id/preview - Preview next auto ID
router.get('/auto-id/preview', async (req, res, next) => {
    try {
        const config = await marketingService.getConfig(req.user.id);
        const prefix = config.autoIdPrefix || '';
        const nextId = config.autoIdCounter;
        successResponse(res, {
            enabled: config.autoIdEnabled,
            nextId,
            formattedId: `${prefix}${nextId}`,
            prefix
        }, 'Auto ID preview');
    } catch (error) {
        next(error);
    }
});

// ==================== 6.2 WATERMARK TEMPLATES ====================

// GET /api/marketing/watermarks - List watermark templates
router.get('/watermarks', async (req, res, next) => {
    try {
        const templates = await marketingService.getWatermarkTemplates(req.user.id);
        const config = await marketingService.getConfig(req.user.id);
        successResponse(res, {
            enabled: config.watermarkEnabled,
            defaultWatermark: config.defaultWatermark,
            templates
        }, 'Watermark templates retrieved');
    } catch (error) {
        next(error);
    }
});

// POST /api/marketing/watermarks - Save a watermark template
router.post('/watermarks', async (req, res, next) => {
    try {
        const { name, text } = req.body;
        if (!name || !text) {
            throw new AppError('name and text are required', 400);
        }
        if (name.length > 50) {
            throw new AppError('Template name must be 50 characters or less', 400);
        }
        if (text.length > 500) {
            throw new AppError('Watermark text must be 500 characters or less', 400);
        }
        const templates = await marketingService.saveWatermarkTemplate(req.user.id, name.trim(), text.trim());
        successResponse(res, { templates }, 'Watermark template saved');
    } catch (error) {
        next(error);
    }
});

// DELETE /api/marketing/watermarks/:name - Delete a watermark template
router.delete('/watermarks/:name', async (req, res, next) => {
    try {
        const name = decodeURIComponent(req.params.name);
        if (!name) {
            throw new AppError('Template name is required', 400);
        }
        const templates = await marketingService.deleteWatermarkTemplate(req.user.id, name);
        successResponse(res, { templates }, 'Watermark template deleted');
    } catch (error) {
        next(error);
    }
});

// ==================== 6.3 CAMPAIGN FEATURES ====================

// POST /api/marketing/dedup - Remove duplicate numbers
router.post('/dedup', async (req, res, next) => {
    try {
        const { numbers, countryCode } = req.body;
        if (!numbers || !Array.isArray(numbers)) {
            throw new AppError('numbers must be an array', 400);
        }

        const config = await marketingService.getConfig(req.user.id);
        const effectiveCountryCode = countryCode || config.countryCode || null;

        const result = marketingService.removeDuplicateNumbers(numbers, effectiveCountryCode);
        successResponse(res, result, `Removed ${result.duplicateCount} duplicates`);
    } catch (error) {
        next(error);
    }
});

// GET /api/marketing/campaign/:id/report - Get full campaign report
router.get('/campaign/:id/report', async (req, res, next) => {
    try {
        const report = await marketingService.getCampaignReport(req.params.id, req.user.id);
        if (!report) {
            throw new AppError('Campaign not found', 404);
        }
        successResponse(res, report, 'Campaign report');
    } catch (error) {
        next(error);
    }
});

// POST /api/marketing/contacts/backup - One-click number backup
router.post('/contacts/backup', async (req, res, next) => {
    try {
        const { deviceId } = req.body;
        if (!deviceId) {
            throw new AppError('deviceId is required', 400);
        }

        const contactBackupService = require('../services/contactBackupService');
        const backup = await contactBackupService.createBackup(deviceId, req.user.id, 'MANUAL');
        successResponse(res, backup, 'Contact backup created');
    } catch (error) {
        next(error);
    }
});

// ==================== 6.2 MESSAGE PREVIEW / COMPOSE ====================

// POST /api/marketing/compose - Preview final message format
// Returns: Message + Watermark + Auto Generated ID (preview only, does NOT consume IDs)
router.post('/compose', async (req, res, next) => {
    try {
        const { message, watermarkText } = req.body;
        if (!message) {
            throw new AppError('message is required', 400);
        }

        const finalMessage = await marketingService.composeFinalMessage(
            req.user.id,
            message,
            { watermarkText, preview: true }
        );

        successResponse(res, {
            original: message,
            composed: finalMessage
        }, 'Message composed');
    } catch (error) {
        next(error);
    }
});

// ==================== 6.4 GROUP MESSAGING ====================

// GET /api/marketing/groups/:deviceId - Get groups for a device
router.get('/groups/:deviceId', async (req, res, next) => {
    try {
        const whatsappService = req.app.get('whatsapp');
        const groups = await marketingService.getDeviceGroups(req.params.deviceId, req.user.id, whatsappService);
        successResponse(res, groups, 'Device groups retrieved');
    } catch (error) {
        next(error);
    }
});

// ==================== 6.5 CHARGE RATES ====================

// GET /api/marketing/charges - Get charge rates per category
router.get('/charges', async (req, res, next) => {
    try {
        const config = await marketingService.getConfig(req.user.id);
        successResponse(res, {
            ownDevice: config.ownDeviceRate,
            systemBot: config.systemBotRate,
            telegram: config.telegramRate
        }, 'Charge rates retrieved');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
