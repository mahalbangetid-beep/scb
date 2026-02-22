/**
 * Panel Tools Routes
 * 
 * API endpoints for:
 * 1. Manual Services (per panel)
 * 2. Failed Orders (per panel)
 * 3. Service Forward Rules (per panel)
 */

const express = require('express');
const router = express.Router();
const panelToolsService = require('../services/panelToolsService');
const { authenticate } = require('../middleware/auth');
const { successResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');

router.use(authenticate);

// ==================== MANUAL SERVICES ====================

router.get('/:panelId/manual-services', async (req, res, next) => {
    try {
        const services = await panelToolsService.getManualServices(req.user.id, req.params.panelId);
        successResponse(res, services);
    } catch (error) { next(error); }
});

router.post('/:panelId/manual-services', async (req, res, next) => {
    try {
        const { serviceId, serviceName } = req.body;
        if (!serviceId || !serviceName) throw new AppError('serviceId and serviceName are required', 400);
        const service = await panelToolsService.createManualService(req.user.id, req.params.panelId, req.body);
        successResponse(res, service, 'Manual service created');
    } catch (error) { next(error); }
});

router.put('/:panelId/manual-services/:id', async (req, res, next) => {
    try {
        const service = await panelToolsService.updateManualService(req.params.id, req.user.id, req.body);
        successResponse(res, service, 'Manual service updated');
    } catch (error) { next(error); }
});

router.delete('/:panelId/manual-services/:id', async (req, res, next) => {
    try {
        await panelToolsService.deleteManualService(req.params.id, req.user.id);
        successResponse(res, null, 'Manual service deleted');
    } catch (error) { next(error); }
});

// ==================== FAILED ORDERS ====================

router.get('/:panelId/failed-orders', async (req, res, next) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const result = await panelToolsService.getFailedOrders(req.user.id, req.params.panelId, {
            page: parseInt(page), limit: parseInt(limit)
        });
        successResponse(res, result);
    } catch (error) { next(error); }
});

// ==================== SERVICE FORWARD RULES ====================

router.get('/:panelId/forward-rules', async (req, res, next) => {
    try {
        const rules = await panelToolsService.getServiceForwardRules(req.user.id, req.params.panelId);
        successResponse(res, rules);
    } catch (error) { next(error); }
});

router.post('/:panelId/forward-rules', async (req, res, next) => {
    try {
        const { serviceId } = req.body;
        if (!serviceId) throw new AppError('serviceId is required', 400);
        const rule = await panelToolsService.createServiceForwardRule(req.user.id, req.params.panelId, req.body);
        successResponse(res, rule, 'Forward rule created');
    } catch (error) { next(error); }
});

router.put('/:panelId/forward-rules/:id', async (req, res, next) => {
    try {
        const rule = await panelToolsService.updateServiceForwardRule(req.params.id, req.user.id, req.body);
        successResponse(res, rule, 'Forward rule updated');
    } catch (error) { next(error); }
});

router.delete('/:panelId/forward-rules/:id', async (req, res, next) => {
    try {
        await panelToolsService.deleteServiceForwardRule(req.params.id, req.user.id);
        successResponse(res, null, 'Forward rule deleted');
    } catch (error) { next(error); }
});

module.exports = router;
