/**
 * Contact Backup Routes
 * 
 * API endpoints for WhatsApp contact backup management
 */

const express = require('express');
const router = express.Router();
const contactBackupService = require('../services/contactBackupService');
const { authenticate, requireMasterAdmin } = require('../middleware/auth');
const { successResponse, paginatedResponse, parsePagination } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const prisma = require('../utils/prisma');
const logger = require('../utils/logger').service('ContactBackupAPI');

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/contact-backup/stats
 * Get backup statistics for current user
 */
router.get('/stats', async (req, res, next) => {
    try {
        const stats = await contactBackupService.getBackupStats(req.user.id);
        successResponse(res, stats);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/contact-backup/device/:deviceId
 * Get backup history for a device
 */
router.get('/device/:deviceId', async (req, res, next) => {
    try {
        const { deviceId } = req.params;
        const { limit = 10 } = req.query;

        // Verify device ownership
        const device = await prisma.device.findFirst({
            where: { id: deviceId, userId: req.user.id }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        const backups = await contactBackupService.getBackupHistory(
            deviceId,
            req.user.id,
            parseInt(limit)
        );

        successResponse(res, {
            device: { id: device.id, name: device.name },
            backups
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/contact-backup/device/:deviceId
 * Trigger manual backup for a device
 */
router.post('/device/:deviceId', async (req, res, next) => {
    try {
        const { deviceId } = req.params;

        // Verify device ownership
        const device = await prisma.device.findFirst({
            where: { id: deviceId, userId: req.user.id }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        if (device.status !== 'connected') {
            throw new AppError('Device is not connected. Please connect the device first.', 400);
        }

        // Get WhatsApp service from app
        const whatsappService = req.app.get('whatsapp');
        if (!whatsappService) {
            throw new AppError('WhatsApp service not available', 500);
        }

        // Set service dependency
        contactBackupService.setWhatsAppService(whatsappService);

        // Create backup
        const backup = await contactBackupService.createBackup(deviceId, req.user.id, 'MANUAL');

        successResponse(res, {
            message: 'Backup created successfully',
            backup: {
                id: backup.id,
                totalContacts: backup.totalContacts,
                totalGroups: backup.totalGroups,
                fileSize: backup.fileSize,
                createdAt: backup.createdAt
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/contact-backup/:backupId
 * Get specific backup with full data
 */
router.get('/:backupId', async (req, res, next) => {
    try {
        const { backupId } = req.params;

        const backup = await contactBackupService.getBackup(backupId, req.user.id);

        if (!backup) {
            throw new AppError('Backup not found', 404);
        }

        successResponse(res, backup);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/contact-backup/:backupId/download
 * Download backup as JSON file
 */
router.get('/:backupId/download', async (req, res, next) => {
    try {
        const { backupId } = req.params;

        const backup = await contactBackupService.getBackup(backupId, req.user.id);

        if (!backup) {
            throw new AppError('Backup not found', 404);
        }

        const filename = `backup_${backup.deviceId}_${backup.createdAt.toISOString().split('T')[0]}.json`;

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        res.json({
            exportedAt: new Date().toISOString(),
            backupId: backup.id,
            deviceId: backup.deviceId,
            createdAt: backup.createdAt,
            totalContacts: backup.totalContacts,
            totalGroups: backup.totalGroups,
            contacts: backup.contacts || [],
            groups: backup.groups || []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/contact-backup/:backupId
 * Delete a backup
 */
router.delete('/:backupId', async (req, res, next) => {
    try {
        const { backupId } = req.params;

        const result = await contactBackupService.deleteBackup(backupId, req.user.id);

        if (result.count === 0) {
            throw new AppError('Backup not found', 404);
        }

        successResponse(res, null, 'Backup deleted');
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/contact-backup/device/:deviceId/latest
 * Get latest backup for a device
 */
router.get('/device/:deviceId/latest', async (req, res, next) => {
    try {
        const { deviceId } = req.params;

        // Verify device ownership
        const device = await prisma.device.findFirst({
            where: { id: deviceId, userId: req.user.id }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        const backup = await contactBackupService.getLatestBackup(deviceId, req.user.id);

        if (!backup) {
            return successResponse(res, null, 'No backup found for this device');
        }

        successResponse(res, {
            id: backup.id,
            totalContacts: backup.totalContacts,
            totalGroups: backup.totalGroups,
            fileSize: backup.fileSize,
            createdAt: backup.createdAt
        });
    } catch (error) {
        next(error);
    }
});

// ==================== MASTER ADMIN ROUTES ====================

/**
 * POST /api/contact-backup/admin/start-scheduler
 * Start auto backup scheduler (Master Admin only)
 */
router.post('/admin/start-scheduler', requireMasterAdmin, async (req, res, next) => {
    try {
        const whatsappService = req.app.get('whatsapp');
        if (!whatsappService) {
            throw new AppError('WhatsApp service not available', 500);
        }

        contactBackupService.setWhatsAppService(whatsappService);
        contactBackupService.startAutoBackup();

        successResponse(res, { message: 'Auto backup scheduler started' });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/contact-backup/admin/stop-scheduler
 * Stop auto backup scheduler (Master Admin only)
 */
router.post('/admin/stop-scheduler', requireMasterAdmin, async (req, res, next) => {
    try {
        contactBackupService.stopAutoBackup();
        successResponse(res, { message: 'Auto backup scheduler stopped' });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/contact-backup/admin/all
 * Get all backups (Master Admin only)
 */
router.get('/admin/all', requireMasterAdmin, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const [backups, total] = await Promise.all([
            prisma.contactBackup.findMany({
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip,
                include: {
                    device: { select: { name: true } },
                    user: { select: { username: true, email: true } }
                }
            }),
            prisma.contactBackup.count()
        ]);

        paginatedResponse(res, backups, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/contact-backup/admin/stats
 * Get Master Admin statistics (all users)
 */
router.get('/admin/stats', requireMasterAdmin, async (req, res, next) => {
    try {
        const stats = await contactBackupService.getMasterStats();
        successResponse(res, stats);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/contact-backup/admin/backup-all
 * Backup ALL connected devices from ALL users (Master Admin only)
 */
router.post('/admin/backup-all', requireMasterAdmin, async (req, res, next) => {
    try {
        const whatsappService = req.app.get('whatsapp');
        if (!whatsappService) {
            throw new AppError('WhatsApp service not available', 500);
        }

        contactBackupService.setWhatsAppService(whatsappService);
        const result = await contactBackupService.backupAllDevices();

        successResponse(res, result);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/contact-backup/admin/export
 * Export ALL backups as a single JSON file (Master Admin only)
 * Returns the latest backup from each device
 */
router.get('/admin/export', requireMasterAdmin, async (req, res, next) => {
    try {
        const exportData = await contactBackupService.getMasterBackupExport();

        const filename = `master_backup_${new Date().toISOString().split('T')[0]}.json`;

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        res.json(exportData);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/contact-backup/admin/backup/:backupId
 * Get specific backup (Master Admin - no ownership check)
 */
router.get('/admin/backup/:backupId', requireMasterAdmin, async (req, res, next) => {
    try {
        const { backupId } = req.params;
        const backup = await contactBackupService.getBackupAdmin(backupId);

        if (!backup) {
            throw new AppError('Backup not found', 404);
        }

        successResponse(res, backup);
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/contact-backup/admin/backup/:backupId
 * Delete any backup (Master Admin only)
 */
router.delete('/admin/backup/:backupId', requireMasterAdmin, async (req, res, next) => {
    try {
        const { backupId } = req.params;

        const backup = await prisma.contactBackup.findUnique({
            where: { id: backupId }
        });

        if (!backup) {
            throw new AppError('Backup not found', 404);
        }

        await prisma.contactBackup.delete({
            where: { id: backupId }
        });

        successResponse(res, null, 'Backup deleted');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
