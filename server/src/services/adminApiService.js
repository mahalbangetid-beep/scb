/**
 * Admin API Service
 * 
 * Service for interacting with SMM Panel Admin API (RentalPanel/PerfectPanel Admin API v2)
 * This service provides access to provider-level data that is not available via normal User API.
 * 
 * Key capabilities:
 * - Get order with provider info (external_id, provider name)
 * - Fetch providers list
 * - Sync provider info for orders
 * 
 * Authentication: Uses X-Api-Key header
 * Rate Limit: 5 requests per second per panel
 * 
 * @see ADMIN_API_DOCS.md for full API documentation
 * @see document.yaml for OpenAPI specification
 */

const axios = require('axios');
const prisma = require('../utils/prisma');
const { decrypt, encrypt } = require('../utils/encryption');

class AdminApiService {
    constructor() {
        // Rate limiting: track requests per panel
        this.requestCounts = new Map();
        this.RATE_LIMIT = 5; // requests per second
        this.RATE_WINDOW = 1000; // 1 second
    }

    /**
     * Detect if panel is a Rental Panel (v1 API)
     * Supports multiple naming conventions: RENTAL, V1, or URL-based detection
     */
    isRentalPanel(panel) {
        return panel.panelType === 'RENTAL'
            || panel.panelType === 'V1'
            || (panel.adminApiBaseUrl && panel.adminApiBaseUrl.includes('/adminapi/v1'));
    }

    // ==================== CORE METHODS ====================

    /**
     * Test admin API connection
     * Supports both Perfect Panel and Rental Panel API formats
     * @param {Object} panel - Panel object with adminApiKey
     * @returns {Object} { success, message, capabilities }
     */
    async testAdminConnection(panel) {
        try {
            if (!panel.adminApiKey) {
                return {
                    success: false,
                    message: 'Admin API key not configured',
                    capabilities: []
                };
            }

            const isRentalPanel = this.isRentalPanel(panel);
            let response;

            if (isRentalPanel) {
                // Rental Panel: Use getOrders action to test connection
                // Format: ?key=xxx&action=getOrders&limit=1
                // This returns valid response even with empty orders
                response = await this.makeAdminRequest(panel, 'GET', '', {
                    action: 'getOrders',
                    limit: 1
                });

                // For Rental Panel, check if we got a valid response structure
                // Valid responses:
                // - { status: "success", orders: [...] }
                // - { status: "error", error: "..." } (API is working, just error message)
                // - { data: [...] } or { orders: [...] }
                const data = response.data || {};
                const isValidResponse = response.success ||
                    data.status === 'success' ||
                    data.status === 'error' ||
                    data.error === 'bad_auth' ||
                    data.error === 'bad_action' ||
                    Array.isArray(data.orders) ||
                    Array.isArray(data.data) ||
                    Array.isArray(data);

                if (isValidResponse) {
                    // Check if it's an auth error
                    if (data.error === 'bad_auth' || (data.status === 'error' && data.error?.includes?.('auth'))) {
                        return {
                            success: false,
                            message: 'Invalid Admin API Key',
                            capabilities: []
                        };
                    }

                    return {
                        success: true,
                        message: 'Rental Panel Admin API connection successful',
                        capabilities: [
                            'get_orders',
                            'get_order_details',
                            'get_provider_info',
                            'update_orders',
                            'add_payment',
                            'get_user',
                            'create_ticket'
                        ]
                    };
                }
            } else {
                // Perfect Panel: Use /orders endpoint
                response = await this.makeAdminRequest(panel, 'GET', '/orders', {
                    limit: 1
                });

                if (response.success) {
                    return {
                        success: true,
                        message: 'Admin API connection successful',
                        capabilities: [
                            'get_orders',
                            'get_order_details',
                            'get_provider_info',
                            'update_orders',
                            'pull_orders',
                            'cancel_orders',
                            'refill_tasks'
                        ]
                    };
                }
            }

            return {
                success: false,
                message: response.error || 'Failed to connect to Admin API',
                capabilities: []
            };
        } catch (error) {
            console.error('[AdminApiService] testAdminConnection error:', error.message);
            return {
                success: false,
                message: `Connection failed: ${error.message}`,
                capabilities: []
            };
        }
    }

    /**
     * Get order with provider information
     * Supports both Perfect Panel and Rental Panel
     * @param {Object} panel - Panel object
     * @param {string|number} orderId - Panel order ID
     * @returns {Object} Order with provider info
     */
    async getOrderWithProvider(panel, orderId) {
        try {
            const isRentalPanel = this.isRentalPanel(panel);
            let response;

            if (isRentalPanel) {
                // Rental Panel: action=getOrders-by-id&orders=123&provider=1
                response = await this.makeAdminRequest(panel, 'GET', '', {
                    action: 'getOrders-by-id',
                    orders: orderId,
                    provider: 1
                });

                if (!response.success) {
                    return {
                        success: false,
                        error: response.error || 'Failed to fetch order'
                    };
                }

                // Rental Panel returns { status: "success", orders: [...] }
                const orders = response.data.orders || [];
                if (orders.length === 0) {
                    return {
                        success: false,
                        error: 'Order not found'
                    };
                }

                const order = orders[0];
                return {
                    success: true,
                    data: {
                        orderId: order.id,
                        externalOrderId: String(order.id),
                        status: this.normalizeStatus(order.order_status || order.status),

                        // Provider info
                        providerName: order.provider || null,
                        providerOrderId: order.external_id || null,
                        providerStatus: order.order_status || order.status,
                        providerCharge: order.provider_charge || null,

                        // Order details
                        serviceId: order.service_id,
                        serviceName: order.service,
                        link: order.link,
                        quantity: parseInt(order.quantity) || 0,
                        charge: parseFloat(order.charge) || 0,
                        startCount: parseInt(order.start_count) || 0,
                        remains: parseInt(order.remains) || 0,

                        // Customer info
                        customerUsername: order.username,
                        customerEmail: null,

                        // Available actions
                        canRefill: true,
                        canCancel: true,

                        createdAt: order.date ? new Date(order.date) : null,
                        _raw: order
                    }
                };
            } else {
                // Perfect Panel: RESTful /orders/{id}
                response = await this.makeAdminRequest(panel, 'GET', `/orders/${orderId}`);

                if (!response.success) {
                    return {
                        success: false,
                        error: response.error || 'Failed to fetch order'
                    };
                }

                // Perfect Panel response is wrapped: { data: { id, user, ... }, error_message, error_code }
                // Need to unwrap the inner 'data' object
                let order = response.data;
                if (order.data && typeof order.data === 'object' && order.data.id) {
                    order = order.data;  // Unwrap nested data
                }
                const actions = order.actions || {};

                // DEBUG: Log raw response to see all available fields
                console.log(`[AdminAPI] Order ${orderId} response received, status: ${order?.status || 'unknown'}`);

                return {
                    success: true,
                    data: {
                        orderId: order.id,
                        externalOrderId: String(order.id),
                        status: this.normalizeStatus(order.status),

                        providerName: order.provider || null,
                        providerOrderId: order.external_id || null,
                        providerStatus: order.status,
                        providerCharge: order.provider_charge || null,

                        serviceId: order.service_id || order.service?.id,
                        serviceName: order.service_name || order.service?.name,
                        link: order.link,
                        quantity: order.quantity,
                        charge: order.charge,
                        startCount: order.start_count,
                        remains: order.remains,

                        customerUsername: order.user || order.username,
                        customerEmail: order.user_email,

                        canRefill: actions.refill === true,
                        canCancel: actions.cancel_and_refund === true || actions.request_cancel === true,

                        createdAt: order.created_at ? new Date(order.created_at * 1000) : null,
                        _raw: order
                    }
                };
            }
        } catch (error) {
            console.error('[AdminApiService] getOrderWithProvider error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get multiple orders with provider information
     * Supports both Perfect Panel and Rental Panel
     * @param {Object} panel - Panel object
     * @param {Array<string|number>} orderIds - Array of panel order IDs
     * @returns {Object} Orders with provider info
     */
    async getOrdersWithProvider(panel, orderIds) {
        try {
            if (!orderIds || orderIds.length === 0) {
                return { success: true, data: [] };
            }

            const isRentalPanel = this.isRentalPanel(panel);
            const idsParam = orderIds.join(',');
            let response;

            if (isRentalPanel) {
                // Rental Panel: action=getOrders-by-id&orders=123,456&provider=1
                response = await this.makeAdminRequest(panel, 'GET', '', {
                    action: 'getOrders-by-id',
                    orders: idsParam,
                    provider: 1
                });

                if (!response.success) {
                    return {
                        success: false,
                        error: response.error || 'Failed to fetch orders'
                    };
                }

                // Rental Panel returns { status: "success", orders: [...] }
                const orders = response.data.orders || [];

                const mappedOrders = orders.map(order => ({
                    orderId: order.id,
                    externalOrderId: String(order.id),
                    status: this.normalizeStatus(order.order_status || order.status),
                    providerName: order.provider || null,
                    providerOrderId: order.external_id || null,
                    providerStatus: order.order_status || order.status,
                    providerCharge: order.provider_charge || null,
                    serviceId: order.service_id,
                    serviceName: order.service,
                    link: order.link,
                    quantity: parseInt(order.quantity) || 0,
                    charge: parseFloat(order.charge) || 0,
                    startCount: parseInt(order.start_count) || 0,
                    remains: parseInt(order.remains) || 0,
                    customerUsername: order.username,
                    customerEmail: null
                }));

                return {
                    success: true,
                    data: mappedOrders
                };
            } else {
                // Perfect Panel: RESTful /orders?ids=xxx
                response = await this.makeAdminRequest(panel, 'GET', '/orders', {
                    ids: idsParam
                });

                if (!response.success) {
                    return {
                        success: false,
                        error: response.error || 'Failed to fetch orders'
                    };
                }

                const orders = response.data.data || response.data || [];

                const mappedOrders = orders.map(order => ({
                    orderId: order.id,
                    externalOrderId: String(order.id),
                    status: this.normalizeStatus(order.status),
                    providerName: order.provider || null,
                    providerOrderId: order.external_id || null,
                    providerStatus: order.status,
                    providerCharge: order.provider_charge || null,
                    serviceId: order.service_id,
                    serviceName: order.service_name,
                    link: order.link,
                    quantity: order.quantity,
                    charge: order.charge,
                    startCount: order.start_count,
                    remains: order.remains,
                    customerUsername: order.user,
                    customerEmail: order.user_email
                }));

                return {
                    success: true,
                    data: mappedOrders
                };
            }
        } catch (error) {
            console.error('[AdminApiService] getOrdersWithProvider error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get list of providers used by the panel
     * Uses multiple strategies per panel type with automatic fallback
     * @param {Object} panel - Panel object
     * @returns {Object} { success, data: [{ name, orderCount }] }
     */
    async getProvidersList(panel) {
        try {
            const isRentalPanel = this.isRentalPanel(panel);
            console.log(`[AdminApiService] getProvidersList for "${panel.alias}" (${isRentalPanel ? 'Rental/V1' : 'Perfect/V2'})`);

            if (isRentalPanel) {
                return await this._getProvidersV1(panel);
            } else {
                return await this._getProvidersV2(panel);
            }
        } catch (error) {
            console.error('[AdminApiService] getProvidersList error:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if an error indicates "no data" rather than a real failure
     */
    _isEmptyDataError(err) {
        if (!err) return false;
        const errLower = String(err).toLowerCase();
        const emptyPatterns = [
            'order_not_found', 'orders_not_found', 'no_orders',
            'not_found', 'empty', 'no_data', 'no orders'
        ];
        return emptyPatterns.some(e => errLower.includes(e));
    }

    /**
     * Extract unique provider names from an array of orders
     */
    _extractProvidersFromOrders(orders) {
        const providersMap = new Map();
        for (const order of orders) {
            const name = typeof order.provider === 'string'
                ? order.provider
                : (order.provider?.name || order.provider_name || null);
            if (!name) continue;
            if (providersMap.has(name)) {
                providersMap.get(name).orderCount++;
            } else {
                providersMap.set(name, { name, orderCount: 1 });
            }
        }
        return Array.from(providersMap.values()).sort((a, b) => b.orderCount - a.orderCount);
    }

    /**
     * V1 (Rental Panel) provider fetching — multi-strategy
     */
    async _getProvidersV1(panel) {
        // ── Strategy 1: getOrders with provider=1 (includes provider column) ──
        console.log(`[AdminApiService] V1 Strategy 1: getOrders&provider=1`);
        const res1 = await this.makeAdminRequest(panel, 'GET', '', {
            action: 'getOrders',
            provider: 1,
            limit: 1000
        });

        if (res1.success) {
            const orders = res1.data?.orders || res1.data?.data || res1.data || [];
            const list = Array.isArray(orders) ? orders : [];
            const providers = this._extractProvidersFromOrders(list);
            if (providers.length > 0) {
                console.log(`[AdminApiService] V1 Strategy 1 OK: ${providers.length} providers from ${list.length} orders`);
                return { success: true, data: providers };
            }
            if (list.length > 0) {
                console.log(`[AdminApiService] V1 Strategy 1: ${list.length} orders but no provider field`);
            }
        }

        // ── Strategy 2: getMassProviderData with sample order IDs ──
        // This works INDEPENDENTLY of getOrders (proven by testing)
        // Generate a range of order IDs to sample (1-50)
        console.log(`[AdminApiService] V1 Strategy 2: getMassProviderData (sample IDs 1-50)`);
        const sampleOrderIds = Array.from({ length: 50 }, (_, i) => String(i + 1));

        const provRes = await this.makeAdminRequest(panel, 'GET', '', {
            action: 'getMassProviderData',
            orders: sampleOrderIds.join(',')
        });

        if (provRes.success) {
            const providers = this._parseMassProviderData(provRes.data);
            if (providers.length > 0) {
                console.log(`[AdminApiService] V1 Strategy 2 OK (getMassProviderData): ${providers.length} providers`);
                return { success: true, data: providers };
            }
            console.log(`[AdminApiService] V1 Strategy 2: getMassProviderData returned no providers`);
        } else {
            console.log(`[AdminApiService] V1 Strategy 2: getMassProviderData failed: ${provRes.error}`);
        }

        // ── Strategy 3: Try getMassProviderData with higher order IDs ──
        // Some panels start order IDs much higher
        if (provRes.success || !provRes.error?.includes('bad_action')) {
            console.log(`[AdminApiService] V1 Strategy 3: getMassProviderData (sample IDs 100-500)`);
            const higherIds = [];
            for (let i = 100; i <= 500; i += 10) higherIds.push(String(i));

            const provRes2 = await this.makeAdminRequest(panel, 'GET', '', {
                action: 'getMassProviderData',
                orders: higherIds.join(',')
            });

            if (provRes2.success) {
                const providers = this._parseMassProviderData(provRes2.data);
                if (providers.length > 0) {
                    console.log(`[AdminApiService] V1 Strategy 3 OK (getMassProviderData higher IDs): ${providers.length} providers`);
                    return { success: true, data: providers };
                }
            }
        }

        // ── Strategy 4: Fallback — try extracting from getOrders (basic) ──
        console.log(`[AdminApiService] V1 Strategy 4: getOrders (basic fallback)`);
        const res4 = await this.makeAdminRequest(panel, 'GET', '', {
            action: 'getOrders',
            limit: 200
        });

        if (res4.success) {
            const orders = res4.data?.orders || res4.data?.data || res4.data || [];
            const list = Array.isArray(orders) ? orders : [];
            const providers = this._extractProvidersFromOrders(list);
            console.log(`[AdminApiService] V1 Strategy 4: ${providers.length} providers from ${list.length} orders`);
            return { success: true, data: providers };
        }

        if (this._isEmptyDataError(res4.error)) {
            console.log(`[AdminApiService] V1: All strategies exhausted, panel has no accessible order/provider data`);
            return { success: true, data: [] };
        }

        return { success: false, error: res4.error || res1.error || 'Failed to fetch providers' };
    }

    /**
     * Parse getMassProviderData response (supports both array and object format)
     * Array format:  { data: [{ provider_id, provider_name, orders: [...] }] }
     * Object format: { data: { "orderId": { provider: "X", ... } } }
     */
    _parseMassProviderData(responseData) {
        const providersMap = new Map();
        const data = responseData?.data || responseData || [];

        if (Array.isArray(data)) {
            // Array format: [{ provider_id, provider_name, orders: [...] }]
            for (const item of data) {
                const name = item.provider_name || item.provider || item.name;
                if (!name) continue;
                const orderCount = item.orders?.length || item.total_orders || 1;
                if (providersMap.has(name)) {
                    providersMap.get(name).orderCount += orderCount;
                } else {
                    providersMap.set(name, { name, orderCount });
                }
            }
        } else if (typeof data === 'object') {
            // Object format: { "orderId": { provider: "X", ... } }
            for (const info of Object.values(data)) {
                const name = info?.provider || info?.provider_name;
                if (!name) continue;
                if (providersMap.has(name)) {
                    providersMap.get(name).orderCount++;
                } else {
                    providersMap.set(name, { name, orderCount: 1 });
                }
            }
        }

        return Array.from(providersMap.values()).sort((a, b) => b.orderCount - a.orderCount);
    }

    /**
     * V2 (Perfect Panel) provider fetching — multi-strategy
     */
    async _getProvidersV2(panel) {
        // ── Strategy 1: /orders bulk fetch ──
        console.log(`[AdminApiService] V2 Strategy 1: /orders?limit=1000`);
        const res1 = await this.makeAdminRequest(panel, 'GET', '/orders', {
            limit: 1000,
            sort: 'date-desc'
        });

        if (!res1.success) {
            if (this._isEmptyDataError(res1.error)) {
                console.log(`[AdminApiService] V2: "${res1.error}" — 0 providers`);
                return { success: true, data: [] };
            }
            return { success: false, error: res1.error || 'Failed to fetch orders' };
        }

        const orders = res1.data?.data || res1.data || [];
        const ordersList = Array.isArray(orders) ? orders : [];

        if (ordersList.length === 0) {
            console.log(`[AdminApiService] V2: Orders list empty — 0 providers`);
            return { success: true, data: [] };
        }

        // Check if bulk response already has provider info
        const bulkProviders = this._extractProvidersFromOrders(ordersList);
        if (bulkProviders.length > 0) {
            console.log(`[AdminApiService] V2 Strategy 1 OK: ${bulkProviders.length} providers from ${ordersList.length} orders`);
            return { success: true, data: bulkProviders };
        }

        // ── Strategy 2: Sample individual orders (GET /orders/{id} includes provider) ──
        console.log(`[AdminApiService] V2 Strategy 2: Sampling individual orders for provider info...`);
        const sampleIds = ordersList
            .map(o => o.id)
            .filter(Boolean)
            .slice(0, 15); // Sample 15 orders max to avoid rate limits

        const providersMap = new Map();
        let fetchedCount = 0;

        for (const orderId of sampleIds) {
            try {
                const orderRes = await this.makeAdminRequest(panel, 'GET', `/orders/${orderId}`);
                if (!orderRes.success) continue;

                fetchedCount++;
                const order = orderRes.data?.data || orderRes.data || {};
                const name = typeof order.provider === 'string'
                    ? order.provider
                    : (order.provider?.name || order.provider_name || null);

                if (!name) continue;
                if (providersMap.has(name)) {
                    providersMap.get(name).orderCount++;
                } else {
                    providersMap.set(name, { name, orderCount: 1 });
                }
            } catch (e) {
                continue; // Skip failed fetches
            }
        }

        const providers = Array.from(providersMap.values()).sort((a, b) => b.orderCount - a.orderCount);
        console.log(`[AdminApiService] V2 Strategy 2: ${providers.length} providers from ${fetchedCount} sampled orders`);
        return { success: true, data: providers };
    }

    /**
     * Sync provider info for a specific order and update database
     * @param {Object} panel - Panel object
     * @param {string} orderId - Panel order ID (external order ID in our DB)
     * @returns {Object} Updated order
     */
    async syncOrderProviderInfo(panel, orderId) {
        try {
            // Fetch from Admin API
            const result = await this.getOrderWithProvider(panel, orderId);

            if (!result.success) {
                return result;
            }

            const providerData = result.data;

            // Find order in our database
            const order = await prisma.order.findFirst({
                where: {
                    externalOrderId: String(orderId),
                    panelId: panel.id
                }
            });

            if (!order) {
                return {
                    success: false,
                    error: 'Order not found in database'
                };
            }

            // Update order with provider info
            const updatedOrder = await prisma.order.update({
                where: { id: order.id },
                data: {
                    providerName: providerData.providerName,
                    providerOrderId: providerData.providerOrderId,
                    providerStatus: providerData.providerStatus,
                    providerCharge: providerData.providerCharge,
                    providerSyncedAt: new Date(),
                    // Also update other fields if available
                    serviceName: providerData.serviceName || order.serviceName,
                    link: providerData.link || order.link,
                    status: providerData.status || order.status,
                    startCount: providerData.startCount ?? order.startCount,
                    remains: providerData.remains ?? order.remains,
                    customerUsername: providerData.customerUsername || order.customerUsername,
                    customerEmail: providerData.customerEmail || order.customerEmail,
                    // Actions availability
                    canRefill: providerData.canRefill ?? order.canRefill,
                    canCancel: providerData.canCancel ?? order.canCancel,
                    actionsUpdatedAt: new Date()
                }
            });

            return {
                success: true,
                data: updatedOrder
            };
        } catch (error) {
            console.error('[AdminApiService] syncOrderProviderInfo error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Sync provider info for multiple orders
     * @param {Object} panel - Panel object
     * @param {Array<string>} orderIds - Array of order IDs
     * @returns {Object} Sync results
     */
    async syncMultipleOrdersProviderInfo(panel, orderIds) {
        try {
            const result = await this.getOrdersWithProvider(panel, orderIds);

            if (!result.success) {
                return result;
            }

            const syncResults = {
                total: orderIds.length,
                synced: 0,
                failed: 0,
                errors: []
            };

            for (const providerData of result.data) {
                try {
                    const order = await prisma.order.findFirst({
                        where: {
                            externalOrderId: String(providerData.orderId),
                            panelId: panel.id
                        }
                    });

                    if (order) {
                        await prisma.order.update({
                            where: { id: order.id },
                            data: {
                                providerName: providerData.providerName,
                                providerOrderId: providerData.providerOrderId,
                                providerStatus: providerData.providerStatus,
                                providerCharge: providerData.providerCharge,
                                providerSyncedAt: new Date(),
                                status: providerData.status || order.status,
                                startCount: providerData.startCount ?? order.startCount,
                                remains: providerData.remains ?? order.remains
                            }
                        });
                        syncResults.synced++;
                    } else {
                        syncResults.failed++;
                        syncResults.errors.push(`Order ${providerData.orderId} not found in database`);
                    }
                } catch (err) {
                    syncResults.failed++;
                    syncResults.errors.push(`Order ${providerData.orderId}: ${err.message}`);
                }
            }

            return {
                success: true,
                data: syncResults
            };
        } catch (error) {
            console.error('[AdminApiService] syncMultipleOrdersProviderInfo error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ==================== REFILL & CANCEL TASKS ====================

    /**
     * Pull pending refill tasks from panel
     * @param {Object} panel - Panel object
     * @param {Object} options - { serviceIds, limit }
     */
    async pullRefillTasks(panel, options = {}) {
        try {
            const response = await this.makeAdminRequest(panel, 'POST', '/refill/pull', {
                service_ids: options.serviceIds,
                limit: options.limit || 100
            });

            return response;
        } catch (error) {
            console.error('[AdminApiService] pullRefillTasks error:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Pull pending cancel tasks from panel
     * @param {Object} panel - Panel object
     * @param {Object} options - { serviceIds, limit }
     */
    async pullCancelTasks(panel, options = {}) {
        try {
            const response = await this.makeAdminRequest(panel, 'POST', '/cancel/pull', {
                service_ids: options.serviceIds,
                limit: options.limit || 100
            });

            return response;
        } catch (error) {
            console.error('[AdminApiService] pullCancelTasks error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ==================== COMMAND EXECUTION METHODS ====================

    /**
     * Create refill request via Admin API
     * Uses detected endpoint or falls back to common patterns
     * @param {Object} panel - Panel object
     * @param {string} orderId - External order ID
     * @returns {Object} { success, refillId, message }
     */
    async createRefill(panel, orderId) {
        try {
            console.log(`[AdminAPI] Creating refill for order ${orderId} on panel ${panel.alias}`);

            // Use detected endpoint if available
            if (panel.detectedRefillEndpoint) {
                console.log(`[AdminAPI] Using detected endpoint: ${panel.detectedRefillEndpoint}`);
                const response = await this.makeAdminRequest(panel, 'POST', panel.detectedRefillEndpoint, {
                    order: orderId
                });

                if (response.success !== false && !response.error) {
                    return {
                        success: true,
                        refillId: response.refill || response.id || orderId,
                        message: `Refill submitted via ${panel.detectedRefillEndpoint}`
                    };
                }
            }

            // Fallback: Try common refill endpoints
            const endpoints = ['/orders/resend', '/refill/change-status', '/adminapi/v2/orders/resend'];

            for (const endpoint of endpoints) {
                try {
                    const response = await this.makeAdminRequest(panel, 'POST', endpoint, {
                        order: orderId,
                        ...(endpoint.includes('change-status') && { status: 'approved' })
                    });

                    if (response.success !== false && !response.error) {
                        return {
                            success: true,
                            refillId: response.refill || response.id || orderId,
                            message: `Refill submitted via ${endpoint}`
                        };
                    }
                } catch (e) {
                    continue; // Try next endpoint
                }
            }

            throw new Error('No working refill endpoint found');
        } catch (error) {
            console.error('[AdminAPI] createRefill error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Create cancel request via Admin API
     * Uses detected endpoint or falls back to common patterns
     * @param {Object} panel - Panel object
     * @param {string} orderId - External order ID
     * @returns {Object} { success, message }
     */
    async createCancel(panel, orderId) {
        try {
            console.log(`[AdminAPI] Creating cancel for order ${orderId} on panel ${panel.alias}`);

            // Use detected endpoint if available
            if (panel.detectedCancelEndpoint) {
                console.log(`[AdminAPI] Using detected endpoint: ${panel.detectedCancelEndpoint}`);
                const response = await this.makeAdminRequest(panel, 'POST', panel.detectedCancelEndpoint, {
                    order: orderId
                });

                if (response.success !== false && !response.error) {
                    return {
                        success: true,
                        message: `Cancel submitted via ${panel.detectedCancelEndpoint}`
                    };
                }
            }

            // Fallback: Try common cancel endpoints
            const endpoints = ['/orders/cancel', '/orders/request-cancel', '/adminapi/v2/orders/cancel', '/cancel'];

            for (const endpoint of endpoints) {
                try {
                    const response = await this.makeAdminRequest(panel, 'POST', endpoint, {
                        order: orderId
                    });

                    if (response.success !== false && !response.error) {
                        return {
                            success: true,
                            message: `Cancel submitted via ${endpoint}`
                        };
                    }
                } catch (e) {
                    continue;
                }
            }

            throw new Error('No working cancel endpoint found');
        } catch (error) {
            console.error('[AdminAPI] createCancel error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get order status via Admin API
     * Uses detected endpoint or falls back to common patterns
     * @param {Object} panel - Panel object
     * @param {string} orderId - External order ID
     * @returns {Object} { success, status, charge, startCount, remains, ... }
     */
    async getOrderStatus(panel, orderId) {
        try {
            console.log(`[AdminAPI] Getting status for order ${orderId} on panel ${panel.alias}`);

            const isRental = this.isRentalPanel(panel);
            let response;

            if (isRental) {
                // V1/Rental Panel: Use getOrders-by-id to look up order by ID
                // Note: getOrders only filters by service type (not order ID),
                // so getOrders-by-id is the only action that accepts order IDs
                const v1Actions = [
                    { action: 'getOrders-by-id', params: { orders: orderId, provider: 1 } },
                ];

                let v1Response = null;
                let v1Error = null;

                for (const attempt of v1Actions) {
                    try {
                        console.log(`[AdminAPI] V1 panel — trying action=${attempt.action}`);
                        const res = await this.makeAdminRequest(panel, 'GET', '', {
                            action: attempt.action,
                            ...attempt.params
                        });

                        if (res.error) {
                            console.log(`[AdminAPI] V1 action ${attempt.action} error: ${res.error}`);
                            v1Error = res.error;
                            continue;
                        }

                        v1Response = res;
                        console.log(`[AdminAPI] V1 action ${attempt.action} succeeded`);
                        break;
                    } catch (e) {
                        console.log(`[AdminAPI] V1 action ${attempt.action} threw: ${e.message}`);
                        v1Error = e.message;
                    }
                }

                if (!v1Response) {
                    throw new Error(v1Error || 'All V1 actions failed');
                }

                response = v1Response;

                // Extract order data from V1 response
                // Supports multiple formats:
                // - getOrders: { "7618634": { id, status, ... } }
                // - getOrders-by-id: { orders: [{ id, status, ... }] }
                let orderData = null;
                const resData = response.data || response;

                // Format 1: getOrders-by-id returns { orders: [...] }
                if (resData.orders && Array.isArray(resData.orders) && resData.orders.length > 0) {
                    orderData = resData.orders[0];
                }
                // Format 2: getOrders returns { "orderId": { ... } }
                else if (resData[orderId]) {
                    orderData = resData[orderId];
                } else if (resData[String(orderId)]) {
                    orderData = resData[String(orderId)];
                } else if (typeof resData === 'object' && resData.id) {
                    orderData = resData;
                } else {
                    // Try first key if response is an object with order data
                    const keys = Object.keys(resData).filter(k => k !== 'error' && k !== 'success' && k !== 'status' && k !== 'orders');
                    if (keys.length > 0 && typeof resData[keys[0]] === 'object') {
                        orderData = resData[keys[0]];
                    }
                }

                if (!orderData) {
                    throw new Error(`Order ${orderId} not found in panel response`);
                }

                // V1 responses use different field names depending on action:
                // getOrders: { status, user, provider, ... }
                // getOrders-by-id: { order_status, username, provider, service, ... }
                const orderStatus = orderData.order_status || orderData.status;
                const customerUser = orderData.username || orderData.user;
                const serviceName = orderData.service || orderData.service_name || orderData.service?.name;

                console.log(`[AdminAPI] V1 order data for ${orderId}: status=${orderStatus}, user=${customerUser}, provider=${orderData.provider}, service=${serviceName}`);

                let chargeValue = null;
                if (orderData.charge) {
                    chargeValue = typeof orderData.charge === 'object'
                        ? parseFloat(orderData.charge.value)
                        : parseFloat(orderData.charge);
                }

                return {
                    success: true,
                    status: this.normalizeStatus(orderStatus),
                    charge: chargeValue,
                    startCount: orderData.start_count ? parseInt(orderData.start_count) : null,
                    remains: orderData.remains !== undefined ? parseInt(orderData.remains) : null,
                    quantity: orderData.quantity ? parseInt(orderData.quantity) : null,
                    link: orderData.link,
                    serviceName: serviceName || null,
                    // Customer info - CRITICAL for User Mapping validation
                    customerUsername: customerUser || null,
                    providerName: typeof orderData.provider === 'string' ? orderData.provider :
                        (orderData.provider?.name || orderData.provider_name || null),
                    providerOrderId: orderData.external_id || orderData.provider_order_id || null,
                    providerStatus: orderData.provider_status || orderStatus,
                    // V1 panels don't always return actions — default to true (allow attempt)
                    canRefill: orderData.actions?.refill ?? orderData.actions?.resend ?? true,
                    canCancel: orderData.actions?.cancel_and_refund ?? orderData.actions?.request_cancel ?? true
                };

            } else {
                // V2/Perfect Panel: Use RESTful endpoint /orders/{id}
                if (panel.detectedStatusEndpoint) {
                    let endpoint = panel.detectedStatusEndpoint.replace('{id}', orderId);
                    endpoint = endpoint.replace(/^\/adminapi\/v[12]/, '');
                    console.log(`[AdminAPI] Using detected endpoint: ${endpoint}`);
                    response = await this.makeAdminRequest(panel, 'GET', endpoint);
                } else {
                    response = await this.makeAdminRequest(panel, 'GET', `/orders/${orderId}`);
                }

                if (response.error) {
                    throw new Error(response.error);
                }

                // Handle nested response structure
                let orderData = response.data || response;
                if (orderData.data && typeof orderData.data === 'object' && orderData.data.id) {
                    orderData = orderData.data;
                }

                console.log(`[AdminAPI] Extracted order data for ${orderId}: status=${orderData.status}, provider=${orderData.provider}`);

                let chargeValue = null;
                if (orderData.charge) {
                    chargeValue = typeof orderData.charge === 'object'
                        ? parseFloat(orderData.charge.value)
                        : parseFloat(orderData.charge);
                }

                return {
                    success: true,
                    status: this.normalizeStatus(orderData.status),
                    charge: chargeValue,
                    startCount: orderData.start_count ? parseInt(orderData.start_count) : null,
                    remains: orderData.remains !== undefined ? parseInt(orderData.remains) : null,
                    quantity: orderData.quantity ? parseInt(orderData.quantity) : null,
                    link: orderData.link,
                    serviceName: orderData.service_name,
                    customerUsername: orderData.user || orderData.username || null,
                    providerName: typeof orderData.provider === 'string' ? orderData.provider : orderData.provider?.name,
                    providerOrderId: orderData.external_id || orderData.provider_order_id,
                    providerStatus: orderData.status,
                    canRefill: orderData.actions?.refill === true || orderData.actions?.resend === true,
                    canCancel: orderData.actions?.cancel_and_refund === true || orderData.actions?.request_cancel === true
                };
            }
        } catch (error) {
            console.error('[AdminAPI] getOrderStatus error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get multiple orders status via Admin API
     * @param {Object} panel - Panel object
     * @param {Array<string>} orderIds - Array of external order IDs
     * @returns {Object} { success, orders: { orderId: statusData } }
     */
    async getMultipleOrdersStatus(panel, orderIds) {
        try {
            console.log(`[AdminAPI] Getting status for ${orderIds.length} orders on panel ${panel.alias}`);

            const results = {};

            // Fetch in batches of 10
            for (let i = 0; i < orderIds.length; i += 10) {
                const batch = orderIds.slice(i, i + 10);

                // Try bulk endpoint first
                const response = await this.makeAdminRequest(panel, 'GET', '/orders', {
                    ids: batch.join(','),
                    limit: 10
                });

                if (response.data && Array.isArray(response.data)) {
                    for (const order of response.data) {
                        const oid = order.id?.toString() || order.order_id?.toString();
                        if (oid) {
                            results[oid] = {
                                status: this.normalizeStatus(order.status),
                                charge: order.charge ? parseFloat(order.charge) : null,
                                start_count: order.start_count,
                                remains: order.remains
                            };
                        }
                    }
                } else {
                    // Fallback: fetch individually
                    for (const orderId of batch) {
                        const statusResult = await this.getOrderStatus(panel, orderId);
                        if (statusResult.success) {
                            results[orderId] = statusResult;
                        }
                    }
                }
            }

            return {
                success: true,
                orders: results
            };
        } catch (error) {
            console.error('[AdminAPI] getMultipleOrdersStatus error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Change order status via Admin API
     * @param {Object} panel - Panel object
     * @param {string} orderId - External order ID
     * @param {string} newStatus - New status (completed, partial, canceled, in_progress)
     * @param {Object} options - { remains, startCount }
     * @returns {Object} { success, message }
     */
    async changeOrderStatus(panel, orderId, newStatus, options = {}) {
        try {
            console.log(`[AdminAPI] Changing status for order ${orderId} to ${newStatus}`);

            const response = await this.makeAdminRequest(panel, 'POST', '/orders/change-status', {
                order: orderId,
                status: newStatus,
                ...(options.remains !== undefined && { remains: options.remains }),
                ...(options.startCount !== undefined && { start_count: options.startCount })
            });

            if (response.error) {
                throw new Error(response.error);
            }

            return {
                success: true,
                message: `Order status changed to ${newStatus}`
            };
        } catch (error) {
            console.error('[AdminAPI] changeOrderStatus error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ==================== FONEPAY METHODS ====================

    /**
     * Verify FonePay payment via Rental Panel Admin API
     * @param {Object} panel - Panel object
     * @param {string} txnId - FonePay Transaction ID
     * @returns {Object} { exists, status, amount, timestamp }
     */
    async verifyFonepayPayment(panel, txnId) {
        try {
            const endpoint = panel.fonepayVerifyEndpoint || '/adminapi/verify-payment';
            const response = await this.makeAdminRequest(panel, 'GET', endpoint, {
                txn_id: txnId
            });

            return {
                success: true,
                data: response
            };
        } catch (error) {
            console.error('[AdminAPI] verifyFonepayPayment error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Add fund to panel user via Admin API
     * @param {Object} panel - Panel object
     * @param {string} username - Panel username
     * @param {number} amount - Amount to credit
     * @returns {Object} { success, data }
     */
    async addFundToUser(panel, username, amount) {
        try {
            const endpoint = panel.fonepayAddFundEndpoint || '/adminapi/add-fund';
            const response = await this.makeAdminRequest(panel, 'POST', endpoint, {
                username,
                amount
            });

            if (!response || response.success === false || response.error) {
                throw new Error(response?.error || 'Add fund API call failed');
            }

            return {
                success: true,
                data: response
            };
        } catch (error) {
            console.error('[AdminAPI] addFundToUser error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Validate if username exists in panel via Admin API
     * @param {Object} panel - Panel object
     * @param {string} username - Username to validate
     * @returns {Object} { exists: boolean }
     */
    async validateUsername(panel, username) {
        try {
            const isV1 = this.isRentalPanel(panel);

            if (isV1) {
                // V1/Rental: Try getting orders by user — if returns data, user exists
                const response = await this.makeAdminRequest(panel, 'GET', '/adminapi/v1', {
                    action: 'getOrders-by-user',
                    username: username,
                    limit: 1
                });

                // If we got a valid response (even empty array), user likely exists
                // If error says "user not found" or similar, user doesn't exist
                if (response && response.error) {
                    const errStr = (response.error || '').toLowerCase();
                    if (errStr.includes('not found') || errStr.includes('invalid user') || errStr.includes('no user')) {
                        return { exists: false };
                    }
                }

                // Got some response = user exists
                return { exists: true };
            } else {
                // V2/Perfect Panel: Try user lookup endpoint
                try {
                    const response = await this.makeAdminRequest(panel, 'GET', '/adminapi/users', {
                        search: username
                    });

                    if (response && Array.isArray(response.data)) {
                        const found = response.data.some(u =>
                            (u.username || '').toLowerCase() === username.toLowerCase()
                        );
                        return { exists: found };
                    }

                    // If response has users directly
                    if (response && Array.isArray(response)) {
                        const found = response.some(u =>
                            (u.username || '').toLowerCase() === username.toLowerCase()
                        );
                        return { exists: found };
                    }
                } catch (v2Err) {
                    // V2 user lookup not available — try orders fallback
                    console.log(`[AdminAPI] V2 user lookup failed, trying orders fallback: ${v2Err.message}`);
                }

                // Fallback: Try getting orders by user
                try {
                    const response = await this.makeAdminRequest(panel, 'GET', '/adminapi/orders', {
                        user: username,
                        limit: 1
                    });

                    if (response && !response.error) {
                        return { exists: true };
                    }
                } catch (e) {
                    // Ignore
                }

                // Can't determine — assume exists (graceful fallback)
                console.log(`[AdminAPI] Cannot validate username "${username}" — allowing as fallback`);
                return { exists: true };
            }
        } catch (error) {
            console.error(`[AdminAPI] validateUsername error:`, error.message);
            // On error, allow registration (graceful degradation)
            return { exists: true };
        }
    }

    // ==================== HELPER METHODS ====================



    /**
     * Make request to Admin API
     * Supports both Perfect Panel (header auth, RESTful) and Rental Panel (query param auth, action-based)
     * @param {Object} panel - Panel object with adminApiKey
     * @param {string} method - HTTP method (GET, POST)
     * @param {string} endpoint - API endpoint (e.g., '/orders', '/orders/123') OR action for Rental Panel
     * @param {Object} params - Query params for GET, body for POST
     * @returns {Object} API response
     */
    async makeAdminRequest(panel, method, endpoint, params = {}) {
        try {
            // Rate limiting check
            await this.checkRateLimit(panel.id);

            // Get admin API key
            const adminApiKey = this.decryptAdminApiKey(panel);
            if (!adminApiKey) {
                return {
                    success: false,
                    error: 'Admin API key not configured or invalid'
                };
            }

            const isRentalPanel = this.isRentalPanel(panel);

            // Build URL based on panel type, sanitize trailing slash to prevent double-slash URLs
            const rawBaseUrl = panel.adminApiBaseUrl || this.getDefaultAdminApiUrl(panel.url, panel.panelType);
            // Strip trailing slashes AND fix any internal double slashes in path (preserve https://)
            const baseUrl = rawBaseUrl.replace(/\/+$/, '').replace(/([^:])\/\/+/g, '$1/');

            let url, config;

            if (isRentalPanel) {
                // Rental Panel: Query param auth + action-based API
                // Format: /adminapi/v1?key=xxx&action=getuser&...
                url = baseUrl;

                config = {
                    method: method,
                    url,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 30000
                };

                // For Rental Panel, always include key as query param
                const rentalParams = {
                    key: adminApiKey,
                    ...params
                };

                if (method === 'GET') {
                    config.params = rentalParams;
                } else {
                    // For POST, send as form-urlencoded or body with key
                    config.data = rentalParams;
                }
            } else {
                // Perfect Panel: Header auth + RESTful API
                // Sanitize potential double slashes in the assembled URL
                url = `${baseUrl}${endpoint}`.replace(/([^:])\/\/+/g, '$1/');

                config = {
                    method,
                    url,
                    headers: {
                        'X-Api-Key': adminApiKey,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 30000
                };

                if (method === 'GET') {
                    config.params = params;
                } else {
                    config.data = params;
                }
            }

            console.log(`[AdminApiService] ${method} ${url}`, {
                panelType: panel.panelType || 'GENERIC',
                params: method === 'GET' ? config.params : '[body]'
            });

            const response = await axios(config);

            // Track request for rate limiting
            this.trackRequest(panel.id);

            // Handle Rental Panel response format
            if (isRentalPanel) {
                const data = response.data;

                // Format 1: { status: "error", error: "..." }
                // Format 2: { error: "bad_auth" }
                // Format 3: { data: [], error_message: "...", error_code: 100 }

                // Check for bad_auth specifically
                if (data.error === 'bad_auth') {
                    return {
                        success: false,
                        error: 'Invalid Admin API Key (bad_auth)',
                        unauthorized: true,
                        data
                    };
                }

                // Check for error_message format (e.g., from SMM API errors)
                if (data.error_message && data.error_code) {
                    console.log(`[AdminApiService] Rental API error: ${data.error_message} (code: ${data.error_code})`);
                    return {
                        success: false,
                        error: data.error_message,
                        errorCode: data.error_code,
                        data
                    };
                }

                // Check for status: error format
                if (data.status === 'error' || data.error) {
                    return {
                        success: false,
                        error: data.error || data.message || 'Rental Panel API error',
                        data
                    };
                }
            }

            return {
                success: true,
                data: response.data,
                status: response.status
            };
        } catch (error) {
            console.error('[AdminApiService] makeAdminRequest error:', error.message);

            // Handle specific error types
            if (error.response) {
                const status = error.response.status;
                const data = error.response.data;

                if (status === 429) {
                    return {
                        success: false,
                        error: 'Rate limit exceeded. Please wait and try again.',
                        rateLimited: true
                    };
                }

                if (status === 401 || status === 403) {
                    return {
                        success: false,
                        error: 'Invalid Admin API key or unauthorized access',
                        unauthorized: true
                    };
                }

                if (status === 404) {
                    const requestedUrl = error.response?.config?.url || config?.url || 'unknown';
                    return {
                        success: false,
                        error: `Admin API endpoint not found (404). URL: ${requestedUrl}. Please check: 1) Panel Type is set correctly (Perfect Panel vs Rental Panel), 2) Admin API Base URL is correct, 3) The panel supports Admin API.`,
                        notFound: true
                    };
                }

                // Check for Rental Panel error format
                if (data?.error || data?.status === 'error') {
                    return {
                        success: false,
                        error: data.error || data.message || `API error: ${status}`,
                        status
                    };
                }

                return {
                    success: false,
                    error: data?.error_message || data?.message || `API error: ${status}`,
                    status
                };
            }

            if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
                return {
                    success: false,
                    error: 'Unable to connect to Admin API. Panel may be offline.',
                    connectionError: true
                };
            }

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Decrypt admin API key from panel
     * @param {Object} panel - Panel object
     * @returns {string|null} Decrypted API key
     */
    decryptAdminApiKey(panel) {
        try {
            if (!panel.adminApiKey) return null;
            return decrypt(panel.adminApiKey);
        } catch (error) {
            console.error('[AdminApiService] Failed to decrypt admin API key:', error.message);
            return null;
        }
    }

    /**
     * Encrypt admin API key for storage
     * @param {string} apiKey - Plain text API key
     * @returns {string} Encrypted API key
     */
    encryptAdminApiKey(apiKey) {
        return encrypt(apiKey);
    }

    /**
     * Get default Admin API URL from panel URL
     * @param {string} panelUrl - Panel base URL
     * @param {string} panelType - Panel type (PERFECT_PANEL, RENTAL, GENERIC)
     * @returns {string} Admin API base URL
     */
    getDefaultAdminApiUrl(panelUrl, panelType = 'GENERIC') {
        // Remove trailing slash
        const baseUrl = panelUrl.replace(/\/$/, '');

        // Rental Panel uses /adminapi/v1
        if (panelType === 'RENTAL' || panelType === 'V1') {
            return `${baseUrl}/adminapi/v1`;
        }

        // Perfect Panel and others use /adminapi/v2
        return `${baseUrl}/adminapi/v2`;
    }

    /**
     * Normalize order status to our internal format
     * @param {string} status - Status from API
     * @returns {string} Normalized status
     */
    normalizeStatus(status) {
        if (!status) return 'PENDING';

        const statusMap = {
            'pending': 'PENDING',
            'in_progress': 'IN_PROGRESS',
            'processing': 'IN_PROGRESS',
            'completed': 'COMPLETED',
            'partial': 'PARTIAL',
            'canceled': 'CANCELLED',
            'cancelled': 'CANCELLED',
            'error': 'CANCELLED',
            'fail': 'CANCELLED',
            'refunded': 'REFUNDED'
        };

        return statusMap[status.toLowerCase()] || status.toUpperCase();
    }

    /**
     * Check rate limit before making request
     * @param {string} panelId - Panel ID
     */
    async checkRateLimit(panelId) {
        const now = Date.now();
        const key = panelId;

        if (!this.requestCounts.has(key)) {
            this.requestCounts.set(key, { count: 0, windowStart: now });
            return;
        }

        const tracker = this.requestCounts.get(key);

        // Reset window if expired
        if (now - tracker.windowStart >= this.RATE_WINDOW) {
            tracker.count = 0;
            tracker.windowStart = now;
            return;
        }

        // Check if at limit
        if (tracker.count >= this.RATE_LIMIT) {
            const waitTime = this.RATE_WINDOW - (now - tracker.windowStart);
            console.log(`[AdminApiService] Rate limit reached for panel ${panelId}, waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            tracker.count = 0;
            tracker.windowStart = Date.now();
        }
    }

    /**
     * Track request for rate limiting
     * @param {string} panelId - Panel ID
     */
    trackRequest(panelId) {
        if (!this.requestCounts.has(panelId)) {
            this.requestCounts.set(panelId, { count: 1, windowStart: Date.now() });
        } else {
            this.requestCounts.get(panelId).count++;
        }
    }

    /**
     * Check if panel has admin API access
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
}

// Export singleton instance
module.exports = new AdminApiService();
