/**
 * SMM Panel Service
 * 
 * Service untuk berinteraksi dengan berbagai SMM Panel APIs
 * Mendukung format: STANDARD, RESTFUL, dan CUSTOM
 */

const axios = require('axios');
const prisma = require('../utils/prisma');
const { decrypt } = require('../utils/encryption');

class SmmPanelService {
    constructor() {
        this.timeout = 30000; // 30 seconds timeout
    }

    /**
     * Create axios instance
     */
    createClient() {
        return axios.create({
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
        });
    }

    /**
     * Get decrypted API key for a panel
     */
    async getDecryptedApiKey(panel) {
        try {
            if (!panel.apiKey) return null;
            return decrypt(panel.apiKey);
        } catch (error) {
            console.error('[SMM] Failed to decrypt API key:', error.message);
            throw new Error('Invalid API key encryption');
        }
    }

    /**
     * Build full URL for an action
     */
    buildUrl(panel, action) {
        const baseUrl = panel.url.replace(/\/$/, ''); // Remove trailing slash
        const format = panel.apiFormat || 'STANDARD';

        // Check for custom endpoints first
        const customEndpoints = {
            'balance': panel.endpointBalance,
            'services': panel.endpointServices,
            'add': panel.endpointAddOrder,
            'status': panel.endpointOrderStatus,
            'refill': panel.endpointRefill,
            'cancel': panel.endpointCancel
        };

        if (customEndpoints[action]) {
            const endpoint = customEndpoints[action];
            // If endpoint starts with http, use as absolute URL
            if (endpoint.startsWith('http')) {
                return endpoint;
            }
            // Otherwise, append to base URL
            return `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
        }

        // Default behavior based on format
        switch (format) {
            case 'RESTFUL':
                // RESTful format: separate endpoints
                const restEndpoints = {
                    'balance': '/api/balance',
                    'services': '/api/services',
                    'add': '/api/order',
                    'status': '/api/status',
                    'refill': '/api/refill',
                    'cancel': '/api/cancel'
                };
                return `${baseUrl}${restEndpoints[action] || '/api'}`;

            case 'CUSTOM':
                // Custom format requires endpoints to be defined
                throw new Error(`Custom endpoint not configured for action: ${action}`);

            case 'STANDARD':
            default:
                // Standard format: single API endpoint with action param
                // Auto-detect the endpoint path
                if (baseUrl.includes('/api/v2') || baseUrl.includes('/api/v1') || baseUrl.endsWith('/api')) {
                    return baseUrl;
                }
                return `${baseUrl}/api/v2`;
        }
    }

    /**
     * Make API request to SMM Panel
     * Supports different API formats
     */
    async makeRequest(panel, action, params = {}) {
        const client = this.createClient();
        const apiKey = await this.getDecryptedApiKey(panel);
        const apiUrl = this.buildUrl(panel, action);
        const format = panel.apiFormat || 'STANDARD';
        const method = (panel.httpMethod || 'POST').toUpperCase();
        const keyParam = panel.apiKeyParam || 'key';
        const actionParam = panel.actionParam || 'action';

        // Build request data
        let requestData = {
            [keyParam]: apiKey,
            ...params
        };

        // Add API ID if panel uses dual auth
        if (panel.useApiId && panel.apiId) {
            const apiIdParam = panel.apiIdParam || 'api_id';
            const decryptedApiId = decrypt(panel.apiId);
            requestData[apiIdParam] = decryptedApiId;
        }

        // For STANDARD format, include action in params
        if (format === 'STANDARD') {
            requestData[actionParam] = action;
        }

        try {
            console.log(`[SMM] ${method} ${apiUrl} - Action: ${action}`);
            console.log(`[SMM] Request params: ${Object.keys(requestData).join(', ')}`);

            let response;
            if (method === 'GET') {
                response = await client.get(apiUrl, { params: requestData });
            } else {
                const data = new URLSearchParams(requestData);
                response = await client.post(apiUrl, data);
            }

            console.log(`[SMM] Response:`, JSON.stringify(response.data));
            return response.data;
        } catch (error) {
            console.error(`[SMM] API Error for ${panel.alias}:`, error.message);
            if (error.response?.data) {
                console.error(`[SMM] Error data:`, JSON.stringify(error.response.data));
            }
            throw new Error(error.response?.data?.error || error.response?.data?.msg || error.message);
        }
    }

    /**
     * Test connection to SMM Panel
     * Uses balance/profile check as connection test
     */
    async testConnection(url, apiKey, options = {}) {
        const {
            apiFormat = 'STANDARD',
            endpointBalance = null,
            apiKeyParam = 'key',
            actionParam = 'action',
            httpMethod = 'POST',
            useApiId = false,
            apiId = null,
            apiIdParam = 'api_id'
        } = options;

        const client = this.createClient();

        // Build URL for balance check
        let testUrl = url.replace(/\/$/, '');

        if (endpointBalance) {
            testUrl = endpointBalance.startsWith('http')
                ? endpointBalance
                : `${testUrl}${endpointBalance.startsWith('/') ? '' : '/'}${endpointBalance}`;
        } else if (apiFormat === 'RESTFUL') {
            // For RESTful, try profile first (common for Indonesian panels)
            testUrl = `${testUrl}/api/profile`;
        } else {
            // STANDARD format
            if (!testUrl.includes('/api/v2') && !testUrl.includes('/api/v1') && !testUrl.endsWith('/api')) {
                testUrl = `${testUrl}/api/v2`;
            }
        }

        // Build request data
        const requestData = {
            [apiKeyParam]: apiKey
        };

        // Add API ID if using dual auth
        if (useApiId && apiId) {
            requestData[apiIdParam] = apiId;
        }

        if (apiFormat === 'STANDARD') {
            requestData[actionParam] = 'balance';
        }

        try {
            console.log(`[SMM] Testing connection to ${testUrl}`);
            console.log(`[SMM] Request params:`, Object.keys(requestData));

            let response;
            if (httpMethod.toUpperCase() === 'GET') {
                response = await client.get(testUrl, { params: requestData });
            } else {
                const data = new URLSearchParams(requestData);
                response = await client.post(testUrl, data);
            }

            // Log full response for debugging
            const resData = response.data;
            console.log(`[SMM] Response:`, JSON.stringify(resData));

            // Handle different error formats
            // Format 1: { error: "message" }
            // Format 2: { status: false, msg: "message" }
            // Format 3: { status: "error", message: "..." }
            if (resData.error) {
                return {
                    success: false,
                    error: resData.error
                };
            }

            if (resData.status === false) {
                return {
                    success: false,
                    error: resData.msg || resData.message || 'Request failed'
                };
            }

            if (resData.status === 'error') {
                return {
                    success: false,
                    error: resData.message || 'Unknown error'
                };
            }

            // Try different balance field names
            // Common: balance, saldo, credit, deposit
            const balance = parseFloat(
                resData.balance ||
                resData.saldo ||
                resData.credit ||
                resData.deposit ||
                resData.data?.balance ||
                resData.data?.saldo ||
                0
            );

            console.log(`[SMM] Parsed balance: ${balance}`);

            return {
                success: true,
                balance: balance,
                currency: resData.currency || resData.mata_uang || 'IDR'
            };
        } catch (error) {
            console.error(`[SMM] Connection test failed:`, error.message);
            if (error.response?.data) {
                console.error(`[SMM] Error response:`, JSON.stringify(error.response.data));
            }
            return {
                success: false,
                error: error.response?.data?.error || error.response?.data?.msg || error.response?.data?.message || error.message
            };
        }
    }

    /**
     * Get panel balance
     */
    async getBalance(panelId) {
        const panel = await prisma.smmPanel.findUnique({
            where: { id: panelId }
        });

        if (!panel) {
            throw new Error('Panel not found');
        }

        console.log(`[SMM] Getting balance for panel: ${panel.alias || panel.name}`);

        let result;
        try {
            result = await this.makeRequest(panel, 'balance');
        } catch (requestError) {
            console.error(`[SMM] Balance request failed for ${panel.alias}:`, requestError.message);
            throw new Error(`Connection failed: ${requestError.message}`);
        }

        console.log(`[SMM] Balance response:`, JSON.stringify(result));

        // Handle various error formats
        if (result.error) {
            throw new Error(result.error);
        }
        if (result.status === false) {
            throw new Error(result.msg || result.message || 'Failed to get balance');
        }
        if (result.status === 'error') {
            throw new Error(result.message || result.msg || 'API returned error');
        }

        // Parse balance from various field names
        const balance = parseFloat(
            result.balance ??
            result.saldo ??
            result.credit ??
            result.deposit ??
            result.data?.balance ??
            result.data?.saldo ??
            result.user?.balance ??
            0
        );

        const currency = result.currency || result.mata_uang || panel.currency || 'IDR';

        console.log(`[SMM] Parsed balance: ${balance} ${currency}`);

        // Update cached balance
        await prisma.smmPanel.update({
            where: { id: panelId },
            data: {
                balance: balance,
                currency: currency,
                lastSyncAt: new Date()
            }
        });

        return {
            balance: balance,
            currency: currency
        };
    }


    /**
     * Get all services from panel
     */
    async getServices(panelId) {
        const panel = await prisma.smmPanel.findUnique({
            where: { id: panelId }
        });

        if (!panel) {
            throw new Error('Panel not found');
        }

        const result = await this.makeRequest(panel, 'services');

        if (result.error) {
            throw new Error(result.error);
        }

        return Array.isArray(result) ? result : [];
    }

    /**
     * Get order status from panel
     */
    async getOrderStatus(panelId, orderId) {
        const panel = await prisma.smmPanel.findUnique({
            where: { id: panelId }
        });

        if (!panel) {
            throw new Error('Panel not found');
        }

        const result = await this.makeRequest(panel, 'status', { order: orderId });

        if (result.error) {
            throw new Error(result.error);
        }

        return {
            status: result.status,
            charge: result.charge,
            startCount: result.start_count,
            remains: result.remains,
            currency: result.currency
        };
    }

    /**
     * Get multiple orders status
     */
    async getMultipleOrdersStatus(panelId, orderIds) {
        const panel = await prisma.smmPanel.findUnique({
            where: { id: panelId }
        });

        if (!panel) {
            throw new Error('Panel not found');
        }

        const result = await this.makeRequest(panel, 'status', {
            orders: orderIds.join(',')
        });

        if (result.error) {
            throw new Error(result.error);
        }

        return result;
    }

    /**
     * Create refill request
     */
    async createRefill(panelId, orderId) {
        const panel = await prisma.smmPanel.findUnique({
            where: { id: panelId }
        });

        if (!panel) {
            throw new Error('Panel not found');
        }

        const result = await this.makeRequest(panel, 'refill', { order: orderId });

        if (result.error) {
            throw new Error(result.error);
        }

        return {
            refillId: result.refill,
            success: true
        };
    }

    /**
     * Get refill status
     */
    async getRefillStatus(panelId, refillId) {
        const panel = await prisma.smmPanel.findUnique({
            where: { id: panelId }
        });

        if (!panel) {
            throw new Error('Panel not found');
        }

        const result = await this.makeRequest(panel, 'refill_status', { refill: refillId });

        if (result.error) {
            throw new Error(result.error);
        }

        return {
            status: result.status
        };
    }

    /**
     * Create cancel request
     */
    async createCancel(panelId, orderIds) {
        const panel = await prisma.smmPanel.findUnique({
            where: { id: panelId }
        });

        if (!panel) {
            throw new Error('Panel not found');
        }

        const idsString = Array.isArray(orderIds) ? orderIds.join(',') : orderIds;
        const result = await this.makeRequest(panel, 'cancel', { orders: idsString });

        if (result.error) {
            throw new Error(result.error);
        }

        return result;
    }

    /**
     * Create new order on panel
     */
    async createOrder(panelId, serviceId, link, quantity) {
        const panel = await prisma.smmPanel.findUnique({
            where: { id: panelId }
        });

        if (!panel) {
            throw new Error('Panel not found');
        }

        const result = await this.makeRequest(panel, 'add', {
            service: serviceId,
            link: link,
            quantity: quantity
        });

        if (result.error) {
            throw new Error(result.error);
        }

        return {
            orderId: result.order,
            success: true
        };
    }

    /**
     * Sync orders status from panel
     */
    async syncOrderStatus(userId, panelId) {
        const orders = await prisma.order.findMany({
            where: {
                panelId,
                userId,
                status: {
                    in: ['PENDING', 'IN_PROGRESS', 'PROCESSING']
                }
            }
        });

        if (orders.length === 0) {
            return { updated: 0, orders: [] };
        }

        const panel = await prisma.smmPanel.findUnique({
            where: { id: panelId }
        });

        if (!panel) {
            throw new Error('Panel not found');
        }

        const updatedOrders = [];
        const batchSize = 100;

        for (let i = 0; i < orders.length; i += batchSize) {
            const batch = orders.slice(i, i + batchSize);
            const orderIds = batch.map(o => o.externalOrderId);

            try {
                const statuses = await this.getMultipleOrdersStatus(panelId, orderIds);

                for (const order of batch) {
                    const statusData = statuses[order.externalOrderId];
                    if (statusData && !statusData.error) {
                        const newStatus = this.mapStatus(statusData.status);

                        if (order.status !== newStatus) {
                            await prisma.order.update({
                                where: { id: order.id },
                                data: {
                                    status: newStatus,
                                    startCount: statusData.start_count ? parseInt(statusData.start_count) : order.startCount,
                                    remains: statusData.remains ? parseInt(statusData.remains) : order.remains,
                                    charge: statusData.charge ? parseFloat(statusData.charge) : order.charge,
                                    lastCheckedAt: new Date()
                                }
                            });
                            updatedOrders.push({
                                orderId: order.externalOrderId,
                                oldStatus: order.status,
                                newStatus
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`[SMM] Sync batch error:`, error.message);
            }
        }

        return {
            updated: updatedOrders.length,
            orders: updatedOrders
        };
    }

    /**
     * Map SMM Panel status to our status enum
     */
    mapStatus(panelStatus) {
        const statusMap = {
            'Pending': 'PENDING',
            'In progress': 'IN_PROGRESS',
            'Processing': 'IN_PROGRESS',
            'Completed': 'COMPLETED',
            'Partial': 'PARTIAL',
            'Canceled': 'CANCELLED',
            'Cancelled': 'CANCELLED',
            'Refunded': 'REFUNDED'
        };
        return statusMap[panelStatus] || 'PENDING';
    }
    /**
     * Import orders from external source
     */
    async importOrders(userId, panelId, orders) {
        const imported = [];
        const errors = [];

        for (const order of orders) {
            try {
                const existing = await prisma.order.findFirst({
                    where: {
                        externalOrderId: order.orderId.toString(),
                        panelId
                    }
                });

                if (existing) {
                    errors.push({
                        orderId: order.orderId,
                        error: 'Order already exists'
                    });
                    continue;
                }

                const created = await prisma.order.create({
                    data: {
                        externalOrderId: order.orderId.toString(),
                        panelId,
                        userId,
                        serviceId: order.serviceId?.toString(),
                        serviceName: order.serviceName,
                        link: order.link,
                        quantity: order.quantity ? parseInt(order.quantity) : null,
                        charge: order.charge ? parseFloat(order.charge) : null,
                        status: 'PENDING'
                    }
                });

                imported.push(created);
            } catch (error) {
                errors.push({
                    orderId: order.orderId,
                    error: error.message
                });
            }
        }

        return { imported, errors };
    }

    // ==================== ADMIN API INTEGRATION ====================

    /**
     * Check if panel has Admin API access
     * @param {string} panelId - Panel ID
     * @returns {boolean} Has admin API access
     */
    async hasAdminApiAccess(panelId) {
        try {
            const panel = await prisma.smmPanel.findUnique({
                where: { id: panelId }
            });

            return panel?.supportsAdminApi && !!panel?.adminApiKey;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get full order details with provider info
     * Uses Admin API if available, falls back to normal API
     * @param {string} panelId - Panel ID
     * @param {string} orderId - External order ID
     * @returns {Object} Order details with provider info
     */
    async getOrderFullDetails(panelId, orderId) {
        const adminApiService = require('./adminApiService');

        const panel = await prisma.smmPanel.findUnique({
            where: { id: panelId }
        });

        if (!panel) {
            return { success: false, error: 'Panel not found' };
        }

        // Try Admin API first if available
        if (panel.supportsAdminApi && panel.adminApiKey) {
            const adminResult = await adminApiService.getOrderWithProvider(panel, orderId);

            if (adminResult.success) {
                return {
                    success: true,
                    source: 'admin_api',
                    data: adminResult.data
                };
            }

            // If admin API fails, log and fall back
            console.log(`[SMM] Admin API failed for order ${orderId}, falling back to normal API`);
        }

        // Fall back to normal API
        try {
            const normalResult = await this.getOrderStatus(panelId, orderId);

            if (!normalResult.order) {
                return {
                    success: false,
                    error: normalResult.error || 'Order not found'
                };
            }

            return {
                success: true,
                source: 'normal_api',
                data: {
                    orderId: orderId,
                    externalOrderId: orderId,
                    status: normalResult.order.status,
                    startCount: normalResult.order.start_count,
                    remains: normalResult.order.remains,
                    charge: normalResult.order.charge,
                    // Provider info not available from normal API
                    providerName: null,
                    providerOrderId: null,
                    providerStatus: null,
                    providerCharge: null
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Sync provider info for an order from Admin API
     * @param {string} panelId - Panel ID
     * @param {string} orderId - External order ID
     * @returns {Object} Sync result
     */
    async syncOrderProviderInfo(panelId, orderId) {
        const adminApiService = require('./adminApiService');

        const panel = await prisma.smmPanel.findUnique({
            where: { id: panelId }
        });

        if (!panel) {
            return { success: false, error: 'Panel not found' };
        }

        if (!panel.supportsAdminApi || !panel.adminApiKey) {
            return {
                success: false,
                error: 'Admin API not configured for this panel'
            };
        }

        return await adminApiService.syncOrderProviderInfo(panel, orderId);
    }

    /**
     * Sync provider info for multiple orders
     * @param {string} panelId - Panel ID
     * @param {Array<string>} orderIds - Array of external order IDs
     * @returns {Object} Sync results
     */
    async syncMultipleOrdersProviderInfo(panelId, orderIds) {
        const adminApiService = require('./adminApiService');

        const panel = await prisma.smmPanel.findUnique({
            where: { id: panelId }
        });

        if (!panel) {
            return { success: false, error: 'Panel not found' };
        }

        if (!panel.supportsAdminApi || !panel.adminApiKey) {
            return {
                success: false,
                error: 'Admin API not configured for this panel'
            };
        }

        return await adminApiService.syncMultipleOrdersProviderInfo(panel, orderIds);
    }

    /**
     * Get providers list from panel via Admin API
     * @param {string} panelId - Panel ID
     * @returns {Object} Providers list
     */
    async getProvidersList(panelId) {
        const adminApiService = require('./adminApiService');

        const panel = await prisma.smmPanel.findUnique({
            where: { id: panelId }
        });

        if (!panel) {
            return { success: false, error: 'Panel not found' };
        }

        if (!panel.supportsAdminApi || !panel.adminApiKey) {
            return {
                success: false,
                error: 'Admin API not configured for this panel'
            };
        }

        return await adminApiService.getProvidersList(panel);
    }

    /**
     * Test Admin API connection
     * @param {string} panelId - Panel ID
     * @returns {Object} Connection test result
     */
    async testAdminApiConnection(panelId) {
        const adminApiService = require('./adminApiService');

        const panel = await prisma.smmPanel.findUnique({
            where: { id: panelId }
        });

        if (!panel) {
            return { success: false, message: 'Panel not found', capabilities: [] };
        }

        if (!panel.adminApiKey) {
            return {
                success: false,
                message: 'Admin API key not configured',
                capabilities: []
            };
        }

        return await adminApiService.testAdminConnection(panel);
    }
}

module.exports = new SmmPanelService();
