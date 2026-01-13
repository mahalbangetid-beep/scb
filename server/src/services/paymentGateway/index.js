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
    getAvailableGateways() {
        return Object.values(this.gateways).map(gateway => gateway.getGatewayInfo());
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
    getGatewayInfo(gatewayId) {
        const gateway = this.getGateway(gatewayId);
        return gateway ? gateway.getGatewayInfo() : null;
    }

    /**
     * Check if gateway is available
     * @param {string} gatewayId - Gateway identifier
     * @returns {boolean} Is available
     */
    isGatewayAvailable(gatewayId) {
        const info = this.getGatewayInfo(gatewayId);
        return info ? info.isAvailable : false;
    }
}

module.exports = new PaymentGatewayService();
