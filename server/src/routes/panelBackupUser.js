/**
 * Panel Backup User Routes
 * 
 * User-facing read-only routes for viewing own panel backups.
 * Users can see their panel domain, provider aliases, and backup history.
 * 
 * All routes require authentication only (no requireAdmin).
 * All queries scoped by req.user.id for security.
 * 
 * SEPARATE from admin master backup routes (/api/admin/master-backup).
 * Admin routes remain untouched.
 * 
 * Endpoints:
 *   GET /api/panel-backup-user/           - List user's own panel backups
 *   GET /api/panel-backup-user/stats      - Get user's backup stats
 *   GET /api/panel-backup-user/:id        - Get single backup detail (own only)
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { successResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const prisma = require('../utils/prisma');

// All routes require authentication only (no admin required)
router.use(authenticate);

/**
 * GET /api/panel-backup-user/stats
 * Get user's own panel backup statistics
 */
router.get('/stats', async (req, res, next) => {
    try {
        const userId = req.user.id;

        const [total, activeBackups, deletedPanels] = await Promise.all([
            prisma.masterBackup.count({ where: { userId } }),
            prisma.masterBackup.count({ where: { userId, deletedByUser: false } }),
            prisma.masterBackup.count({ where: { userId, deletedByUser: true } })
        ]);

        res.json({
            success: true,
            data: {
                total,
                activeBackups,
                deletedPanels
            }
        });
    } catch (error) {
        console.error('[PanelBackupUser] Stats error:', error.message);
        next(error);
    }
});

/**
 * GET /api/panel-backup-user/
 * List user's own panel backups
 */
router.get('/', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { includeDeleted = 'true' } = req.query;

        const where = { userId };
        if (includeDeleted !== 'true') {
            where.deletedByUser = false;
        }

        const backups = await prisma.masterBackup.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                panelName: true,
                panelAlias: true,
                panelDomain: true,
                panelType: true,
                providerAliases: true,
                providerDomains: true,
                providerGroups: true,
                backupType: true,
                backupReason: true,
                deletedByUser: true,
                userDeletedAt: true,
                createdAt: true,
                updatedAt: true
                // NOTE: panelApiKey and panelAdminApiKey intentionally excluded
                // Users should not see raw API keys in backup view
            }
        });

        res.json({
            success: true,
            data: backups
        });
    } catch (error) {
        console.error('[PanelBackupUser] List error:', error.message);
        next(error);
    }
});

/**
 * GET /api/panel-backup-user/:id
 * Get single backup detail (own only)
 */
router.get('/:id', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const backup = await prisma.masterBackup.findFirst({
            where: { id, userId },
            select: {
                id: true,
                panelName: true,
                panelAlias: true,
                panelDomain: true,
                panelType: true,
                providerAliases: true,
                providerDomains: true,
                providerGroups: true,
                backupType: true,
                backupReason: true,
                deletedByUser: true,
                userDeletedAt: true,
                createdAt: true,
                updatedAt: true
                // NOTE: API keys excluded for security
            }
        });

        if (!backup) {
            return res.status(404).json({
                success: false,
                error: 'Backup not found'
            });
        }

        res.json({
            success: true,
            data: backup
        });
    } catch (error) {
        console.error('[PanelBackupUser] Detail error:', error.message);
        next(error);
    }
});

module.exports = router;
