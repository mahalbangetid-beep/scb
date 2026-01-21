/**
 * Master Backup Service
 * 
 * Service for managing hidden panel backups - MASTER ADMIN ONLY feature
 * 
 * Features:
 * - Auto-backup when panel is added/modified
 * - Preserve data when user deletes panel
 * - Recovery functionality
 * - Complete audit trail
 * 
 * Security: This data is ONLY visible to MASTER_ADMIN role
 */

const prisma = require('../utils/prisma');
const { encrypt } = require('../utils/encryption');

class MasterBackupService {
    /**
     * Create backup when panel is added
     * @param {Object} panel - Panel data
     * @param {Object} user - User who owns the panel
     */
    async createBackup(panel, user) {
        try {
            console.log(`[MasterBackup] Creating backup for panel "${panel.name}" (user: ${user.username})`);

            // Get provider groups for this panel
            const providerGroups = await prisma.providerGroup.findMany({
                where: { panelId: panel.id },
                select: {
                    id: true,
                    name: true,
                    providerName: true,
                    groupId: true,
                    groupName: true,
                    platform: true
                }
            });

            // Get provider domain mappings for this user
            const providerDomains = await prisma.providerDomainMapping.findMany({
                where: { userId: user.id },
                select: {
                    id: true,
                    providerName: true,
                    aliases: true,
                    panelUrl: true
                }
            });

            // Extract aliases from provider domains
            const providerAliases = [];
            for (const pd of providerDomains) {
                try {
                    const aliases = typeof pd.aliases === 'string' ? JSON.parse(pd.aliases) : pd.aliases;
                    if (Array.isArray(aliases)) {
                        providerAliases.push(...aliases.map(a => ({
                            providerName: pd.providerName,
                            alias: a
                        })));
                    }
                } catch (e) {
                    // Skip invalid JSON
                }
            }

            const backup = await prisma.masterBackup.create({
                data: {
                    userId: user.id,
                    username: user.username,
                    userEmail: user.email,
                    originalPanelId: panel.id,
                    panelName: panel.name,
                    panelAlias: panel.alias || null,
                    panelDomain: panel.url,
                    panelApiKey: panel.apiKey, // Already encrypted
                    panelAdminApiKey: panel.adminApiKey || null,
                    panelType: panel.panelType || 'GENERIC',
                    providerDomains: providerDomains.length > 0 ? providerDomains : null,
                    providerAliases: providerAliases.length > 0 ? providerAliases : null,
                    providerGroups: providerGroups.length > 0 ? providerGroups : null,
                    backupType: 'AUTO',
                    backupReason: 'Panel added'
                }
            });

            console.log(`[MasterBackup] Backup created: ${backup.id}`);
            return backup;
        } catch (error) {
            console.error('[MasterBackup] Error creating backup:', error.message);
            // Don't throw - backup failure should not affect main operation
            return null;
        }
    }

    /**
     * Update backup when panel is modified
     * @param {Object} panel - Updated panel data
     */
    async updateBackup(panel) {
        try {
            console.log(`[MasterBackup] Updating backup for panel "${panel.name}"`);

            const user = await prisma.user.findUnique({
                where: { id: panel.userId },
                select: { id: true, username: true, email: true }
            });

            if (!user) return null;

            // Get fresh provider data
            const providerGroups = await prisma.providerGroup.findMany({
                where: { panelId: panel.id },
                select: {
                    id: true,
                    name: true,
                    providerName: true,
                    groupId: true,
                    groupName: true,
                    platform: true
                }
            });

            // Check if backup exists for this panel
            let backup = await prisma.masterBackup.findFirst({
                where: { originalPanelId: panel.id },
                orderBy: { createdAt: 'desc' }
            });

            if (backup) {
                // Update existing backup
                backup = await prisma.masterBackup.update({
                    where: { id: backup.id },
                    data: {
                        panelName: panel.name,
                        panelAlias: panel.alias || null,
                        panelDomain: panel.url,
                        panelApiKey: panel.apiKey,
                        panelAdminApiKey: panel.adminApiKey || null,
                        panelType: panel.panelType || 'GENERIC',
                        providerGroups: providerGroups.length > 0 ? providerGroups : null,
                        backupReason: 'Panel updated'
                    }
                });
            } else {
                // Create new backup
                backup = await this.createBackup(panel, user);
            }

            return backup;
        } catch (error) {
            console.error('[MasterBackup] Error updating backup:', error.message);
            return null;
        }
    }

    /**
     * Mark backup as deleted (when user deletes panel)
     * @param {string} panelId - Panel being deleted
     */
    async markDeleted(panelId) {
        try {
            console.log(`[MasterBackup] Marking panel ${panelId} as deleted by user`);

            // Update all backups for this panel
            const result = await prisma.masterBackup.updateMany({
                where: { originalPanelId: panelId },
                data: {
                    deletedByUser: true,
                    userDeletedAt: new Date(),
                    backupReason: 'Panel deleted by user'
                }
            });

            console.log(`[MasterBackup] Marked ${result.count} backups as deleted`);
            return result;
        } catch (error) {
            console.error('[MasterBackup] Error marking deleted:', error.message);
            return null;
        }
    }

    /**
     * Get all backups (MASTER ADMIN only)
     * @param {Object} options - Filter options
     */
    async getAllBackups(options = {}) {
        const {
            userId,
            includeDeleted = true,
            page = 1,
            limit = 50,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = options;

        const where = {};

        if (userId) {
            where.userId = userId;
        }

        if (!includeDeleted) {
            where.deletedByUser = false;
        }

        const [backups, total] = await Promise.all([
            prisma.masterBackup.findMany({
                where,
                orderBy: { [sortBy]: sortOrder },
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.masterBackup.count({ where })
        ]);

        return {
            backups,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Get backup by ID (MASTER ADMIN only)
     * @param {string} backupId - Backup ID
     */
    async getById(backupId) {
        return prisma.masterBackup.findUnique({
            where: { id: backupId }
        });
    }

    /**
     * Get backups for a specific user (MASTER ADMIN only)
     * @param {string} userId - User ID
     */
    async getByUserId(userId) {
        return prisma.masterBackup.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Search backups by domain (MASTER ADMIN only)
     * Useful for finding who uses a specific provider
     * @param {string} domain - Domain to search
     */
    async searchByDomain(domain) {
        return prisma.masterBackup.findMany({
            where: {
                OR: [
                    { panelDomain: { contains: domain, mode: 'insensitive' } }
                ]
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Get statistics (MASTER ADMIN only)
     */
    async getStats() {
        const [
            total,
            activeBackups,
            deletedPanels,
            uniqueUsers,
            uniqueDomains
        ] = await Promise.all([
            prisma.masterBackup.count(),
            prisma.masterBackup.count({ where: { deletedByUser: false } }),
            prisma.masterBackup.count({ where: { deletedByUser: true } }),
            prisma.masterBackup.groupBy({
                by: ['userId'],
                _count: true
            }),
            prisma.masterBackup.groupBy({
                by: ['panelDomain'],
                _count: true
            })
        ]);

        return {
            total,
            activeBackups,
            deletedPanels,
            uniqueUsers: uniqueUsers.length,
            uniqueDomains: uniqueDomains.length,
            topDomains: uniqueDomains
                .sort((a, b) => b._count - a._count)
                .slice(0, 10)
                .map(d => ({ domain: d.panelDomain, count: d._count }))
        };
    }

    /**
     * Restore a deleted panel from backup (MASTER ADMIN only)
     * @param {string} backupId - Backup ID to restore
     * @param {string} targetUserId - Optional: restore to different user
     */
    async restoreBackup(backupId, targetUserId = null) {
        const backup = await prisma.masterBackup.findUnique({
            where: { id: backupId }
        });

        if (!backup) {
            throw new Error('Backup not found');
        }

        const userId = targetUserId || backup.userId;

        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            throw new Error('Target user not found');
        }

        // Check if panel with same URL already exists for this user
        const existingPanel = await prisma.smmPanel.findFirst({
            where: {
                userId,
                url: backup.panelDomain
            }
        });

        if (existingPanel) {
            throw new Error(`Panel with URL ${backup.panelDomain} already exists for this user`);
        }

        // Create new panel from backup
        const restoredPanel = await prisma.smmPanel.create({
            data: {
                userId,
                name: backup.panelName,
                alias: backup.panelAlias || `${backup.panelName} (Restored)`,
                url: backup.panelDomain,
                apiKey: backup.panelApiKey,
                adminApiKey: backup.panelAdminApiKey,
                panelType: backup.panelType || 'GENERIC',
                isActive: true
            }
        });

        // Update backup to reflect restoration
        await prisma.masterBackup.update({
            where: { id: backupId },
            data: {
                backupReason: `Restored to panel ${restoredPanel.id} at ${new Date().toISOString()}`
            }
        });

        console.log(`[MasterBackup] Restored backup ${backupId} to panel ${restoredPanel.id}`);

        return restoredPanel;
    }

    /**
     * Export all backups (MASTER ADMIN only)
     * For data portability and disaster recovery
     */
    async exportAll() {
        const backups = await prisma.masterBackup.findMany({
            orderBy: { createdAt: 'desc' }
        });

        return {
            exportedAt: new Date().toISOString(),
            totalRecords: backups.length,
            data: backups
        };
    }
}

module.exports = new MasterBackupService();
