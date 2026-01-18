/**
 * Master Backup Routes
 * 
 * MASTER_ADMIN ONLY - Hidden backup management
 * These routes are only accessible to users with MASTER_ADMIN role
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireMasterAdmin } = require('../middleware/auth');
const masterBackupService = require('../services/masterBackupService');
const { successResponse, errorResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');

// All routes require authentication and MASTER_ADMIN role
router.use(authenticate);
router.use(requireMasterAdmin);

/**
 * GET /api/admin/master-backup
 * Get all backups with pagination and filters
 */
router.get('/', async (req, res, next) => {
    try {
        const {
            userId,
            includeDeleted = 'true',
            page = 1,
            limit = 50,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const result = await masterBackupService.getAllBackups({
            userId,
            includeDeleted: includeDeleted === 'true',
            page: parseInt(page),
            limit: parseInt(limit),
            sortBy,
            sortOrder
        });

        successResponse(res, result);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/admin/master-backup/stats
 * Get backup statistics
 */
router.get('/stats', async (req, res, next) => {
    try {
        const stats = await masterBackupService.getStats();
        successResponse(res, stats);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/admin/master-backup/search
 * Search backups by domain
 */
router.get('/search', async (req, res, next) => {
    try {
        const { domain } = req.query;

        if (!domain) {
            throw new AppError('Domain parameter is required', 400);
        }

        const backups = await masterBackupService.searchByDomain(domain);
        successResponse(res, backups);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/admin/master-backup/export
 * Export all backups (for disaster recovery)
 */
router.get('/export', async (req, res, next) => {
    try {
        const exportData = await masterBackupService.exportAll();

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="master-backup-${Date.now()}.json"`);
        res.send(JSON.stringify(exportData, null, 2));
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/admin/master-backup/user/:userId
 * Get all backups for a specific user
 */
router.get('/user/:userId', async (req, res, next) => {
    try {
        const backups = await masterBackupService.getByUserId(req.params.userId);
        successResponse(res, backups);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/admin/master-backup/:id
 * Get a single backup by ID
 */
router.get('/:id', async (req, res, next) => {
    try {
        const backup = await masterBackupService.getById(req.params.id);

        if (!backup) {
            throw new AppError('Backup not found', 404);
        }

        successResponse(res, backup);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/admin/master-backup/:id/restore
 * Restore a panel from backup
 */
router.post('/:id/restore', async (req, res, next) => {
    try {
        const { targetUserId } = req.body;

        const restoredPanel = await masterBackupService.restoreBackup(
            req.params.id,
            targetUserId
        );

        successResponse(res, restoredPanel, 'Panel restored from backup');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
