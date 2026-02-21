/**
 * User WhatsApp Mapping Service
 * 
 * Service for mapping panel usernames to WhatsApp numbers
 * Phase 1: Username & User Validation System
 * 
 * Features:
 * - Map multiple WhatsApp numbers to one panel username
 * - Map WhatsApp groups to panel users
 * - Bot control per user (enable/disable)
 * - Spam tracking and auto-suspend
 * - Verification status tracking
 */

const prisma = require('../utils/prisma');

class UserMappingService {
    constructor() {
        this.spamThreshold = 10; // Max messages per minute before flagged
        this.autoSuspendThreshold = 50; // Auto-suspend after this many spam flags
    }

    /**
     * Create a new user mapping
     */
    async createMapping(userId, data) {
        // Validate required fields
        if (!data.panelUsername) {
            throw new Error('Panel username is required');
        }

        // Check for existing mapping
        const existing = await prisma.userPanelMapping.findFirst({
            where: {
                userId,
                panelUsername: data.panelUsername
            }
        });

        if (existing) {
            throw new Error('Mapping for this panel username already exists');
        }

        // Parse and validate WhatsApp numbers
        let whatsappNumbers = [];
        if (data.whatsappNumbers) {
            whatsappNumbers = Array.isArray(data.whatsappNumbers)
                ? data.whatsappNumbers
                : [data.whatsappNumbers];

            // Normalize phone numbers
            whatsappNumbers = whatsappNumbers.map(n => this.normalizePhone(n));
        }

        // Parse group IDs
        let groupIds = [];
        if (data.groupIds) {
            groupIds = Array.isArray(data.groupIds) ? data.groupIds : [data.groupIds];
        }

        return prisma.userPanelMapping.create({
            data: {
                userId,
                panelId: data.panelId || null,
                panelUsername: data.panelUsername,
                panelEmail: data.panelEmail || null,
                panelUserId: data.panelUserId || null,
                whatsappNumbers: JSON.stringify(whatsappNumbers),
                whatsappName: data.whatsappName || null,
                telegramId: data.telegramId || null,
                groupIds: JSON.stringify(groupIds),
                isBotEnabled: data.isBotEnabled !== false,
                adminNotes: data.adminNotes || null,
                isVerified: data.isVerified || false,
                verifiedBy: data.isVerified ? 'ADMIN' : null,
                verifiedAt: data.isVerified ? new Date() : null
            }
        });
    }

    /**
     * Get all mappings for a user (panel owner)
     */
    async getMappings(userId, options = {}) {
        const where = { userId };

        // Panel filter
        if (options.panelId) {
            where.panelId = options.panelId;
        }

        if (options.search) {
            where.OR = [
                { panelUsername: { contains: options.search, mode: 'insensitive' } },
                { panelEmail: { contains: options.search, mode: 'insensitive' } },
                { whatsappNumbers: { contains: options.search } },
                { telegramId: { contains: options.search, mode: 'insensitive' } },
                { whatsappName: { contains: options.search, mode: 'insensitive' } }
            ];
        }

        if (options.isVerified !== undefined) {
            where.isVerified = options.isVerified;
        }

        if (options.isBotEnabled !== undefined) {
            where.isBotEnabled = options.isBotEnabled;
        }

        if (options.isAutoSuspended !== undefined) {
            where.isAutoSuspended = options.isAutoSuspended;
        }

        const mappings = await prisma.userPanelMapping.findMany({
            where,
            orderBy: options.orderBy || { createdAt: 'desc' },
            take: options.limit || 100,
            skip: options.offset || 0
        });

        // Parse JSON fields
        return mappings.map(m => this.parseMapping(m));
    }

    /**
     * Get a single mapping by ID
     */
    async getById(id, userId = null) {
        const where = { id };
        if (userId) where.userId = userId;

        const mapping = await prisma.userPanelMapping.findFirst({ where });
        return mapping ? this.parseMapping(mapping) : null;
    }

    /**
     * Find mapping by WhatsApp number
     */
    async findByPhone(userId, phone) {
        const normalizedPhone = this.normalizePhone(phone);

        const mappings = await prisma.userPanelMapping.findMany({
            where: {
                userId,
                whatsappNumbers: { contains: normalizedPhone }
            },
            orderBy: { updatedAt: 'desc' }
        });

        // Double-check the match (since contains might match partial)
        for (const mapping of mappings) {
            const parsed = this.parseMapping(mapping);
            if (parsed.whatsappNumbers.includes(normalizedPhone)) {
                return parsed;
            }
        }

        return null;
    }

    /**
     * Find ALL mappings by WhatsApp number (for multi-mapping support)
     */
    async findAllByPhone(userId, phone) {
        const normalizedPhone = this.normalizePhone(phone);

        const mappings = await prisma.userPanelMapping.findMany({
            where: {
                userId,
                whatsappNumbers: { contains: normalizedPhone }
            },
            orderBy: { updatedAt: 'desc' }
        });

        const results = [];
        for (const mapping of mappings) {
            const parsed = this.parseMapping(mapping);
            if (parsed.whatsappNumbers.includes(normalizedPhone)) {
                results.push(parsed);
            }
        }
        return results;
    }

    /**
     * Find mapping by panel username
     */
    async findByUsername(userId, panelUsername) {
        const mapping = await prisma.userPanelMapping.findFirst({
            where: {
                userId,
                panelUsername: {
                    equals: panelUsername,
                    mode: 'insensitive'
                }
            }
        });

        return mapping ? this.parseMapping(mapping) : null;
    }

    /**
     * Find mapping by group ID
     */
    async findByGroup(userId, groupId) {
        const mappings = await prisma.userPanelMapping.findMany({
            where: {
                userId,
                groupIds: { contains: groupId }
            }
        });

        for (const mapping of mappings) {
            const parsed = this.parseMapping(mapping);
            if (parsed.groupIds.includes(groupId)) {
                return parsed;
            }
        }

        return null;
    }

    /**
     * Update a mapping
     */
    async updateMapping(id, userId, data) {
        const existing = await this.getById(id, userId);
        if (!existing) {
            throw new Error('Mapping not found');
        }

        const updateData = {};

        // Handle simple fields
        const simpleFields = ['panelUsername', 'panelEmail', 'panelUserId', 'adminNotes', 'isBotEnabled', 'panelId', 'telegramId', 'whatsappName'];
        for (const field of simpleFields) {
            if (data[field] !== undefined) {
                updateData[field] = data[field];
            }
        }

        // Handle array fields
        if (data.whatsappNumbers !== undefined) {
            const numbers = Array.isArray(data.whatsappNumbers)
                ? data.whatsappNumbers.map(n => this.normalizePhone(n))
                : [this.normalizePhone(data.whatsappNumbers)];
            updateData.whatsappNumbers = JSON.stringify(numbers);
        }

        if (data.groupIds !== undefined) {
            const groups = Array.isArray(data.groupIds) ? data.groupIds : [data.groupIds];
            updateData.groupIds = JSON.stringify(groups);
        }

        const updated = await prisma.userPanelMapping.update({
            where: { id },
            data: updateData
        });

        return this.parseMapping(updated);
    }

    /**
     * Add WhatsApp number to existing mapping
     */
    async addPhone(id, userId, phone) {
        const mapping = await this.getById(id, userId);
        if (!mapping) throw new Error('Mapping not found');

        const normalizedPhone = this.normalizePhone(phone);

        if (mapping.whatsappNumbers.includes(normalizedPhone)) {
            throw new Error('Phone number already exists in this mapping');
        }

        const numbers = [...mapping.whatsappNumbers, normalizedPhone];

        return this.updateMapping(id, userId, { whatsappNumbers: numbers });
    }

    /**
     * Remove WhatsApp number from mapping
     */
    async removePhone(id, userId, phone) {
        const mapping = await this.getById(id, userId);
        if (!mapping) throw new Error('Mapping not found');

        const normalizedPhone = this.normalizePhone(phone);
        const numbers = mapping.whatsappNumbers.filter(n => n !== normalizedPhone);

        return this.updateMapping(id, userId, { whatsappNumbers: numbers });
    }

    /**
     * Add group ID to mapping
     */
    async addGroup(id, userId, groupId) {
        const mapping = await this.getById(id, userId);
        if (!mapping) throw new Error('Mapping not found');

        if (mapping.groupIds.includes(groupId)) {
            throw new Error('Group already exists in this mapping');
        }

        const groups = [...mapping.groupIds, groupId];

        return this.updateMapping(id, userId, { groupIds: groups });
    }

    /**
     * Remove group ID from mapping
     */
    async removeGroup(id, userId, groupId) {
        const mapping = await this.getById(id, userId);
        if (!mapping) throw new Error('Mapping not found');

        const groups = mapping.groupIds.filter(g => g !== groupId);

        return this.updateMapping(id, userId, { groupIds: groups });
    }

    /**
     * Delete a mapping
     */
    async deleteMapping(id, userId) {
        const existing = await this.getById(id, userId);
        if (!existing) throw new Error('Mapping not found');

        return prisma.userPanelMapping.delete({
            where: { id }
        });
    }

    /**
     * Verify a user mapping
     * If verified via WhatsApp, auto-adds a note
     */
    async verifyMapping(id, userId, verifiedBy = 'ADMIN') {
        const updateData = {
            isVerified: true,
            verifiedAt: new Date(),
            verifiedBy
        };

        // Auto-add note when validated via WhatsApp (Section 10 requirement)
        if (verifiedBy === 'WHATSAPP') {
            const existing = await this.getById(id, userId);
            const timestamp = new Date().toISOString().split('T')[0];
            const autoNote = `[${timestamp}] Validated via WhatsApp`;
            if (existing && existing.adminNotes) {
                updateData.adminNotes = existing.adminNotes + '\n' + autoNote;
            } else {
                updateData.adminNotes = autoNote;
            }
        }

        return prisma.userPanelMapping.update({
            where: { id },
            data: updateData
        });
    }

    /**
     * Update WhatsApp display name (auto-capture from pushName)
     */
    async updateWhatsAppName(id, whatsappName) {
        if (!id || !whatsappName) return null;
        try {
            return await prisma.userPanelMapping.update({
                where: { id },
                data: { whatsappName }
            });
        } catch (e) {
            // Silently fail — this is a best-effort update
            return null;
        }
    }

    /**
     * Unverify a user mapping
     */
    async unverifyMapping(id, userId) {
        const existing = await this.getById(id, userId);
        if (!existing) throw new Error('Mapping not found');

        return prisma.userPanelMapping.update({
            where: { id },
            data: {
                isVerified: false,
                verifiedAt: null,
                verifiedBy: null
            }
        });
    }

    /**
     * Toggle bot enabled status
     */
    async toggleBot(id, userId) {
        const mapping = await this.getById(id, userId);
        if (!mapping) throw new Error('Mapping not found');

        return prisma.userPanelMapping.update({
            where: { id },
            data: { isBotEnabled: !mapping.isBotEnabled }
        });
    }

    /**
     * Record message activity (for spam tracking)
     */
    async recordActivity(mappingId) {
        return prisma.userPanelMapping.update({
            where: { id: mappingId },
            data: {
                lastMessageAt: new Date(),
                totalMessages: { increment: 1 }
            }
        });
    }

    /**
     * Record spam incident
     */
    async recordSpam(mappingId) {
        const mapping = await prisma.userPanelMapping.findUnique({
            where: { id: mappingId }
        });

        if (!mapping) return null;

        const newSpamCount = (mapping.spamCount || 0) + 1;
        const shouldSuspend = newSpamCount >= this.autoSuspendThreshold;

        return prisma.userPanelMapping.update({
            where: { id: mappingId },
            data: {
                spamCount: newSpamCount,
                lastSpamAt: new Date(),
                isAutoSuspended: shouldSuspend,
                suspendedAt: shouldSuspend ? new Date() : mapping.suspendedAt,
                suspendReason: shouldSuspend ? 'Auto-suspended due to spam' : mapping.suspendReason
            }
        });
    }

    /**
     * Suspend a user mapping
     */
    async suspendMapping(id, userId, reason = null) {
        const existing = await this.getById(id, userId);
        if (!existing) throw new Error('Mapping not found');

        return prisma.userPanelMapping.update({
            where: { id },
            data: {
                isAutoSuspended: true,
                suspendedAt: new Date(),
                suspendReason: reason || 'Manually suspended'
            }
        });
    }

    /**
     * Unsuspend a user mapping
     */
    async unsuspendMapping(id, userId) {
        const existing = await this.getById(id, userId);
        if (!existing) throw new Error('Mapping not found');

        return prisma.userPanelMapping.update({
            where: { id },
            data: {
                isAutoSuspended: false,
                suspendedAt: null,
                suspendReason: null,
                spamCount: 0
            }
        });
    }

    /**
     * Check if sender is allowed to use bot
     * @returns {Object} { allowed, mapping, reason }
     */
    async checkSenderAllowed(userId, senderPhone, isGroup = false, groupId = null, senderName = null) {
        let mapping = null;

        // Try to find by phone number
        if (senderPhone) {
            mapping = await this.findByPhone(userId, senderPhone);
        }

        // If in group and no mapping found, try by group ID
        if (!mapping && isGroup && groupId) {
            mapping = await this.findByGroup(userId, groupId);
        }

        // No mapping found - could be unregistered user
        if (!mapping) {
            return {
                allowed: true, // Allow by default, command handler will validate
                mapping: null,
                reason: 'NO_MAPPING',
                isUnregistered: true
            };
        }

        // Auto-capture WhatsApp name (Section 10: auto-add WhatsApp names)
        if (senderName && mapping.whatsappName !== senderName) {
            this.updateWhatsAppName(mapping.id, senderName); // fire-and-forget
        }

        // Check if bot is enabled
        if (!mapping.isBotEnabled) {
            return {
                allowed: false,
                mapping,
                reason: 'BOT_DISABLED'
            };
        }

        // Check if suspended
        if (mapping.isAutoSuspended) {
            return {
                allowed: false,
                mapping,
                reason: 'SUSPENDED'
            };
        }

        // Record activity
        await this.recordActivity(mapping.id);

        return {
            allowed: true,
            mapping,
            reason: 'OK'
        };
    }

    /**
     * Bulk import mappings
     */
    async bulkImport(userId, mappings) {
        const results = { success: 0, failed: 0, errors: [] };

        for (const data of mappings) {
            try {
                await this.createMapping(userId, data);
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({
                    username: data.panelUsername,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Get statistics for user mappings
     */
    async getStats(userId) {
        const [total, verified, botEnabled, suspended] = await Promise.all([
            prisma.userPanelMapping.count({ where: { userId } }),
            prisma.userPanelMapping.count({ where: { userId, isVerified: true } }),
            prisma.userPanelMapping.count({ where: { userId, isBotEnabled: true } }),
            prisma.userPanelMapping.count({ where: { userId, isAutoSuspended: true } })
        ]);

        return {
            total,
            verified,
            unverified: total - verified,
            botEnabled,
            botDisabled: total - botEnabled,
            suspended
        };
    }

    // ==================== HELPER METHODS ====================

    /**
     * Normalize phone number
     */
    normalizePhone(phone) {
        if (!phone) return '';
        // Remove all non-numeric characters
        let normalized = phone.toString().replace(/\D/g, '');
        // Remove leading zeros
        normalized = normalized.replace(/^0+/, '');
        return normalized;
    }

    /**
     * Parse mapping JSON fields
     */
    parseMapping(mapping) {
        return {
            ...mapping,
            whatsappNumbers: this.safeJSONParse(mapping.whatsappNumbers, []),
            groupIds: this.safeJSONParse(mapping.groupIds, []),
            telegramId: mapping.telegramId || null,
            whatsappName: mapping.whatsappName || null,
            panelId: mapping.panelId || null
        };
    }

    /**
     * Safe JSON parse
     */
    safeJSONParse(str, defaultValue = null) {
        try {
            return JSON.parse(str || '[]');
        } catch {
            return defaultValue;
        }
    }
}

module.exports = new UserMappingService();
