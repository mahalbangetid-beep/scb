/**
 * Custom Payment Methods CRUD Routes (Admin only)
 * 
 * GET    /api/admin/custom-payments       - List all custom payment methods
 * POST   /api/admin/custom-payments       - Create new custom payment method
 * PUT    /api/admin/custom-payments/:id    - Update custom payment method
 * DELETE /api/admin/custom-payments/:id    - Delete custom payment method
 * PATCH  /api/admin/custom-payments/:id/toggle - Toggle enabled/disabled
 */

const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { successResponse, createdResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const { authenticate, requireMasterAdmin } = require('../middleware/auth');

// All routes require master admin
router.use(authenticate);
router.use(requireMasterAdmin);

// GET /api/admin/custom-payments - List all custom payment methods
router.get('/', async (req, res, next) => {
    try {
        const methods = await prisma.customPaymentMethod.findMany({
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
        });
        successResponse(res, methods);
    } catch (error) {
        next(error);
    }
});

// POST /api/admin/custom-payments - Create new custom payment method
router.post('/', async (req, res, next) => {
    try {
        const {
            name, description, icon, instructions, currency,
            minAmount, maxAmount, bonusPercent, taxPercent,
            countries, disallowedCountries, enabled, sortOrder,
            requiresProof, processingTime
        } = req.body;

        if (!name || !name.trim()) {
            throw new AppError('Payment method name is required', 400);
        }

        const method = await prisma.customPaymentMethod.create({
            data: {
                name: name.trim(),
                description: description || null,
                icon: icon || '💳',
                instructions: instructions || null,
                currency: currency || 'USD',
                minAmount: parseFloat(minAmount) || 5,
                maxAmount: parseFloat(maxAmount) || 10000,
                bonusPercent: parseFloat(bonusPercent) || 0,
                taxPercent: parseFloat(taxPercent) || 0,
                countries: countries || '*',
                disallowedCountries: disallowedCountries || null,
                enabled: enabled !== false,
                sortOrder: parseInt(sortOrder) || 0,
                requiresProof: requiresProof !== false,
                processingTime: processingTime || '1-24 hours'
            }
        });

        createdResponse(res, method, 'Custom payment method created');
    } catch (error) {
        next(error);
    }
});

// PUT /api/admin/custom-payments/:id - Update custom payment method
router.put('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            name, description, icon, instructions, currency,
            minAmount, maxAmount, bonusPercent, taxPercent,
            countries, disallowedCountries, enabled, sortOrder,
            requiresProof, processingTime
        } = req.body;

        // Check exists
        const existing = await prisma.customPaymentMethod.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError('Custom payment method not found', 404);
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name.trim();
        if (description !== undefined) updateData.description = description || null;
        if (icon !== undefined) updateData.icon = icon;
        if (instructions !== undefined) updateData.instructions = instructions || null;
        if (currency !== undefined) updateData.currency = currency;
        if (minAmount !== undefined) updateData.minAmount = parseFloat(minAmount) || 5;
        if (maxAmount !== undefined) updateData.maxAmount = parseFloat(maxAmount) || 10000;
        if (bonusPercent !== undefined) updateData.bonusPercent = parseFloat(bonusPercent) || 0;
        if (taxPercent !== undefined) updateData.taxPercent = parseFloat(taxPercent) || 0;
        if (countries !== undefined) updateData.countries = countries;
        if (disallowedCountries !== undefined) updateData.disallowedCountries = disallowedCountries || null;
        if (enabled !== undefined) updateData.enabled = enabled;
        if (sortOrder !== undefined) updateData.sortOrder = parseInt(sortOrder) || 0;
        if (requiresProof !== undefined) updateData.requiresProof = requiresProof;
        if (processingTime !== undefined) updateData.processingTime = processingTime;

        const method = await prisma.customPaymentMethod.update({
            where: { id },
            data: updateData
        });

        successResponse(res, method, 'Custom payment method updated');
    } catch (error) {
        next(error);
    }
});

// DELETE /api/admin/custom-payments/:id - Delete custom payment method
router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const existing = await prisma.customPaymentMethod.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError('Custom payment method not found', 404);
        }

        await prisma.customPaymentMethod.delete({ where: { id } });

        successResponse(res, { deleted: true }, `Deleted payment method "${existing.name}"`);
    } catch (error) {
        next(error);
    }
});

// PATCH /api/admin/custom-payments/:id/toggle - Toggle enabled/disabled
router.patch('/:id/toggle', async (req, res, next) => {
    try {
        const { id } = req.params;

        const existing = await prisma.customPaymentMethod.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError('Custom payment method not found', 404);
        }

        const method = await prisma.customPaymentMethod.update({
            where: { id },
            data: { enabled: !existing.enabled }
        });

        successResponse(res, method, `Payment method "${method.name}" ${method.enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
