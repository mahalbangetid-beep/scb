/**
 * Smart Endpoint Scanner Service
 * 
 * Automatically detects working API endpoints for each service
 * by trying multiple patterns until finding one that works.
 * 
 * Used by "Sync All Services" feature
 */

const axios = require('axios');
const { decrypt } = require('../utils/encryption');

class EndpointScanner {
    constructor() {
        // Define patterns to try for each service type
        // Based on Admin API v2 documentation (document.yaml)
        // Covers: v1, v2, v3, PerfectPanel, SMMPanel, DEVELOPER SMM, RentalPanel, etc.
        this.servicePatterns = {
            // ==================== ORDERS ====================
            // Pull orders (for manual processing)
            ordersPull: [
                { method: 'POST', endpoint: '/adminapi/v2/orders/pull', body: { limit: 1 } },
                { method: 'POST', endpoint: '/adminapi/v1/orders/pull', body: { limit: 1 } },
                { method: 'POST', endpoint: '/api/admin/v2/orders/pull', body: { limit: 1 } },
                { method: 'POST', endpoint: '/api/admin/orders/pull', body: { limit: 1 } },
                { method: 'POST', endpoint: '/orders/pull', body: { limit: 1 } },
            ],
            // Get order list
            orders: [
                // ========== RENTAL PANEL V1 (ACTION-BASED, KEY IN QUERY) ==========
                // PRIORITY: Try these first for Rental Panel (bam1.net, etc.)
                { method: 'GET', endpoint: '/adminapi/v1', params: { action: 'getOrders', limit: 1 }, isV1: true, keyParam: 'key' },
                { method: 'GET', endpoint: '/adminapi/v1', params: { action: 'getOrders' }, isV1: true, keyParam: 'key' },
                { method: 'GET', endpoint: '/adminapi/v1', params: { action: 'getorder', limit: 1 }, isV1: true, keyParam: 'key' },
                { method: 'GET', endpoint: '/adminapi/v1', params: { action: 'getOrders-by-id', orders: '1' }, isV1: true, keyParam: 'key' },

                // ========== PERFECT PANEL V2 (RESTFUL, KEY IN HEADER) ==========
                { method: 'GET', endpoint: '/adminapi/v2/orders', params: { limit: 1 } },
                { method: 'GET', endpoint: '/adminapi/v1/orders', params: { limit: 1 } },
                { method: 'GET', endpoint: '/adminapi/orders', params: { limit: 1 } },
                { method: 'GET', endpoint: '/api/admin/v2/orders', params: { limit: 1 } },
                { method: 'GET', endpoint: '/api/admin/v1/orders', params: { limit: 1 } },
                { method: 'GET', endpoint: '/api/admin/orders', params: { limit: 1 } },
                { method: 'GET', endpoint: '/api/v2/orders', params: { limit: 1 } },
                { method: 'GET', endpoint: '/api/v1/orders', params: { limit: 1 } },
                { method: 'GET', endpoint: '/api/orders', params: { limit: 1 } },
                { method: 'GET', endpoint: '/admin/orders', params: { limit: 1 } },
                { method: 'GET', endpoint: '/orders', params: { limit: 1 } },
                { method: 'POST', endpoint: '/adminapi/v2/orders', body: { limit: 1 } },
                { method: 'POST', endpoint: '/api/admin/orders', body: { limit: 1 } },
                { method: 'POST', endpoint: '/api/v3', body: { action: 'orders', limit: 1 } },
                { method: 'POST', endpoint: '/api/v2', body: { action: 'orders', limit: 1 } },
            ],
            // Get single order - /orders/{id}
            status: [
                // ========== RENTAL PANEL V1 (ACTION-BASED) ==========
                { method: 'GET', endpoint: '/adminapi/v1', params: { action: 'getOrders-by-id', orders: '{id}', provider: 1 }, isV1: true, keyParam: 'key' },
                { method: 'GET', endpoint: '/adminapi/v1', params: { action: 'getorder', type: '{id}' }, isV1: true, keyParam: 'key' },

                // ========== PERFECT PANEL V2 (RESTFUL) ==========
                { method: 'GET', endpoint: '/adminapi/v2/orders/{id}' },
                { method: 'GET', endpoint: '/adminapi/v1/orders/{id}' },
                { method: 'GET', endpoint: '/adminapi/orders/{id}' },
                { method: 'GET', endpoint: '/api/admin/v2/orders/{id}' },
                { method: 'GET', endpoint: '/api/admin/v1/orders/{id}' },
                { method: 'GET', endpoint: '/api/admin/orders/{id}' },
                { method: 'GET', endpoint: '/api/v2/orders/{id}' },
                { method: 'GET', endpoint: '/api/v1/orders/{id}' },
                { method: 'GET', endpoint: '/api/orders/{id}' },
                { method: 'GET', endpoint: '/admin/orders/{id}' },
                { method: 'GET', endpoint: '/orders/{id}' },
                { method: 'POST', endpoint: '/adminapi/v2/orders/status', body: { order: '{id}' } },
                { method: 'POST', endpoint: '/api/admin/orders/status', body: { order: '{id}' } },
                { method: 'POST', endpoint: '/api/v3', body: { action: 'status', order: '{id}' } },
                { method: 'POST', endpoint: '/api/v2', body: { action: 'status', order: '{id}' } },
            ],
            // Update orders - /orders/update
            ordersUpdate: [
                { method: 'POST', endpoint: '/adminapi/v2/orders/update', testMode: true },
                { method: 'POST', endpoint: '/adminapi/v1/orders/update', testMode: true },
                { method: 'POST', endpoint: '/api/admin/v2/orders/update', testMode: true },
                { method: 'POST', endpoint: '/api/admin/orders/update', testMode: true },
                { method: 'POST', endpoint: '/orders/update', testMode: true },
            ],
            // Edit order link - /orders/{id}/edit-link
            ordersEditLink: [
                { method: 'POST', endpoint: '/adminapi/v2/orders/{id}/edit-link', testMode: true },
                { method: 'POST', endpoint: '/adminapi/v1/orders/{id}/edit-link', testMode: true },
                { method: 'POST', endpoint: '/api/admin/orders/{id}/edit-link', testMode: true },
                { method: 'POST', endpoint: '/orders/{id}/edit-link', testMode: true },
            ],
            // Resend order (refill) - /orders/resend
            refill: [
                { method: 'POST', endpoint: '/adminapi/v2/orders/resend', testMode: true },
                { method: 'POST', endpoint: '/adminapi/v1/orders/resend', testMode: true },
                { method: 'POST', endpoint: '/api/admin/v2/orders/resend', testMode: true },
                { method: 'POST', endpoint: '/api/admin/v1/orders/resend', testMode: true },
                { method: 'POST', endpoint: '/api/admin/orders/resend', testMode: true },
                { method: 'POST', endpoint: '/orders/resend', testMode: true },
                { method: 'GET', endpoint: '/adminapi/v2/refills', params: { limit: 1 } },
                { method: 'GET', endpoint: '/adminapi/v1/refills', params: { limit: 1 } },
                { method: 'GET', endpoint: '/api/admin/refills', params: { limit: 1 } },
                { method: 'POST', endpoint: '/adminapi/v2/refill', testMode: true },
                { method: 'POST', endpoint: '/api/admin/refill', testMode: true },
                { method: 'POST', endpoint: '/api/v2/refill', testMode: true },
                { method: 'POST', endpoint: '/api/v1/refill', testMode: true },
                { method: 'POST', endpoint: '/api/refill', testMode: true },
                { method: 'POST', endpoint: '/admin/refill', testMode: true },
                { method: 'POST', endpoint: '/refill', testMode: true },
                { method: 'POST', endpoint: '/api/v3', body: { action: 'refill' }, testMode: true },
                { method: 'POST', endpoint: '/api/v2', body: { action: 'refill' }, testMode: true },
            ],
            // Change order status - /orders/change-status
            ordersChangeStatus: [
                { method: 'POST', endpoint: '/adminapi/v2/orders/change-status', testMode: true },
                { method: 'POST', endpoint: '/adminapi/v1/orders/change-status', testMode: true },
                { method: 'POST', endpoint: '/api/admin/orders/change-status', testMode: true },
                { method: 'POST', endpoint: '/orders/change-status', testMode: true },
            ],
            // Set partial - /orders/{id}/set-partial
            ordersSetPartial: [
                { method: 'POST', endpoint: '/adminapi/v2/orders/{id}/set-partial', testMode: true },
                { method: 'POST', endpoint: '/adminapi/v1/orders/{id}/set-partial', testMode: true },
                { method: 'POST', endpoint: '/api/admin/orders/{id}/set-partial', testMode: true },
                { method: 'POST', endpoint: '/orders/{id}/set-partial', testMode: true },
            ],
            // Request cancel - /orders/request-cancel
            ordersRequestCancel: [
                { method: 'POST', endpoint: '/adminapi/v2/orders/request-cancel', testMode: true },
                { method: 'POST', endpoint: '/adminapi/v1/orders/request-cancel', testMode: true },
                { method: 'POST', endpoint: '/api/admin/orders/request-cancel', testMode: true },
                { method: 'POST', endpoint: '/orders/request-cancel', testMode: true },
            ],
            // Cancel and refund - /orders/cancel
            cancel: [
                { method: 'POST', endpoint: '/adminapi/v2/orders/cancel', testMode: true },
                { method: 'POST', endpoint: '/adminapi/v1/orders/cancel', testMode: true },
                { method: 'POST', endpoint: '/api/admin/v2/orders/cancel', testMode: true },
                { method: 'POST', endpoint: '/api/admin/v1/orders/cancel', testMode: true },
                { method: 'POST', endpoint: '/api/admin/orders/cancel', testMode: true },
                { method: 'POST', endpoint: '/orders/cancel', testMode: true },
                { method: 'GET', endpoint: '/adminapi/v2/cancels', params: { limit: 1 } },
                { method: 'GET', endpoint: '/adminapi/v1/cancels', params: { limit: 1 } },
                { method: 'GET', endpoint: '/api/admin/cancels', params: { limit: 1 } },
                { method: 'POST', endpoint: '/api/v2/cancel', testMode: true },
                { method: 'POST', endpoint: '/api/v1/cancel', testMode: true },
                { method: 'POST', endpoint: '/api/cancel', testMode: true },
                { method: 'POST', endpoint: '/admin/cancel', testMode: true },
                { method: 'POST', endpoint: '/cancel', testMode: true },
                { method: 'POST', endpoint: '/api/v3', body: { action: 'cancel' }, testMode: true },
                { method: 'POST', endpoint: '/api/v2', body: { action: 'cancel' }, testMode: true },
            ],

            // ==================== CANCEL TASKS ====================
            // Pull cancel tasks - /cancel/pull
            cancelPull: [
                { method: 'POST', endpoint: '/adminapi/v2/cancel/pull', body: { limit: 1 } },
                { method: 'POST', endpoint: '/adminapi/v1/cancel/pull', body: { limit: 1 } },
                { method: 'POST', endpoint: '/api/admin/cancel/pull', body: { limit: 1 } },
                { method: 'POST', endpoint: '/cancel/pull', body: { limit: 1 } },
            ],
            // Reject cancel - /cancel/reject
            cancelReject: [
                { method: 'POST', endpoint: '/adminapi/v2/cancel/reject', testMode: true },
                { method: 'POST', endpoint: '/adminapi/v1/cancel/reject', testMode: true },
                { method: 'POST', endpoint: '/api/admin/cancel/reject', testMode: true },
                { method: 'POST', endpoint: '/cancel/reject', testMode: true },
            ],

            // ==================== REFILL TASKS ====================
            // Pull refill tasks - /refill/pull
            refillPull: [
                { method: 'POST', endpoint: '/adminapi/v2/refill/pull', body: { limit: 1 } },
                { method: 'POST', endpoint: '/adminapi/v1/refill/pull', body: { limit: 1 } },
                { method: 'POST', endpoint: '/api/admin/refill/pull', body: { limit: 1 } },
                { method: 'POST', endpoint: '/refill/pull', body: { limit: 1 } },
            ],
            // Change refill status - /refill/change-status
            refillChangeStatus: [
                { method: 'POST', endpoint: '/adminapi/v2/refill/change-status', testMode: true },
                { method: 'POST', endpoint: '/adminapi/v1/refill/change-status', testMode: true },
                { method: 'POST', endpoint: '/api/admin/refill/change-status', testMode: true },
                { method: 'POST', endpoint: '/refill/change-status', testMode: true },
            ],

            // ==================== PAYMENTS ====================
            // Get payment list - /payments
            payments: [
                // ========== RENTAL PANEL V1 (ACTION-BASED) ==========
                // Note: Rental Panel v1 doesn't have getPayments, use addPayment test instead

                // ========== PERFECT PANEL V2 (RESTFUL) ==========
                { method: 'GET', endpoint: '/adminapi/v2/payments', params: { limit: 1 } },
                { method: 'GET', endpoint: '/adminapi/v1/payments', params: { limit: 1 } },
                { method: 'GET', endpoint: '/api/admin/v2/payments', params: { limit: 1 } },
                { method: 'GET', endpoint: '/api/admin/payments', params: { limit: 1 } },
                { method: 'GET', endpoint: '/admin/payments', params: { limit: 1 } },
                { method: 'GET', endpoint: '/payments', params: { limit: 1 } },
            ],
            // Add payment - /payments/add
            paymentsAdd: [
                // ========== RENTAL PANEL V1 (ACTION-BASED) ==========
                { method: 'POST', endpoint: '/adminapi/v1', body: { action: 'addPayment' }, isV1: true, keyParam: 'key', testMode: true },

                // ========== PERFECT PANEL V2 (RESTFUL) ==========
                { method: 'POST', endpoint: '/adminapi/v2/payments/add', testMode: true },
                { method: 'POST', endpoint: '/adminapi/v1/payments/add', testMode: true },
                { method: 'POST', endpoint: '/api/admin/payments/add', testMode: true },
                { method: 'POST', endpoint: '/payments/add', testMode: true },
            ],

            // ==================== USERS ====================
            // Add user - /users/add
            usersAdd: [
                { method: 'POST', endpoint: '/adminapi/v2/users/add', testMode: true },
                { method: 'POST', endpoint: '/adminapi/v1/users/add', testMode: true },
                { method: 'POST', endpoint: '/api/admin/users/add', testMode: true },
                { method: 'POST', endpoint: '/users/add', testMode: true },
            ],
            // Get user list - /users
            users: [
                // ========== RENTAL PANEL V1 (ACTION-BASED) ==========
                { method: 'GET', endpoint: '/adminapi/v1', params: { action: 'getUser', username: 'test' }, isV1: true, keyParam: 'key' },

                // ========== PERFECT PANEL V2 (RESTFUL) ==========
                { method: 'GET', endpoint: '/adminapi/v2/users', params: { limit: 1 } },
                { method: 'GET', endpoint: '/adminapi/v1/users', params: { limit: 1 } },
                { method: 'GET', endpoint: '/api/admin/v2/users', params: { limit: 1 } },
                { method: 'GET', endpoint: '/api/admin/users', params: { limit: 1 } },
                { method: 'GET', endpoint: '/admin/users', params: { limit: 1 } },
                { method: 'GET', endpoint: '/users', params: { limit: 1 } },
            ],

            // ==================== TICKETS ====================
            // Get ticket list - /tickets
            tickets: [
                { method: 'GET', endpoint: '/adminapi/v2/tickets', params: { limit: 1 } },
                { method: 'GET', endpoint: '/adminapi/v1/tickets', params: { limit: 1 } },
                { method: 'GET', endpoint: '/api/admin/v2/tickets', params: { limit: 1 } },
                { method: 'GET', endpoint: '/api/admin/tickets', params: { limit: 1 } },
                { method: 'GET', endpoint: '/admin/tickets', params: { limit: 1 } },
                { method: 'GET', endpoint: '/tickets', params: { limit: 1 } },
            ],
            // Get ticket - /tickets/{id}
            ticketsGet: [
                { method: 'GET', endpoint: '/adminapi/v2/tickets/{id}' },
                { method: 'GET', endpoint: '/adminapi/v1/tickets/{id}' },
                { method: 'GET', endpoint: '/api/admin/tickets/{id}' },
                { method: 'GET', endpoint: '/tickets/{id}' },
            ],
            // Reply to ticket - /tickets/{id}/reply
            ticketsReply: [
                { method: 'POST', endpoint: '/adminapi/v2/tickets/{id}/reply', testMode: true },
                { method: 'POST', endpoint: '/adminapi/v1/tickets/{id}/reply', testMode: true },
                { method: 'POST', endpoint: '/api/admin/tickets/{id}/reply', testMode: true },
                { method: 'POST', endpoint: '/tickets/{id}/reply', testMode: true },
            ],
            // Add ticket - /tickets/add
            ticketsAdd: [
                { method: 'POST', endpoint: '/adminapi/v2/tickets/add', testMode: true },
                { method: 'POST', endpoint: '/adminapi/v1/tickets/add', testMode: true },
                { method: 'POST', endpoint: '/api/admin/tickets/add', testMode: true },
                { method: 'POST', endpoint: '/tickets/add', testMode: true },
            ],

            // ==================== PROVIDER INFO ====================
            // Get order with provider info
            providerInfo: [
                { method: 'GET', endpoint: '/adminapi/v2/orders/{id}', params: { include: 'provider' } },
                { method: 'GET', endpoint: '/adminapi/v2/orders/{id}', params: { with_provider: 1 } },
                { method: 'GET', endpoint: '/adminapi/v2/orders/{id}', params: { expand: 'provider' } },
                { method: 'GET', endpoint: '/adminapi/v1/orders/{id}', params: { include: 'provider' } },
                { method: 'GET', endpoint: '/adminapi/orders/{id}', params: { include: 'provider' } },
                { method: 'GET', endpoint: '/api/admin/v2/orders/{id}', params: { include: 'provider' } },
                { method: 'GET', endpoint: '/api/admin/v1/orders/{id}', params: { include: 'provider' } },
                { method: 'GET', endpoint: '/api/admin/orders/{id}', params: { include: 'provider' } },
                { method: 'GET', endpoint: '/adminapi/v2/orders/{id}/provider' },
                { method: 'GET', endpoint: '/api/admin/orders/{id}/provider' },
                { method: 'GET', endpoint: '/admin/orders/{id}/provider' },
                { method: 'GET', endpoint: '/orders/{id}/provider' },
            ],
        };
    }

    /**
     * Scan all endpoints for a panel
     * @param {Object} panel - Panel object with adminApiKey
     * @param {string} testOrderId - Optional order ID for testing status endpoint
     * @param {string} testTicketId - Optional ticket ID for testing ticket endpoint
     * @returns {Object} Detected endpoints and results
     */
    async scanAll(panel, testOrderId = null, testTicketId = null) {
        console.log(`[EndpointScanner] Starting full scan for panel: ${panel.alias || panel.name}`);

        const results = {
            // Core Order endpoints
            orders: await this.scanService(panel, 'orders'),
            ordersPull: await this.scanService(panel, 'ordersPull'),
            status: testOrderId ? await this.scanService(panel, 'status', testOrderId) : { detected: null, testedPatterns: [], skipped: true },
            ordersUpdate: await this.scanService(panel, 'ordersUpdate'),
            ordersEditLink: testOrderId ? await this.scanService(panel, 'ordersEditLink', testOrderId) : { detected: null, testedPatterns: [], skipped: true },
            ordersChangeStatus: await this.scanService(panel, 'ordersChangeStatus'),
            ordersSetPartial: testOrderId ? await this.scanService(panel, 'ordersSetPartial', testOrderId) : { detected: null, testedPatterns: [], skipped: true },
            ordersRequestCancel: await this.scanService(panel, 'ordersRequestCancel'),

            // Refill endpoints
            refill: await this.scanService(panel, 'refill'),
            refillPull: await this.scanService(panel, 'refillPull'),
            refillChangeStatus: await this.scanService(panel, 'refillChangeStatus'),

            // Cancel endpoints
            cancel: await this.scanService(panel, 'cancel'),
            cancelPull: await this.scanService(panel, 'cancelPull'),
            cancelReject: await this.scanService(panel, 'cancelReject'),

            // Provider info
            providerInfo: testOrderId ? await this.scanService(panel, 'providerInfo', testOrderId) : { detected: null, testedPatterns: [], skipped: true },

            // Payments
            payments: await this.scanService(panel, 'payments'),
            paymentsAdd: await this.scanService(panel, 'paymentsAdd'),

            // Users
            users: await this.scanService(panel, 'users'),
            usersAdd: await this.scanService(panel, 'usersAdd'),

            // Tickets
            tickets: await this.scanService(panel, 'tickets'),
            ticketsGet: testTicketId ? await this.scanService(panel, 'ticketsGet', testTicketId) : { detected: null, testedPatterns: [], skipped: true },
            ticketsReply: testTicketId ? await this.scanService(panel, 'ticketsReply', testTicketId) : { detected: null, testedPatterns: [], skipped: true },
            ticketsAdd: await this.scanService(panel, 'ticketsAdd'),
        };

        // Log summary
        const detected = Object.entries(results)
            .filter(([_, v]) => v.detected)
            .map(([k, v]) => `${k}: ${v.detected}`);

        console.log(`[EndpointScanner] Scan complete. Detected ${detected.length} endpoints:`, detected);

        return results;
    }

    /**
     * Scan for a specific service's endpoint
     * @param {Object} panel - Panel object
     * @param {string} serviceType - orders|refill|cancel|status|provider
     * @param {string} orderId - Order ID (for status/provider testing)
     */
    async scanService(panel, serviceType, orderId = null) {
        const patterns = this.servicePatterns[serviceType];
        if (!patterns) {
            return { detected: null, error: 'Unknown service type', testedPatterns: [] };
        }

        const testedPatterns = [];
        let detectedEndpoint = null;
        let detectedMethod = null;

        console.log(`[EndpointScanner] Scanning ${serviceType} with ${patterns.length} patterns...`);

        for (const pattern of patterns) {
            const patternResult = {
                endpoint: pattern.endpoint,
                method: pattern.method,
                status: 'testing'
            };

            try {
                // Build endpoint URL
                let endpoint = pattern.endpoint;
                if (orderId && endpoint.includes('{id}')) {
                    endpoint = endpoint.replace('{id}', orderId);
                }

                // Skip if requires order ID but none provided
                if (endpoint.includes('{id}') && !orderId) {
                    patternResult.status = 'skipped';
                    patternResult.message = 'Requires order ID';
                    testedPatterns.push(patternResult);
                    continue;
                }

                // Skip test mode patterns (we don't want to actually create refill/cancel)
                if (pattern.testMode) {
                    // For test mode, we just check if endpoint returns 400/422 (bad request but endpoint exists)
                    // rather than 404 (not found)
                    const response = await this.makeRequest(panel, pattern.method, endpoint, {}, true, pattern);

                    if (response.exists) {
                        // For V1 patterns, include the action in the endpoint display
                        if (pattern.isV1 && pattern.params?.action) {
                            detectedEndpoint = `${pattern.endpoint}?action=${pattern.params.action}`;
                        } else {
                            detectedEndpoint = pattern.endpoint;
                        }
                        detectedMethod = pattern.method;
                        patternResult.status = 'success';
                        patternResult.message = 'Endpoint exists (test mode)';
                        testedPatterns.push(patternResult);
                        break;
                    } else {
                        patternResult.status = 'failed';
                        patternResult.message = response.error || 'Not found';
                    }
                } else {
                    // Normal test - actually make the request
                    const response = await this.makeRequest(
                        panel,
                        pattern.method,
                        endpoint,
                        pattern.params || pattern.body || {},
                        false,
                        pattern
                    );

                    if (response.success) {
                        // For V1 patterns, include the action in the endpoint display
                        if (pattern.isV1 && pattern.params?.action) {
                            detectedEndpoint = `${pattern.endpoint}?action=${pattern.params.action}`;
                        } else {
                            detectedEndpoint = pattern.endpoint;
                        }
                        detectedMethod = pattern.method;
                        patternResult.status = 'success';
                        patternResult.message = 'Working endpoint found';
                        testedPatterns.push(patternResult);
                        break;
                    } else {
                        patternResult.status = 'failed';
                        patternResult.message = response.error || 'Failed';
                    }
                }
            } catch (error) {
                patternResult.status = 'error';
                patternResult.message = error.message;
            }

            testedPatterns.push(patternResult);
        }

        return {
            detected: detectedEndpoint,
            method: detectedMethod,
            testedPatterns,
            patternsTotal: patterns.length,
            patternsTried: testedPatterns.length
        };
    }

    /**
     * Make request to test an endpoint
     * Supports both header auth (Perfect Panel) and query param auth (Rental Panel v1)
     */
    async makeRequest(panel, method, endpoint, params = {}, testMode = false, pattern = {}) {
        try {
            const baseUrl = panel.adminApiBaseUrl || panel.url;
            const url = `${baseUrl.replace(/\/$/, '')}${endpoint}`;

            // Decrypt API key
            let apiKey;
            try {
                apiKey = panel.adminApiKey ? decrypt(panel.adminApiKey) : null;
            } catch (e) {
                apiKey = panel.adminApiKey; // Already decrypted or plain text
            }

            if (!apiKey) {
                return { success: false, error: 'No API key' };
            }

            const config = {
                method,
                url,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 10000,
                validateStatus: (status) => true // Don't throw on any status
            };

            // Check if this is a V1 pattern (key in query param instead of header)
            const isV1Pattern = pattern.isV1 && pattern.keyParam;

            if (isV1Pattern) {
                // V1 style - key in query/body parameter
                if (method === 'GET') {
                    config.params = {
                        [pattern.keyParam]: apiKey,
                        ...params
                    };
                } else {
                    config.data = {
                        [pattern.keyParam]: apiKey,
                        ...params
                    };
                }
            } else {
                // V2 style - key in header
                config.headers['X-Api-Key'] = apiKey;

                if (method === 'GET') {
                    config.params = params;
                } else {
                    config.data = params;
                }
            }

            const response = await axios(config);

            // Check response
            if (response.status === 404) {
                return { success: false, exists: false, error: 'Not found' };
            }

            if (response.status === 401 || response.status === 403) {
                return { success: false, exists: true, error: 'Unauthorized' };
            }

            // For test mode, 400/422 means endpoint exists but needs proper params
            if (testMode && (response.status === 400 || response.status === 422)) {
                return { success: false, exists: true, error: 'Requires params' };
            }

            if (response.status >= 200 && response.status < 300) {
                return { success: true, data: response.data };
            }

            // 500 errors might mean endpoint exists but has issues
            if (response.status >= 500) {
                return { success: false, exists: true, error: 'Server error' };
            }

            return { success: false, error: `HTTP ${response.status}` };
        } catch (error) {
            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                return { success: false, error: 'Connection failed' };
            }
            if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
                return { success: false, error: 'Timeout' };
            }
            return { success: false, error: error.message };
        }
    }
}

module.exports = new EndpointScanner();
