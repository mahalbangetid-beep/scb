/**
 * Contact Backup Service
 * 
 * Service untuk auto backup kontak WhatsApp
 * Backup dilakukan secara otomatis setiap interval tertentu
 * 
 * Features:
 * - Auto backup contacts & groups
 * - Manual backup trigger
 * - Backup history & retrieval
 * - Auto cleanup old backups
 */

const prisma = require('../utils/prisma');
const logger = require('../utils/logger').service('ContactBackup');

class ContactBackupService {
    constructor() {
        this.whatsappService = null;
        this.backupInterval = null;
        this.BACKUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
        this.MAX_BACKUPS_PER_DEVICE = 10; // Keep last 10 backups per device
    }

    /**
     * Set dependencies
     */
    setWhatsAppService(whatsappService) {
        this.whatsappService = whatsappService;
    }

    /**
     * Start auto backup scheduler
     */
    startAutoBackup() {
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
        }

        logger.info(`Starting auto backup scheduler (every ${this.BACKUP_INTERVAL_MS / 60000} minutes)`);

        this.backupInterval = setInterval(async () => {
            await this.runAutoBackup();
        }, this.BACKUP_INTERVAL_MS);

        // Run first backup after 1 minute
        setTimeout(() => {
            this.runAutoBackup();
        }, 60000);
    }

    /**
     * Stop auto backup scheduler
     */
    stopAutoBackup() {
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
            this.backupInterval = null;
            logger.info('Auto backup scheduler stopped');
        }
    }

    /**
     * Run auto backup for all connected devices
     */
    async runAutoBackup() {
        if (!this.whatsappService) {
            logger.warn('WhatsApp service not available, skipping auto backup');
            return;
        }

        try {
            // Get all connected devices
            const devices = await prisma.device.findMany({
                where: {
                    type: 'WHATSAPP',
                    status: 'connected'
                },
                include: {
                    user: {
                        select: { id: true, role: true }
                    }
                }
            });

            if (devices.length === 0) {
                logger.info('No connected devices, skipping auto backup');
                return;
            }

            logger.info(`Running auto backup for ${devices.length} device(s)`);

            for (const device of devices) {
                try {
                    await this.createBackup(device.id, device.userId, 'AUTO');
                } catch (error) {
                    logger.error(`Failed to backup device ${device.id}:`, error.message);
                }
            }

        } catch (error) {
            logger.error('Auto backup error:', error.message);
        }
    }

    /**
     * Create backup for a specific device
     * @param {string} deviceId - Device ID
     * @param {string} userId - User ID
     * @param {string} backupType - AUTO or MANUAL
     */
    async createBackup(deviceId, userId, backupType = 'MANUAL') {
        logger.info(`Creating ${backupType} backup for device ${deviceId}`);

        try {
            // Get WhatsApp session
            const session = this.whatsappService?.getSession(deviceId);
            if (!session) {
                throw new Error('WhatsApp session not found or not connected');
            }

            // Fetch contacts from session store
            let contacts = [];
            let groups = [];

            // Try to get contacts from store
            if (session.store?.contacts) {
                const contactStore = session.store.contacts;

                // Convert to array
                if (typeof contactStore.toJSON === 'function') {
                    const contactData = contactStore.toJSON();
                    contacts = Object.values(contactData || {}).map(c => ({
                        jid: c.id,
                        name: c.name || c.notify || null,
                        pushName: c.notify || null,
                        phone: c.id?.replace('@s.whatsapp.net', '').replace('@c.us', '') || null
                    }));
                } else if (typeof contactStore === 'object') {
                    contacts = Object.entries(contactStore).map(([jid, c]) => ({
                        jid,
                        name: c?.name || c?.notify || null,
                        pushName: c?.notify || null,
                        phone: jid?.replace('@s.whatsapp.net', '').replace('@c.us', '') || null
                    }));
                }
            }

            // Try to get groups
            if (session.store?.chats) {
                const chatStore = session.store.chats;

                if (typeof chatStore.toJSON === 'function') {
                    const chatData = chatStore.toJSON();
                    groups = Object.values(chatData || {})
                        .filter(c => c.id?.endsWith('@g.us'))
                        .map(g => ({
                            jid: g.id,
                            name: g.name || g.subject || 'Unnamed Group',
                            subject: g.subject || null,
                            participantCount: g.participants?.length || 0
                        }));
                } else if (typeof chatStore === 'object') {
                    groups = Object.entries(chatStore)
                        .filter(([jid]) => jid.endsWith('@g.us'))
                        .map(([jid, g]) => ({
                            jid,
                            name: g?.name || g?.subject || 'Unnamed Group',
                            subject: g?.subject || null,
                            participantCount: g?.participants?.length || 0
                        }));
                }
            }

            // Filter out invalid entries
            contacts = contacts.filter(c => c.jid && !c.jid.endsWith('@g.us'));

            // Calculate file size estimate
            const dataString = JSON.stringify({ contacts, groups });
            const fileSize = Buffer.byteLength(dataString, 'utf8');

            // Create backup record
            const backup = await prisma.contactBackup.create({
                data: {
                    deviceId,
                    userId,
                    backupType,
                    totalContacts: contacts.length,
                    totalGroups: groups.length,
                    contacts: contacts,
                    groups: groups,
                    fileSize,
                    status: 'COMPLETED',
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
                }
            });

            logger.info(`✅ Backup completed: ${contacts.length} contacts, ${groups.length} groups`);

            // Cleanup old backups
            await this.cleanupOldBackups(deviceId);

            return backup;

        } catch (error) {
            logger.error(`Backup failed for device ${deviceId}:`, error.message);

            // Record failed backup
            await prisma.contactBackup.create({
                data: {
                    deviceId,
                    userId,
                    backupType,
                    status: 'FAILED',
                    errorMessage: error.message
                }
            });

            throw error;
        }
    }

    /**
     * Cleanup old backups, keep only last N backups per device
     */
    async cleanupOldBackups(deviceId) {
        try {
            // Get all backups for device, ordered by date
            const backups = await prisma.contactBackup.findMany({
                where: { deviceId },
                orderBy: { createdAt: 'desc' },
                select: { id: true }
            });

            // Delete backups beyond the limit
            if (backups.length > this.MAX_BACKUPS_PER_DEVICE) {
                const toDelete = backups.slice(this.MAX_BACKUPS_PER_DEVICE).map(b => b.id);

                await prisma.contactBackup.deleteMany({
                    where: { id: { in: toDelete } }
                });

                logger.info(`Cleaned up ${toDelete.length} old backups for device ${deviceId}`);
            }
        } catch (error) {
            logger.error('Cleanup old backups error:', error.message);
        }
    }

    /**
     * Get backup history for a device
     */
    async getBackupHistory(deviceId, userId, limit = 10) {
        return prisma.contactBackup.findMany({
            where: { deviceId, userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                backupType: true,
                totalContacts: true,
                totalGroups: true,
                fileSize: true,
                status: true,
                errorMessage: true,
                createdAt: true
            }
        });
    }

    /**
     * Get specific backup with full data
     */
    async getBackup(backupId, userId) {
        return prisma.contactBackup.findFirst({
            where: { id: backupId, userId }
        });
    }

    /**
     * Get latest backup for a device
     */
    async getLatestBackup(deviceId, userId) {
        return prisma.contactBackup.findFirst({
            where: {
                deviceId,
                userId,
                status: 'COMPLETED'
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Delete a backup
     */
    async deleteBackup(backupId, userId) {
        return prisma.contactBackup.deleteMany({
            where: { id: backupId, userId }
        });
    }

    /**
     * Get backup statistics for user
     */
    async getBackupStats(userId) {
        const [totalBackups, latestBackups, deviceStats] = await Promise.all([
            prisma.contactBackup.count({
                where: { userId, status: 'COMPLETED' }
            }),
            prisma.contactBackup.findMany({
                where: { userId, status: 'COMPLETED' },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: {
                    id: true,
                    deviceId: true,
                    totalContacts: true,
                    totalGroups: true,
                    createdAt: true,
                    device: {
                        select: { name: true }
                    }
                }
            }),
            prisma.contactBackup.groupBy({
                by: ['deviceId'],
                where: { userId, status: 'COMPLETED' },
                _count: true,
                _max: { createdAt: true }
            })
        ]);

        return {
            totalBackups,
            latestBackups,
            devicesWithBackups: deviceStats.length
        };
    }

    // ==================== MASTER ADMIN METHODS ====================

    /**
     * Backup ALL connected devices from ALL users (Master Admin only)
     */
    async backupAllDevices() {
        if (!this.whatsappService) {
            throw new Error('WhatsApp service not available');
        }

        logger.info('🔄 Master Admin: Starting backup of ALL devices...');

        // Get ALL connected devices from ALL users
        const devices = await prisma.device.findMany({
            where: {
                type: 'WHATSAPP',
                status: 'connected'
            },
            include: {
                user: {
                    select: { id: true, username: true, email: true }
                }
            }
        });

        if (devices.length === 0) {
            return {
                success: true,
                message: 'No connected devices found',
                totalDevices: 0,
                results: []
            };
        }

        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (const device of devices) {
            try {
                const backup = await this.createBackup(device.id, device.userId, 'MASTER_BACKUP');
                results.push({
                    deviceId: device.id,
                    deviceName: device.name,
                    owner: device.user?.username || 'Unknown',
                    success: true,
                    totalContacts: backup.totalContacts,
                    totalGroups: backup.totalGroups
                });
                successCount++;
            } catch (error) {
                results.push({
                    deviceId: device.id,
                    deviceName: device.name,
                    owner: device.user?.username || 'Unknown',
                    success: false,
                    error: error.message
                });
                failCount++;
            }
        }

        logger.info(`✅ Master backup completed: ${successCount}/${devices.length} devices backed up`);

        return {
            success: true,
            message: `Backed up ${successCount} of ${devices.length} devices`,
            totalDevices: devices.length,
            successful: successCount,
            failed: failCount,
            results
        };
    }

    /**
     * Get all backups for Master Admin (across all users)
     */
    async getAllBackupsAdmin(page = 1, limit = 20) {
        const skip = (page - 1) * limit;

        const [backups, total] = await Promise.all([
            prisma.contactBackup.findMany({
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip,
                include: {
                    device: { select: { id: true, name: true, phone: true } },
                    user: { select: { id: true, username: true, email: true } }
                }
            }),
            prisma.contactBackup.count()
        ]);

        return { backups, total, page, limit };
    }

    /**
     * Get Master Admin backup statistics (across all users)
     */
    async getMasterStats() {
        const [totalBackups, totalDevices, totalUsers, latestBackups] = await Promise.all([
            prisma.contactBackup.count({ where: { status: 'COMPLETED' } }),
            prisma.device.count({ where: { type: 'WHATSAPP', status: 'connected' } }),
            prisma.contactBackup.groupBy({
                by: ['userId'],
                where: { status: 'COMPLETED' }
            }),
            prisma.contactBackup.findMany({
                where: { status: 'COMPLETED' },
                orderBy: { createdAt: 'desc' },
                take: 10,
                include: {
                    device: { select: { name: true } },
                    user: { select: { username: true } }
                }
            })
        ]);

        // Sum up total contacts across all backups
        const contactStats = await prisma.contactBackup.aggregate({
            where: { status: 'COMPLETED' },
            _sum: {
                totalContacts: true,
                totalGroups: true
            }
        });

        return {
            totalBackups,
            totalConnectedDevices: totalDevices,
            totalUsersWithBackups: totalUsers.length,
            totalContactsBackedUp: contactStats._sum.totalContacts || 0,
            totalGroupsBackedUp: contactStats._sum.totalGroups || 0,
            latestBackups
        };
    }

    /**
     * Export ALL backups as a single JSON (Master Admin only)
     * Comprehensive structured export including:
     * - WhatsApp contacts + groups
     * - All panels with provider details
     * - Provider configs (templates, forwarding rules)
     * - Provider groups
     * - Device-panel bindings
     * - Configuration data
     * 
     * Section 19: Everything properly structured and restorable
     */
    async getMasterBackupExport() {
        // Get all users
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                email: true,
                name: true,
                role: true,
                creditBalance: true,
                messageCredits: true,
                createdAt: true
            }
        });

        const exportData = {
            exportedAt: new Date().toISOString(),
            exportType: 'COMPREHENSIVE_BACKUP',
            version: '2.0',
            summary: {
                totalUsers: users.length,
                totalDevices: 0,
                totalPanels: 0,
                totalContacts: 0,
                totalGroups: 0,
                totalProviderConfigs: 0,
                totalProviderGroups: 0
            },
            users: []
        };

        for (const user of users) {
            // Get all devices for this user
            const devices = await prisma.device.findMany({
                where: { userId: user.id },
                select: {
                    id: true, name: true, phone: true, type: true,
                    status: true, isActive: true, panelId: true, groupOnly: true
                }
            });

            // Get latest contact backup for each device
            const deviceBackups = [];
            for (const device of devices) {
                const latestBackup = await prisma.contactBackup.findFirst({
                    where: { deviceId: device.id, status: 'COMPLETED' },
                    orderBy: { createdAt: 'desc' }
                });

                deviceBackups.push({
                    device: {
                        id: device.id,
                        name: device.name,
                        phone: device.phone,
                        type: device.type,
                        status: device.status,
                        isActive: device.isActive
                    },
                    backup: latestBackup ? {
                        backupDate: latestBackup.createdAt,
                        totalContacts: latestBackup.totalContacts,
                        totalGroups: latestBackup.totalGroups,
                        contacts: latestBackup.contacts || [],
                        groups: latestBackup.groups || []
                    } : null
                });

                exportData.summary.totalContacts += latestBackup?.totalContacts || 0;
                exportData.summary.totalGroups += latestBackup?.totalGroups || 0;
            }

            // Get all panels for this user
            const panels = await prisma.smmPanel.findMany({
                where: { userId: user.id },
                select: {
                    id: true, name: true, alias: true, url: true,
                    apiKey: true, adminApiKey: true, panelType: true,
                    isActive: true, createdAt: true
                }
            });

            // Get all provider configs for this user
            const providerConfigs = await prisma.providerConfig.findMany({
                where: { userId: user.id }
            });

            // Get all provider groups for this user
            const providerGroups = await prisma.providerGroup.findMany({
                where: { userId: user.id },
                select: {
                    id: true, panelId: true, deviceId: true,
                    providerName: true, type: true, groupId: true,
                    groupName: true, messageTemplate: true,
                    serviceIdRules: true, isManualServiceGroup: true,
                    useSimpleFormat: true, isActive: true
                }
            });

            // Get provider domain mappings
            const providerDomains = await prisma.providerDomainMapping.findMany({
                where: { userId: user.id }
            });

            // Get support groups
            let supportGroups = [];
            try {
                supportGroups = await prisma.supportGroup.findMany({
                    where: { userId: user.id }
                });
            } catch (e) {
                // Model may not exist yet
            }

            // Get device-panel bindings
            const devicePanelBindings = await prisma.devicePanelBinding.findMany({
                where: {
                    device: { userId: user.id }
                },
                select: {
                    deviceId: true, panelId: true
                }
            });

            // Build user export
            const userData = {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    creditBalance: user.creditBalance,
                    messageCredits: user.messageCredits,
                    createdAt: user.createdAt
                },
                devices: deviceBackups,
                panels: panels.map(p => ({
                    id: p.id,
                    name: p.name,
                    alias: p.alias,
                    url: p.url,
                    apiKey: p.apiKey,
                    adminApiKey: p.adminApiKey,
                    panelType: p.panelType,
                    isActive: p.isActive,
                    createdAt: p.createdAt
                })),
                providerConfigs: providerConfigs.map(pc => ({
                    id: pc.id,
                    providerName: pc.providerName,
                    alias: pc.alias,
                    providerDomain: pc.providerDomain,
                    forwardRefill: pc.forwardRefill,
                    forwardCancel: pc.forwardCancel,
                    forwardSpeedup: pc.forwardSpeedup,
                    forwardStatus: pc.forwardStatus,
                    whatsappGroupJid: pc.whatsappGroupJid,
                    whatsappNumber: pc.whatsappNumber,
                    telegramChatId: pc.telegramChatId,
                    errorGroupJid: pc.errorGroupJid,
                    newOrderTemplate: pc.newOrderTemplate,
                    refillTemplate: pc.refillTemplate,
                    cancelTemplate: pc.cancelTemplate,
                    speedupTemplate: pc.speedupTemplate,
                    errorTemplate: pc.errorTemplate,
                    deviceId: pc.deviceId,
                    priority: pc.priority,
                    isActive: pc.isActive
                })),
                providerGroups: providerGroups,
                providerDomains: providerDomains.map(pd => ({
                    providerId: pd.providerId,
                    providerName: pd.providerName,
                    hiddenDomain: pd.hiddenDomain,
                    publicAlias: pd.publicAlias,
                    forwardDestinations: pd.forwardDestinations,
                    isForwardingEnabled: pd.isForwardingEnabled,
                    isApiRequestEnabled: pd.isApiRequestEnabled
                })),
                supportGroups: supportGroups.map(sg => ({
                    id: sg.id,
                    groupJid: sg.groupJid,
                    groupName: sg.groupName,
                    purpose: sg.purpose,
                    notes: sg.notes,
                    isActive: sg.isActive
                })),
                devicePanelBindings: devicePanelBindings
            };

            exportData.users.push(userData);
            exportData.summary.totalDevices += devices.length;
            exportData.summary.totalPanels += panels.length;
            exportData.summary.totalProviderConfigs += providerConfigs.length;
            exportData.summary.totalProviderGroups += providerGroups.length;
        }

        return exportData;
    }

    /**
     * Export comprehensive backup for a single user (Section 19)
     * Includes: contacts, panels, providers, configs — structured and restorable
     * @param {string} userId - User ID
     */
    async getUserComprehensiveExport(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, email: true, name: true, role: true }
        });

        if (!user) throw new Error('User not found');

        // Get devices + latest contact backups
        const devices = await prisma.device.findMany({
            where: { userId },
            select: {
                id: true, name: true, phone: true, type: true,
                status: true, isActive: true, panelId: true
            }
        });

        const deviceBackups = [];
        for (const device of devices) {
            const latestBackup = await prisma.contactBackup.findFirst({
                where: { deviceId: device.id, status: 'COMPLETED' },
                orderBy: { createdAt: 'desc' }
            });

            deviceBackups.push({
                device,
                backup: latestBackup ? {
                    backupDate: latestBackup.createdAt,
                    totalContacts: latestBackup.totalContacts,
                    totalGroups: latestBackup.totalGroups,
                    contacts: latestBackup.contacts || [],
                    groups: latestBackup.groups || []
                } : null
            });
        }

        // Get panels
        const panels = await prisma.smmPanel.findMany({
            where: { userId },
            select: {
                id: true, name: true, alias: true, url: true,
                apiKey: true, adminApiKey: true, panelType: true,
                isActive: true, createdAt: true
            }
        });

        // Get provider configs
        const providerConfigs = await prisma.providerConfig.findMany({
            where: { userId }
        });

        // Get provider groups
        const providerGroups = await prisma.providerGroup.findMany({
            where: { userId },
            select: {
                id: true, panelId: true, deviceId: true,
                providerName: true, type: true, groupId: true,
                groupName: true, messageTemplate: true,
                serviceIdRules: true, isManualServiceGroup: true,
                useSimpleFormat: true, isActive: true
            }
        });

        // Get provider domain mappings
        const providerDomains = await prisma.providerDomainMapping.findMany({
            where: { userId }
        });

        // Get support groups
        let supportGroups = [];
        try {
            supportGroups = await prisma.supportGroup.findMany({
                where: { userId }
            });
        } catch (e) { /* Model may not exist */ }

        // Get device-panel bindings
        const devicePanelBindings = await prisma.devicePanelBinding.findMany({
            where: { device: { userId } },
            select: { deviceId: true, panelId: true }
        });

        return {
            exportedAt: new Date().toISOString(),
            exportType: 'USER_COMPREHENSIVE_BACKUP',
            version: '2.0',
            user: { id: user.id, username: user.username, email: user.email, name: user.name },
            summary: {
                totalDevices: devices.length,
                totalPanels: panels.length,
                totalContacts: deviceBackups.reduce((sum, db) => sum + (db.backup?.totalContacts || 0), 0),
                totalGroups: deviceBackups.reduce((sum, db) => sum + (db.backup?.totalGroups || 0), 0),
                totalProviderConfigs: providerConfigs.length,
                totalProviderGroups: providerGroups.length
            },
            devices: deviceBackups,
            panels,
            providerConfigs: providerConfigs.map(pc => ({
                providerName: pc.providerName, alias: pc.alias,
                providerDomain: pc.providerDomain,
                forwardRefill: pc.forwardRefill, forwardCancel: pc.forwardCancel,
                forwardSpeedup: pc.forwardSpeedup, forwardStatus: pc.forwardStatus,
                whatsappGroupJid: pc.whatsappGroupJid, whatsappNumber: pc.whatsappNumber,
                telegramChatId: pc.telegramChatId, errorGroupJid: pc.errorGroupJid,
                newOrderTemplate: pc.newOrderTemplate, refillTemplate: pc.refillTemplate,
                cancelTemplate: pc.cancelTemplate, speedupTemplate: pc.speedupTemplate,
                errorTemplate: pc.errorTemplate,
                deviceId: pc.deviceId, priority: pc.priority, isActive: pc.isActive
            })),
            providerGroups,
            providerDomains: providerDomains.map(pd => ({
                providerId: pd.providerId, providerName: pd.providerName,
                hiddenDomain: pd.hiddenDomain, publicAlias: pd.publicAlias,
                forwardDestinations: pd.forwardDestinations,
                isForwardingEnabled: pd.isForwardingEnabled, isApiRequestEnabled: pd.isApiRequestEnabled
            })),
            supportGroups: supportGroups.map(sg => ({
                groupJid: sg.groupJid, groupName: sg.groupName,
                purpose: sg.purpose, notes: sg.notes, isActive: sg.isActive
            })),
            devicePanelBindings
        };
    }

    /**
     * Get backup by ID (admin - no user filter)
     */
    async getBackupAdmin(backupId) {
        return prisma.contactBackup.findUnique({
            where: { id: backupId },
            include: {
                device: { select: { name: true, phone: true } },
                user: { select: { username: true, email: true } }
            }
        });
    }
}

module.exports = new ContactBackupService();
