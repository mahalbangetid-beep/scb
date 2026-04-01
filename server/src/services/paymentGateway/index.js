/**
 * Payment Gateway Service Aggregator
 * Unified interface for all payment gateways
 */

const esewaService = require('./esewa');
const cryptomusService = require('./cryptomus');
const binancePayService = require('./binancePay');
const manualPaymentService = require('./manualPayment');

class PaymentGatewayService {
    constructor() {
        this.gateways = {
            esewa: esewaService,
            cryptomus: cryptomusService,
            binance_pay: binancePayService,
            manual: manualPaymentService
        };

        console.log('[PaymentGateway] All gateways loaded');
    }

    /**
     * Get all available payment gateways
     * @returns {Array} Gateway info list
     */
    async getAvailableGateways() {
        const prisma = require('../../utils/prisma');
        const gatewayPromises = Object.values(this.gateways).map(gateway => gateway.getGatewayInfo());
        const builtInGateways = await Promise.all(gatewayPromises);

        // Also load custom payment methods from DB
        try {
            const customMethods = await prisma.customPaymentMethod.findMany({
                where: { enabled: true },
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
            });

            const customGateways = customMethods.map(m => ({
                id: `custom_${m.id}`,
                name: m.name,
                description: m.description || '',
                icon: m.icon || '💳',
                currency: m.currency || 'USD',
                minAmount: m.minAmount,
                maxAmount: m.maxAmount,
                isAvailable: true,
                requiresProof: m.requiresProof,
                processingTime: m.processingTime || '1-24 hours',
                countries: m.countries ? m.countries.split(',').map(c => c.trim().toUpperCase()).filter(Boolean) : ['*'],
                disallowedCountries: m.disallowedCountries ? m.disallowedCountries.split(',').map(c => c.trim().toUpperCase()).filter(Boolean) : [],
                instructions: m.instructions || '',
                bonusPercent: m.bonusPercent || 0,
                taxPercent: m.taxPercent || 0,
                isCustom: true
            }));

            return [...builtInGateways, ...customGateways];
        } catch (e) {
            // If custom methods table doesn't exist yet, just return built-in
            console.warn('[PaymentGateway] Could not load custom methods:', e.message);
            return builtInGateways;
        }
    }

    /**
     * Get a specific gateway service
     * @param {string} gatewayId - Gateway identifier
     * @returns {Object|null} Gateway service
     */
    getGateway(gatewayId) {
        return this.gateways[gatewayId] || null;
    }

    /**
     * Create payment via specified gateway
     * @param {string} gatewayId - Gateway identifier
     * @param {Object} params - Payment parameters
     * @returns {Object} Payment result
     */
    async createPayment(gatewayId, params) {
        const gateway = this.getGateway(gatewayId);

        if (!gateway) {
            return {
                success: false,
                error: `Unknown payment gateway: ${gatewayId}`
            };
        }

        // For manual payments, use createPaymentRequest
        if (gatewayId === 'manual') {
            return gateway.createPaymentRequest(params);
        }

        return gateway.createPayment(params);
    }

    /**
     * Process webhook for a gateway
     * @param {string} gatewayId - Gateway identifier
     * @param {Object} data - Webhook data
     * @returns {Object} Processing result
     */
    async processWebhook(gatewayId, data) {
        const gateway = this.getGateway(gatewayId);

        if (!gateway || !gateway.processWebhook) {
            return {
                success: false,
                error: `Webhook not supported for gateway: ${gatewayId}`
            };
        }

        // Esewa uses processCallback
        if (gatewayId === 'esewa') {
            return gateway.processCallback(data);
        }

        return gateway.processWebhook(data);
    }

    /**
     * Get gateway info by ID
     * @param {string} gatewayId - Gateway identifier
     * @returns {Object|null} Gateway info
     */
    async getGatewayInfo(gatewayId) {
        const gateway = this.getGateway(gatewayId);
        return gateway ? await gateway.getGatewayInfo() : null;
    }

    /**
     * Check if gateway is available
     * @param {string} gatewayId - Gateway identifier
     * @returns {boolean} Is available
     */
    async isGatewayAvailable(gatewayId) {
        const info = await this.getGatewayInfo(gatewayId);
        return info ? info.isAvailable : false;
    }
}

module.exports = new PaymentGatewayService();
