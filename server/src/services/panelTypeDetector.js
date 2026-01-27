/**
 * Panel Type Detector & Auto-Endpoint Applier
 * 
 * Detects whether a panel uses V1 (action-based) or V2 (RESTful) API
 * and automatically applies predefined endpoints.
 */

const axios = require('axios');
const { decrypt } = require('../utils/encryption');

class PanelTypeDetector {
    // Predefined endpoints for V1 (Rental Panel style)
    // Based on Admin API v1 Documentation.html
    static V1_ENDPOINTS = {
        // ========== ORDER MANAGEMENT ==========
        orders: '/adminapi/v1?action=getOrders',
        ordersPull: null, // Not supported in V1 - use getOrders instead
        status: '/adminapi/v1?action=getOrders-by-id', // Gets single order with provider info
        ordersUpdate: '/adminapi/v1?action=updateOrders',
        ordersEditLink: null, // Not supported in V1
        ordersChangeStatus: '/adminapi/v1?action=setCompleted', // Also: setInprogress, setCanceled, setPartial
        ordersSetPartial: '/adminapi/v1?action=setPartial',
        ordersRequestCancel: null, // Not supported in V1 - use setCanceled directly

        // ========== REFILL ==========
        refill: null, // Not supported in V1
        refillPull: null, // Not supported in V1
        refillChangeStatus: null, // Not supported in V1

        // ========== CANCEL ==========
        cancel: '/adminapi/v1?action=setCanceled', // Direct cancel via status change
        cancelPull: null, // Not supported in V1
        cancelReject: null, // Not supported in V1

        // ========== PROVIDER INFO ==========
        providerInfo: '/adminapi/v1?action=getMassProviderData', // Get provider data for orders

        // ========== PAYMENTS ==========
        payments: null, // Not supported in V1 - no getPayments
        paymentsAdd: '/adminapi/v1?action=addPayment', // Also: deductPayment

        // ========== USERS ==========
        users: '/adminapi/v1?action=getUser',
        usersAdd: null, // Not supported in V1 - no addUser

        // ========== TICKETS ==========
        tickets: null, // Not supported in V1 - no getTickets
        ticketsGet: null, // Not supported in V1 - no getTicket
        ticketsReply: null, // Not supported in V1 - no replyTicket
        ticketsAdd: '/adminapi/v1?action=addTicket',
    };

    // Predefined endpoints for V2 (Perfect Panel style)
    static V2_ENDPOINTS = {
        // ========== ORDER MANAGEMENT ==========
        orders: '/adminapi/v2/orders',
        ordersPull: '/adminapi/v2/orders/pull',
        status: '/adminapi/v2/orders/{id}',
        ordersUpdate: '/adminapi/v2/orders/update',
        ordersEditLink: '/adminapi/v2/orders/{id}/edit-link',
        ordersChangeStatus: '/adminapi/v2/orders/{id}/change-status',
        ordersSetPartial: '/adminapi/v2/orders/{id}/set-partial',
        ordersRequestCancel: '/adminapi/v2/orders/request-cancel',

        // ========== REFILL ==========
        refill: '/adminapi/v2/orders/resend',
        refillPull: '/adminapi/v2/refill/pull',
        refillChangeStatus: '/adminapi/v2/refill/change-status',

        // ========== CANCEL ==========
        cancel: '/adminapi/v2/orders/cancel',
        cancelPull: '/adminapi/v2/cancel/pull',
        cancelReject: '/adminapi/v2/cancel/reject',

        // ========== PROVIDER INFO ==========
        providerInfo: '/adminapi/v2/orders/{id}?include=provider',

        // ========== PAYMENTS ==========
        payments: '/adminapi/v2/payments',
        paymentsAdd: '/adminapi/v2/payments/add',

        // ========== USERS ==========
        users: '/adminapi/v2/users',
        usersAdd: '/adminapi/v2/users/add',

        // ========== TICKETS ==========
        tickets: '/adminapi/v2/tickets',
        ticketsGet: '/adminapi/v2/tickets/{id}',
        ticketsReply: '/adminapi/v2/tickets/{id}/reply',
        ticketsAdd: '/adminapi/v2/tickets/add',
    };

    /**
     * Detect the API type of a panel
     * @param {Object} panel - Panel object with url and adminApiKey
     * @returns {string} 'v1', 'v2', or 'unknown'
     */
    static async detectPanelType(panel) {
        const apiKey = panel.adminApiKey ? decrypt(panel.adminApiKey) : null;
        if (!apiKey) {
            console.log('[PanelTypeDetector] No admin API key, cannot detect type');
            return 'unknown';
        }

        const baseUrl = panel.url.replace(/\/$/, '');

        // Test V1 first (action-based)
        try {
            const v1Response = await axios.get(`${baseUrl}/adminapi/v1`, {
                params: {
                    key: apiKey,
                    action: 'getOrders',
                    limit: 1
                },
                timeout: 10000,
                validateStatus: () => true
            });

            console.log('[PanelTypeDetector] V1 Test Response:', {
                status: v1Response.status,
                data: JSON.stringify(v1Response.data).substring(0, 100)
            });

            // V1 panels return { status: 'success', orders: [...] } or { status: 'fail', error: '...' }
            if (v1Response.status === 200 && v1Response.data) {
                const data = v1Response.data;
                const statusValue = (data?.status || '').toString().toLowerCase();

                // Success or known V1 error patterns mean it's V1
                if (statusValue === 'success' || statusValue === 'sucess' ||
                    statusValue === 'fail' || data?.error) {
                    console.log('[PanelTypeDetector] Detected as V1 (action-based)');
                    return 'v1';
                }
            }
        } catch (err) {
            console.log('[PanelTypeDetector] V1 test failed:', err.message);
        }

        // Test V2 (RESTful)
        try {
            const v2Response = await axios.get(`${baseUrl}/adminapi/v2/orders`, {
                params: { limit: 1 },
                headers: {
                    'X-Api-Key': apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 10000,
                validateStatus: () => true
            });

            console.log('[PanelTypeDetector] V2 Test Response:', {
                status: v2Response.status,
                data: JSON.stringify(v2Response.data).substring(0, 100)
            });

            // V2 panels return JSON array or object with orders
            if (v2Response.status === 200 && v2Response.data) {
                // If it's not a HTML page (Cloudflare challenge)
                if (typeof v2Response.data !== 'string' || !v2Response.data.includes('<!DOCTYPE')) {
                    console.log('[PanelTypeDetector] Detected as V2 (RESTful)');
                    return 'v2';
                }
            }
        } catch (err) {
            console.log('[PanelTypeDetector] V2 test failed:', err.message);
        }

        console.log('[PanelTypeDetector] Could not detect panel type');
        return 'unknown';
    }

    /**
     * Get predefined endpoints for a panel type
     * @param {string} panelType - 'v1' or 'v2'
     * @returns {Object} Endpoint mappings
     */
    static getEndpointsForType(panelType) {
        if (panelType === 'v1') {
            return this.V1_ENDPOINTS;
        } else if (panelType === 'v2') {
            return this.V2_ENDPOINTS;
        }
        return {};
    }

    /**
     * Apply predefined endpoints to a panel's scan results
     * @param {string} panelType - 'v1' or 'v2'
     * @returns {Object} Scan results format for storage
     */
    static generateScanResults(panelType) {
        const endpoints = this.getEndpointsForType(panelType);
        const results = {};

        for (const [serviceName, endpoint] of Object.entries(endpoints)) {
            if (endpoint) {
                results[serviceName] = {
                    detected: endpoint,
                    method: endpoint.includes('?action=') ? 'GET' : 'GET',
                    testedPatterns: [],
                    autoDetected: true,
                    panelType
                };
            } else {
                // Mark as not supported (not just skipped)
                results[serviceName] = {
                    detected: null,
                    skipped: true,
                    notSupported: true,
                    reason: `Not available in ${panelType.toUpperCase()} API`,
                    autoDetected: true,
                    panelType
                };
            }
        }

        return results;
    }

    /**
     * Detect panel type and generate scan results
     * @param {Object} panel - Panel object
     * @returns {Object} { panelType, scanResults }
     */
    static async detectAndGenerateEndpoints(panel) {
        console.log(`[PanelTypeDetector] Detecting panel type for: ${panel.alias || panel.name}`);

        const panelType = await this.detectPanelType(panel);

        if (panelType === 'unknown') {
            return {
                panelType: null,
                scanResults: {},
                message: 'Could not auto-detect panel type. Please scan endpoints manually.'
            };
        }

        const scanResults = this.generateScanResults(panelType);
        const supportedCount = Object.values(scanResults).filter(r => r.detected).length;
        const notSupportedCount = Object.values(scanResults).filter(r => r.notSupported).length;

        return {
            panelType,
            scanResults,
            message: `Detected as ${panelType.toUpperCase()} panel. ${supportedCount} endpoints available, ${notSupportedCount} not supported by this API version.`
        };
    }
}

module.exports = PanelTypeDetector;
