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

            const isRentalPanel = panel.panelType === 'RENTAL';
            let response;

            if (isRentalPanel) {
                // Rental Panel: Use getUser action to test connection
                // Format: ?key=xxx&action=getUser&username=test
                // We use a simple action that should work even without valid data
                response = await this.makeAdminRequest(panel, 'GET', '', {
                    action: 'getUser',
                    username: 'test_connection_check'
                });

                // For Rental Panel, even if user not found, the API responding means connection works
                // Check if we got a valid response structure (not a 500 error)
                if (response.success ||
                    (response.data && (response.data.status === 'success' || response.data.status === 'error'))) {
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
            const isRentalPanel = panel.panelType === 'RENTAL';
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
                console.log(`[AdminAPI] Raw order response for ${orderId}:`, JSON.stringify(order).substring(0, 500));
                console.log(`[AdminAPI] Available fields: ${Object.keys(order).join(', ')}`);
                console.log(`[AdminAPI] User field check: order.user=${order.user}, order.username=${order.username}, order.user_id=${order.user_id}`);

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

            const isRentalPanel = panel.panelType === 'RENTAL';
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
     * Note: This is derived from order data as there's no direct providers endpoint
     * @param {Object} panel - Panel object
     * @returns {Array} List of unique providers
     */
    async getProvidersList(panel) {
        try {
            // Fetch recent orders to extract unique providers
            const response = await this.makeAdminRequest(panel, 'GET', '/orders', {
                limit: 1000,
                sort: 'date-desc'
            });

            if (!response.success) {
                return {
                    success: false,
                    error: response.error || 'Failed to fetch orders'
                };
            }

            const ordersData = response.data.data || response.data || [];
            const orders = Array.isArray(ordersData) ? ordersData : [];

            // Extract unique provider names
            const providersMap = new Map();
            orders.forEach(order => {
                if (order.provider && !providersMap.has(order.provider)) {
                    providersMap.set(order.provider, {
                        name: order.provider,
                        orderCount: 1
                    });
                } else if (order.provider) {
                    const existing = providersMap.get(order.provider);
                    existing.orderCount++;
                }
            });

            const providers = Array.from(providersMap.values())
                .sort((a, b) => b.orderCount - a.orderCount);

            return {
                success: true,
                data: providers
            };
        } catch (error) {
            console.error('[AdminApiService] getProvidersList error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
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

            let response;

            // Use detected endpoint if available
            if (panel.detectedStatusEndpoint) {
                let endpoint = panel.detectedStatusEndpoint.replace('{id}', orderId);

                // Fix: Remove /adminapi/v2 prefix from endpoint if present (baseUrl already has it)
                endpoint = endpoint.replace(/^\/adminapi\/v[12]/, '');

                console.log(`[AdminAPI] Using detected endpoint: ${endpoint}`);
                response = await this.makeAdminRequest(panel, 'GET', endpoint);
            } else {
                // Fallback to default pattern
                response = await this.makeAdminRequest(panel, 'GET', `/orders/${orderId}`);
            }

            if (response.error) {
                throw new Error(response.error);
            }

            // Handle nested response structure: { data: { id, status, ... }, error_message, error_code }
            // The actual order data is inside response.data.data (or response.data if already unwrapped)
            let orderData = response.data || response;
            if (orderData.data && typeof orderData.data === 'object' && orderData.data.id) {
                orderData = orderData.data;  // Unwrap nested data
            }

            console.log(`[AdminAPI] Extracted order data for ${orderId}: status=${orderData.status}, provider=${orderData.provider}`);

            // Handle charge which can be an object with 'value' or a direct number
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
                // Customer info - CRITICAL for User Mapping validation
                customerUsername: orderData.user || orderData.username || null,
                providerName: typeof orderData.provider === 'string' ? orderData.provider : orderData.provider?.name,
                providerOrderId: orderData.external_id || orderData.provider_order_id,
                providerStatus: orderData.status,
                // Check actions object for refill/cancel availability
                canRefill: orderData.actions?.refill === true || orderData.actions?.resend === true,
                canCancel: orderData.actions?.cancel_and_refund === true || orderData.actions?.request_cancel === true
            };
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

            const isRentalPanel = panel.panelType === 'RENTAL';

            // Build URL based on panel type
            const baseUrl = panel.adminApiBaseUrl || this.getDefaultAdminApiUrl(panel.url, panel.panelType);

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
                url = `${baseUrl}${endpoint}`;

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
                // Rental Panel returns { status: "success"|"error", ... }
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
                    return {
                        success: false,
                        error: 'Resource not found',
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
        if (panelType === 'RENTAL') {
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
