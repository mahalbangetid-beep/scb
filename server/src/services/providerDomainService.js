/**
 * Provider Domain Service
 * 
 * Service for managing hidden provider domain/URL mappings
 * Phase 5: Provider Integration - Hidden Domain Storage
 * 
 * Features:
 * - Store provider panel URLs securely (hidden from end users)
 * - Auto-detect provider from service name patterns
 * - Map provider names to their panel domains
 * - Support multiple aliases per provider
 */

const prisma = require('../utils/prisma');

class ProviderDomainService {
    constructor() {
        // Common provider patterns (for auto-detection)
        this.commonPatterns = {
            'SMM Panel A': ['smmpanela', 'panel-a', 'panela'],
            'SMM Panel B': ['smmpanelb', 'panel-b', 'panelb'],
            'Provider X': ['providerx', 'provx', 'px-'],
            'Provider Y': ['providery', 'provy', 'py-']
        };
    }

    /**
     * Create a new provider domain mapping
     */
    async createMapping(userId, data) {
        if (!data.providerName) {
            throw new Error('Provider name is required');
        }

        // Check for existing
        const existing = await prisma.providerDomainMapping.findFirst({
            where: {
                userId,
                providerName: {
                    equals: data.providerName,
                    mode: 'insensitive'
                }
            }
        });

        if (existing) {
            throw new Error('Provider mapping already exists');
        }

        // Parse aliases
        let aliases = [];
        if (data.aliases) {
            aliases = Array.isArray(data.aliases) ? data.aliases : data.aliases.split(',').map(a => a.trim());
        }

        return prisma.providerDomainMapping.create({
            data: {
                userId,
                providerName: data.providerName,
                domainUrl: data.domainUrl || null,
                apiEndpoint: data.apiEndpoint || null,
                apiKeyEncrypted: data.apiKey ? this.encryptApiKey(data.apiKey) : null,
                aliases: JSON.stringify(aliases),
                isHidden: data.isHidden !== false,
                isActive: data.isActive !== false,
                notes: data.notes || null
            }
        });
    }

    /**
     * Get all provider domain mappings for a user
     */
    async getMappings(userId, options = {}) {
        const where = { userId };

        if (options.isActive !== undefined) {
            where.isActive = options.isActive;
        }

        if (options.search) {
            where.OR = [
                { providerName: { contains: options.search, mode: 'insensitive' } },
                { aliases: { contains: options.search } }
            ];
        }

        const mappings = await prisma.providerDomainMapping.findMany({
            where,
            orderBy: { providerName: 'asc' }
        });

        // Parse and optionally hide sensitive data
        return mappings.map(m => this.parseMapping(m, options.includeSensitive));
    }

    /**
     * Get a single mapping by ID
     */
    async getById(id, userId, includeSensitive = false) {
        const mapping = await prisma.providerDomainMapping.findFirst({
            where: { id, userId }
        });

        return mapping ? this.parseMapping(mapping, includeSensitive) : null;
    }

    /**
     * Find mapping by provider name or alias
     */
    async findByProvider(userId, providerIdentifier) {
        if (!providerIdentifier) return null;

        const identifier = providerIdentifier.toLowerCase().trim();

        // First try exact name match
        let mapping = await prisma.providerDomainMapping.findFirst({
            where: {
                userId,
                providerName: {
                    equals: identifier,
                    mode: 'insensitive'
                }
            }
        });

        if (mapping) {
            return this.parseMapping(mapping, true);
        }

        // Try aliases
        const allMappings = await prisma.providerDomainMapping.findMany({
            where: { userId }
        });

        for (const m of allMappings) {
            const parsed = this.parseMapping(m, true);
            if (parsed.aliases.some(a => a.toLowerCase() === identifier)) {
                return parsed;
            }
        }

        return null;
    }

    /**
     * Detect provider from service name
     */
    async detectFromServiceName(userId, serviceName) {
        if (!serviceName) return null;

        const lowerName = serviceName.toLowerCase();

        // First check user's custom mappings
        const userMappings = await this.getMappings(userId, { isActive: true, includeSensitive: true });

        for (const mapping of userMappings) {
            // Check if any alias matches
            for (const alias of mapping.aliases) {
                if (lowerName.includes(alias.toLowerCase())) {
                    return mapping;
                }
            }
            // Check provider name
            if (lowerName.includes(mapping.providerName.toLowerCase())) {
                return mapping;
            }
        }

        // Try common patterns as fallback
        for (const [providerName, patterns] of Object.entries(this.commonPatterns)) {
            for (const pattern of patterns) {
                if (lowerName.includes(pattern)) {
                    return {
                        providerName,
                        detected: true,
                        pattern,
                        isCommonPattern: true
                    };
                }
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

        // Simple fields
        const simpleFields = ['providerName', 'domainUrl', 'apiEndpoint', 'isHidden', 'isActive', 'notes'];
        for (const field of simpleFields) {
            if (data[field] !== undefined) {
                updateData[field] = data[field];
            }
        }

        // Handle aliases
        if (data.aliases !== undefined) {
            const aliases = Array.isArray(data.aliases)
                ? data.aliases
                : data.aliases.split(',').map(a => a.trim());
            updateData.aliases = JSON.stringify(aliases);
        }

        // Handle API key
        if (data.apiKey !== undefined) {
            updateData.apiKeyEncrypted = data.apiKey ? this.encryptApiKey(data.apiKey) : null;
        }

        return prisma.providerDomainMapping.update({
            where: { id },
            data: updateData
        });
    }

    /**
     * Delete a mapping
     */
    async deleteMapping(id, userId) {
        const existing = await this.getById(id, userId);
        if (!existing) {
            throw new Error('Mapping not found');
        }

        return prisma.providerDomainMapping.delete({
            where: { id }
        });
    }

    /**
     * Toggle active status
     */
    async toggleActive(id, userId) {
        const existing = await this.getById(id, userId);
        if (!existing) {
            throw new Error('Mapping not found');
        }

        return prisma.providerDomainMapping.update({
            where: { id },
            data: { isActive: !existing.isActive }
        });
    }

    /**
     * Add an alias
     */
    async addAlias(id, userId, alias) {
        const mapping = await this.getById(id, userId, true);
        if (!mapping) throw new Error('Mapping not found');

        if (mapping.aliases.includes(alias)) {
            throw new Error('Alias already exists');
        }

        const aliases = [...mapping.aliases, alias];

        return prisma.providerDomainMapping.update({
            where: { id },
            data: { aliases: JSON.stringify(aliases) }
        });
    }

    /**
     * Remove an alias
     */
    async removeAlias(id, userId, alias) {
        const mapping = await this.getById(id, userId, true);
        if (!mapping) throw new Error('Mapping not found');

        const aliases = mapping.aliases.filter(a => a !== alias);

        return prisma.providerDomainMapping.update({
            where: { id },
            data: { aliases: JSON.stringify(aliases) }
        });
    }

    /**
     * Get provider URL (for internal use only)
     */
    async getProviderUrl(userId, providerName) {
        const mapping = await this.findByProvider(userId, providerName);

        if (!mapping || mapping.isHidden) {
            return null; // Don't expose hidden URLs
        }

        return mapping.domainUrl;
    }

    /**
     * Get provider API credentials (for internal use)
     */
    async getProviderApiCredentials(userId, providerName) {
        const mapping = await this.findByProvider(userId, providerName);

        if (!mapping) {
            return null;
        }

        return {
            apiEndpoint: mapping.apiEndpoint,
            apiKey: mapping.apiKeyEncrypted ? this.decryptApiKey(mapping.apiKeyEncrypted) : null
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
                    providerName: data.providerName,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Get provider statistics
     */
    async getStats(userId) {
        const [total, active, withApi] = await Promise.all([
            prisma.providerDomainMapping.count({ where: { userId } }),
            prisma.providerDomainMapping.count({ where: { userId, isActive: true } }),
            prisma.providerDomainMapping.count({ where: { userId, apiEndpoint: { not: null } } })
        ]);

        return { total, active, inactive: total - active, withApi };
    }

    // ==================== HELPER METHODS ====================

    /**
     * Parse mapping and handle JSON fields
     */
    parseMapping(mapping, includeSensitive = false) {
        const parsed = {
            ...mapping,
            aliases: this.safeJSONParse(mapping.aliases, [])
        };

        // Remove sensitive data unless explicitly requested
        if (!includeSensitive) {
            if (parsed.isHidden) {
                parsed.domainUrl = '[HIDDEN]';
            }
            delete parsed.apiKeyEncrypted;
        }

        return parsed;
    }

    /**
     * Simple encryption for API keys (should use proper encryption in production)
     */
    encryptApiKey(apiKey) {
        // In production, use proper encryption like AES-256
        // This is a simple base64 encoding for demonstration
        return Buffer.from(apiKey).toString('base64');
    }

    /**
     * Decrypt API key
     */
    decryptApiKey(encrypted) {
        try {
            return Buffer.from(encrypted, 'base64').toString('utf8');
        } catch {
            return null;
        }
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

module.exports = new ProviderDomainService();
