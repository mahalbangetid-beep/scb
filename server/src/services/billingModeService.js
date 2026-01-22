/**
 * Billing Mode Service
 * 
 * Manages global billing mode setting:
 * - CREDITS: Charge messages using message credits (1 credit = 1 message)
 * - DOLLARS: Charge messages using dollar balance ($ per message)
 */

const prisma = require('../utils/prisma');

class BillingModeService {
    constructor() {
        this.MODES = {
            CREDITS: 'CREDITS',
            DOLLARS: 'DOLLARS'
        };

        // Cache for billing mode
        this.cachedMode = null;
        this.cacheTime = 0;
        this.cacheTTL = 30000; // 30 seconds
    }

    /**
     * Get current billing mode (cached)
     * @returns {Promise<string>} 'CREDITS' or 'DOLLARS'
     */
    async getMode() {
        const now = Date.now();

        // Return cached value if valid
        if (this.cachedMode && (now - this.cacheTime) < this.cacheTTL) {
            return this.cachedMode;
        }

        try {
            const config = await prisma.systemConfig.findFirst({
                where: { key: 'billing_mode' }
            });

            this.cachedMode = config?.value || this.MODES.CREDITS; // Default to CREDITS
            this.cacheTime = now;

            return this.cachedMode;
        } catch (error) {
            console.error('[BillingMode] Error fetching mode:', error);
            return this.MODES.CREDITS; // Default fallback
        }
    }

    /**
     * Set billing mode
     * @param {string} mode - 'CREDITS' or 'DOLLARS'
     */
    async setMode(mode) {
        if (!Object.values(this.MODES).includes(mode)) {
            throw new Error(`Invalid billing mode: ${mode}. Must be CREDITS or DOLLARS`);
        }

        await prisma.systemConfig.upsert({
            where: { key: 'billing_mode' },
            update: { value: mode, updatedAt: new Date() },
            create: {
                key: 'billing_mode',
                value: mode,
                category: 'billing',
                description: 'Global billing mode: CREDITS or DOLLARS'
            }
        });

        // Clear cache
        this.cachedMode = mode;
        this.cacheTime = Date.now();

        console.log(`[BillingMode] Mode changed to: ${mode}`);
        return mode;
    }

    /**
     * Check if credits mode is active
     */
    async isCreditsMode() {
        const mode = await this.getMode();
        return mode === this.MODES.CREDITS;
    }

    /**
     * Check if dollars mode is active
     */
    async isDollarsMode() {
        const mode = await this.getMode();
        return mode === this.MODES.DOLLARS;
    }

    /**
     * Get billing mode info for frontend
     */
    async getModeInfo() {
        const mode = await this.getMode();

        return {
            mode,
            isCreditsMode: mode === this.MODES.CREDITS,
            isDollarsMode: mode === this.MODES.DOLLARS,
            description: mode === this.MODES.CREDITS
                ? 'Bot messages are charged using message credits (1 credit = 1 message)'
                : 'Bot messages are charged using dollar balance ($ per message)',
            availableModes: Object.values(this.MODES)
        };
    }

    /**
     * Clear cache (force refresh)
     */
    clearCache() {
        this.cachedMode = null;
        this.cacheTime = 0;
    }
}

module.exports = new BillingModeService();
