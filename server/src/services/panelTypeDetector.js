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
    static V1_ENDPOINTS = {
        orders: '/adminapi/v1?action=getOrders',
        status: '/adminapi/v1?action=getOrders-by-id',
        ordersUpdate: '/adminapi/v1?action=updateOrders',
        ordersChangeStatus: '/adminapi/v1?action=setCompleted',
        ordersSetPartial: '/adminapi/v1?action=setPartial',
        refill: '/refill',
        cancel: null, // Not supported typically
        paymentsAdd: '/adminapi/v1?action=addPayment',
        users: '/adminapi/v1?action=getUser',
        ticketsAdd: '/adminapi/v1?action=addTicket',
    };

    // Predefined endpoints for V2 (Perfect Panel style)
    static V2_ENDPOINTS = {
        orders: '/adminapi/v2/orders',
        ordersPull: '/adminapi/v2/orders/pull',
        status: '/adminapi/v2/orders/{id}',
        ordersUpdate: '/adminapi/v2/orders/update',
        ordersChangeStatus: '/adminapi/v2/orders/{id}/change-status',
        ordersSetPartial: '/adminapi/v2/orders/{id}/set-partial',
        ordersEditLink: '/adminapi/v2/orders/{id}/edit-link',
        ordersRequestCancel: '/adminapi/v2/orders/request-cancel',
        refill: '/adminapi/v2/orders/resend',
        refillPull: '/adminapi/v2/refill/pull',
        refillChangeStatus: '/adminapi/v2/refill/change-status',
        cancel: '/adminapi/v2/orders/cancel',
        cancelPull: '/adminapi/v2/cancel/pull',
        cancelReject: '/adminapi/v2/cancel/reject',
        providerInfo: '/adminapi/v2/orders/{id}?include=provider',
        payments: '/adminapi/v2/payments',
        paymentsAdd: '/adminapi/v2/payments/add',
        users: '/adminapi/v2/users',
        usersAdd: '/adminapi/v2/users/add',
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
                    method: endpoint.includes('?action=') ? 'GET' : 'GET', // Most are GET
                    testedPatterns: [],
                    autoDetected: true,
                    panelType
                };
            } else {
                results[serviceName] = {
                    detected: null,
                    skipped: true,
                    reason: 'Not supported by this panel type'
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

        return {
            panelType,
            scanResults,
            message: `Detected as ${panelType.toUpperCase()} panel. ${Object.keys(scanResults).filter(k => scanResults[k].detected).length} endpoints auto-configured.`
        };
    }
}

module.exports = PanelTypeDetector;
