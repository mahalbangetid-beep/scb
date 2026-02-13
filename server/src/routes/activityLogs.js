const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { successResponse, paginatedResponse, parsePagination } = require('../utils/response');
const { ACTIONS, CATEGORIES } = require('../services/activityLog');

// GET /api/activity-logs - Get user's activity logs
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { page, limit } = parsePagination(req.query);
        const { category, action, status, startDate, endDate, search } = req.query;

        // Build Prisma where filter
        const where = { userId: req.user.id };
        if (category) where.category = category;
        if (action) where.action = action;
        if (status) where.status = status;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }
        if (search) {
            where.OR = [
                { description: { contains: search, mode: 'insensitive' } },
                { action: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } }
            ];
        }

        const prisma = require('../utils/prisma');

        const [logs, total] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: (page - 1) * limit
            }),
            prisma.activityLog.count({ where })
        ]);

        // Parse metadata JSON for each log
        const parsedLogs = logs.map(log => {
            let parsedMetadata = null;
            if (log.metadata) {
                try {
                    parsedMetadata = JSON.parse(log.metadata);
                } catch (e) {
                    parsedMetadata = { _raw: log.metadata };
                }
            }
            return { ...log, metadata: parsedMetadata };
        });

        paginatedResponse(res, parsedLogs, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// GET /api/activity-logs/stats - Get activity stats
router.get('/stats', authenticate, async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;

        // Get stats scoped to user
        const prisma = require('../utils/prisma');

        const where = { userId: req.user.id };
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const [byCategory, byStatus, byAction, total, recentCount] = await Promise.all([
            prisma.activityLog.groupBy({
                by: ['category'],
                where,
                _count: true
            }),
            prisma.activityLog.groupBy({
                by: ['status'],
                where,
                _count: true
            }),
            prisma.activityLog.groupBy({
                by: ['action'],
                where,
                _count: true,
                orderBy: { _count: { action: 'desc' } },
                take: 10
            }),
            prisma.activityLog.count({ where }),
            prisma.activityLog.count({
                where: {
                    ...where,
                    createdAt: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                    }
                }
            })
        ]);

        successResponse(res, {
            total,
            last24h: recentCount,
            byCategory: byCategory.map(c => ({ category: c.category, count: c._count })),
            byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
            byAction: byAction.map(a => ({ action: a.action, count: a._count }))
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/activity-logs/categories - Get available categories and actions
router.get('/categories', authenticate, (req, res) => {
    successResponse(res, {
        categories: Object.values(CATEGORIES),
        actions: Object.values(ACTIONS)
    });
});

module.exports = router;
