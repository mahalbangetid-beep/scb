/**
 * Smart Panel Scanner Service
 * 
 * Auto-detects SMM Panel Admin API configuration by testing endpoint patterns.
 * Only supports Admin API with X-Api-Key header authentication.
 * 
 * @author DICREWA Team
 * @version 2.0.0
 */

const axios = require('axios');

class SmartPanelScanner {
    constructor() {
        // Timeout per request (10 seconds)
        this.requestTimeout = 10000;

        // Maximum total scanning time (60 seconds)
        this.maxScanTime = 60000;

        // Delay between requests (500ms to avoid rate limiting)
        this.requestDelay = 500;

        // Admin API patterns - comprehensive list from Admin API v1 & v2 documentation
        // Supports both X-Api-Key header auth (v2) and key param auth (v1)
        this.scanPatterns = [
            // ==================== ADMIN API V2 (HEADER AUTH) ====================
            // Based on OpenAPI spec from document.yaml
            // Base URL: /adminapi/v2

            // Orders endpoints (most common for detection)
            { endpoint: '/adminapi/v2/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'AdminAPI v2 Orders' },
            { endpoint: '/adminapi/v2/orders/pull', method: 'POST', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'AdminAPI v2 Pull Orders' },

            // PRIORITY: V1 action-based patterns (for panels like bam1.net)
            { endpoint: '/adminapi/v1?action=verify-spam-check&link=test', method: 'GET', keyParam: 'key', checkType: 'orders', name: 'AdminAPI v1 verify-spam-check', isV1: true },
            { endpoint: '/adminapi/v1?action=getOrders&limit=1', method: 'GET', keyParam: 'key', checkType: 'orders', name: 'AdminAPI v1 getOrders', isV1: true },
            { endpoint: '/adminapi/v1?action=getOrders', method: 'GET', keyParam: 'key', checkType: 'orders', name: 'AdminAPI v1 getOrders NoLimit', isV1: true },
            { endpoint: '/adminapi/v1?action=getOrders-by-id&orders=1', method: 'GET', keyParam: 'key', checkType: 'orders', name: 'AdminAPI v1 getOrders-by-id', isV1: true },

            { endpoint: '/adminapi/v2/orders/update', method: 'POST', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'AdminAPI v2 Update Orders' },
            { endpoint: '/adminapi/v2/orders/resend', method: 'POST', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'AdminAPI v2 Resend' },
            { endpoint: '/adminapi/v2/orders/change-status', method: 'POST', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'AdminAPI v2 Change Status' },
            { endpoint: '/adminapi/v2/orders/cancel', method: 'POST', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'AdminAPI v2 Cancel' },
            { endpoint: '/adminapi/v2/orders/request-cancel', method: 'POST', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'AdminAPI v2 Request Cancel' },

            // Users endpoints
            { endpoint: '/adminapi/v2/users?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'users', name: 'AdminAPI v2 Users' },
            { endpoint: '/adminapi/v2/users/add', method: 'POST', keyHeader: 'X-Api-Key', checkType: 'users', name: 'AdminAPI v2 Add User' },

            // Payments endpoints
            { endpoint: '/adminapi/v2/payments?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'payments', name: 'AdminAPI v2 Payments' },
            { endpoint: '/adminapi/v2/payments/add', method: 'POST', keyHeader: 'X-Api-Key', checkType: 'payments', name: 'AdminAPI v2 Add Payment' },

            // Tickets endpoints
            { endpoint: '/adminapi/v2/tickets?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'tickets', name: 'AdminAPI v2 Tickets' },
            { endpoint: '/adminapi/v2/tickets/add', method: 'POST', keyHeader: 'X-Api-Key', checkType: 'tickets', name: 'AdminAPI v2 Add Ticket' },

            // Refill endpoints
            { endpoint: '/adminapi/v2/refill/pull', method: 'POST', keyHeader: 'X-Api-Key', checkType: 'refill', name: 'AdminAPI v2 Pull Refill' },
            { endpoint: '/adminapi/v2/refill/change-status', method: 'POST', keyHeader: 'X-Api-Key', checkType: 'refill', name: 'AdminAPI v2 Refill Status' },

            // Cancel endpoints
            { endpoint: '/adminapi/v2/cancel/pull', method: 'POST', keyHeader: 'X-Api-Key', checkType: 'cancel', name: 'AdminAPI v2 Pull Cancel' },
            { endpoint: '/adminapi/v2/cancel/reject', method: 'POST', keyHeader: 'X-Api-Key', checkType: 'cancel', name: 'AdminAPI v2 Reject Cancel' },

            // Services endpoints
            { endpoint: '/adminapi/v2/services?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'services', name: 'AdminAPI v2 Services' },

            // ==================== ADMIN API V1 (KEY PARAM AUTH) ====================
            // Based on Admin API v1 Documentation.html
            // Base URL: /adminapi/v1
            // Uses key parameter in body/query instead of header

            // V1 endpoints with action parameter (GET)
            { endpoint: '/adminapi/v1?action=getOrders&limit=1', method: 'GET', keyParam: 'key', checkType: 'orders', name: 'AdminAPI v1 getOrders', isV1: true },
            { endpoint: '/adminapi/v1?action=getOrders', method: 'GET', keyParam: 'key', checkType: 'orders', name: 'AdminAPI v1 getOrders NoLimit', isV1: true },
            { endpoint: '/adminapi/v1?action=getOrders-by-id&orders=1', method: 'GET', keyParam: 'key', checkType: 'orders', name: 'AdminAPI v1 getOrders-by-id', isV1: true },
            { endpoint: '/adminapi/v1?action=verify-spam-check&link=test', method: 'GET', keyParam: 'key', checkType: 'orders', name: 'AdminAPI v1 verify-spam-check', isV1: true },
            { endpoint: '/adminapi/v1?action=getorder&limit=1', method: 'GET', keyParam: 'key', checkType: 'orders', name: 'AdminAPI v1 getorder', isV1: true },
            { endpoint: '/adminapi/v1?action=getUser&limit=1', method: 'GET', keyParam: 'key', checkType: 'users', name: 'AdminAPI v1 getUser', isV1: true },
            { endpoint: '/adminapi/v1?action=getMassProviderData&limit=1', method: 'GET', keyParam: 'key', checkType: 'provider', name: 'AdminAPI v1 Provider Data', isV1: true },

            // V1 with X-Api-Key header (some panels use header auth for V1 too)
            { endpoint: '/adminapi/v1/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'AdminAPI v1 Orders (Header)' },
            { endpoint: '/adminapi/v1/orders', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'AdminAPI v1 Orders No Limit' },
            { endpoint: '/adminapi/v1/users?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'users', name: 'AdminAPI v1 Users (Header)' },
            { endpoint: '/adminapi/v1/services?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'services', name: 'AdminAPI v1 Services (Header)' },

            // V1 endpoints with action parameter (POST)
            { endpoint: '/adminapi/v1', method: 'POST', keyParam: 'key', actionParam: 'action', actions: ['updateOrders', 'setCompleted', 'setPartial', 'setCanceled'], checkType: 'orders', name: 'AdminAPI v1 Update', isV1: true },
            { endpoint: '/adminapi/v1', method: 'POST', keyParam: 'key', actionParam: 'action', actions: ['addPayment', 'deductPayment'], checkType: 'payments', name: 'AdminAPI v1 Payment', isV1: true },
            { endpoint: '/adminapi/v1', method: 'POST', keyParam: 'key', actionParam: 'action', actions: ['editService'], checkType: 'services', name: 'AdminAPI v1 Service', isV1: true },
            { endpoint: '/adminapi/v1', method: 'POST', keyParam: 'key', actionParam: 'action', actions: ['addTicket'], checkType: 'tickets', name: 'AdminAPI v1 Ticket', isV1: true },

            // ==================== ALTERNATIVE PATH FORMATS (V2 STYLE) ====================
            // /api/admin/ format
            { endpoint: '/api/admin/v2/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'API Admin v2 Orders' },
            { endpoint: '/api/admin/v2/users?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'users', name: 'API Admin v2 Users' },
            { endpoint: '/api/admin/v2/payments?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'payments', name: 'API Admin v2 Payments' },
            { endpoint: '/api/admin/v2/tickets?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'tickets', name: 'API Admin v2 Tickets' },
            { endpoint: '/api/admin/v1/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'API Admin v1' },
            { endpoint: '/api/admin/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'API Admin' },

            // /admin/api/ format
            { endpoint: '/admin/api/v2/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'Admin API v2' },
            { endpoint: '/admin/api/v1/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'Admin API v1' },
            { endpoint: '/admin/api/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'Admin API' },

            // Without version
            { endpoint: '/adminapi/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'AdminAPI No Version' },
            { endpoint: '/adminapi/users?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'users', name: 'AdminAPI Users No Version' },
            { endpoint: '/adminapi/payments?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'payments', name: 'AdminAPI Payments No Version' },

            // ==================== RENTALPANEL FORMAT ====================
            { endpoint: '/panel/adminapi/v2/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'RentalPanel v2' },
            { endpoint: '/panel/adminapi/v1/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'RentalPanel v1' },
            { endpoint: '/panel/admin/api/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'RentalPanel Admin' },

            // ==================== ALTERNATIVE HEADER NAMES ====================
            { endpoint: '/adminapi/v2/orders?limit=1', method: 'GET', keyHeader: 'Api-Key', checkType: 'orders', name: 'Api-Key Header' },
            { endpoint: '/adminapi/v2/orders?limit=1', method: 'GET', keyHeader: 'X-API-KEY', checkType: 'orders', name: 'X-API-KEY Header' },
            { endpoint: '/adminapi/v2/orders?limit=1', method: 'GET', keyHeader: 'x-api-key', checkType: 'orders', name: 'x-api-key Header' },
            { endpoint: '/adminapi/v2/orders?limit=1', method: 'GET', keyHeader: 'apikey', checkType: 'orders', name: 'apikey Header' },

            // ==================== REST API RESOURCES ====================
            { endpoint: '/api/v2/admin/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'REST Admin Orders' },
            { endpoint: '/api/v2/admin/users?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'users', name: 'REST Admin Users' },
            { endpoint: '/api/v2/admin/payments?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'payments', name: 'REST Admin Payments' },

            // ==================== CUSTOM/RARE FORMATS ====================
            { endpoint: '/backend/api/v2/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'Backend API' },
            { endpoint: '/system/api/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'System API' },
            { endpoint: '/v2/admin/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'V2 Admin' },
            { endpoint: '/v1/admin/orders?limit=1', method: 'GET', keyHeader: 'X-Api-Key', checkType: 'orders', name: 'V1 Admin' },

            // ==================== BEARER TOKEN FORMAT ====================
            { endpoint: '/adminapi/v2/orders?limit=1', method: 'GET', keyHeader: 'Authorization', checkType: 'orders', name: 'Bearer Token', useBearer: true },
            { endpoint: '/api/admin/v2/orders?limit=1', method: 'GET', keyHeader: 'Authorization', checkType: 'orders', name: 'Bearer API Admin', useBearer: true },
        ];
    }



    /**
     * Create axios instance for scanning
     */
    createClient() {
        return axios.create({
            timeout: this.requestTimeout,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'DICREWA-SmartScanner/2.0'
            },
            // Don't throw on HTTP errors - we handle them ourselves
            validateStatus: () => true
        });
    }

    /**
     * Normalize URL by removing trailing slashes and common API paths
     */
    normalizeUrl(url) {
        let normalized = url.trim();

        // Remove trailing slash
        normalized = normalized.replace(/\/+$/, '');

        // Remove common API paths if present (we'll add our own)
        normalized = normalized.replace(/\/adminapi\/v[12]$/i, '');
        normalized = normalized.replace(/\/api\/admin\/v[12]$/i, '');
        normalized = normalized.replace(/\/adminapi$/i, '');
        normalized = normalized.replace(/\/admin\/api$/i, '');

        return normalized;
    }

    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Try a single Admin API configuration
     */
    async tryConfiguration(baseUrl, apiKey, pattern) {
        const client = this.createClient();

        try {
            const patternName = pattern.name || pattern.endpoint;
            console.log(`[SmartScanner] Trying: ${patternName} (${pattern.method})`);

            let response;

            // Check if this is a V1 pattern (uses key param instead of header)
            if (pattern.isV1 && pattern.keyParam) {
                // V1 style - key in query/body
                let url = `${baseUrl}${pattern.endpoint}`;

                // Add key to URL for GET requests
                if (pattern.method === 'GET') {
                    const separator = url.includes('?') ? '&' : '?';
                    url = `${url}${separator}${pattern.keyParam}=${apiKey}`;
                    response = await client.get(url);
                } else {
                    // POST with key in body
                    const body = {
                        [pattern.keyParam]: apiKey
                    };
                    // Add action if needed
                    if (pattern.actionParam && pattern.actions && pattern.actions.length > 0) {
                        body[pattern.actionParam] = pattern.actions[0]; // Try first action
                    }
                    response = await client.post(url, body, {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            } else {
                // V2 style - key in header
                const fullUrl = `${baseUrl}${pattern.endpoint}`;
                const headers = {
                    'Accept': 'application/json'
                };

                if (pattern.useBearer) {
                    headers[pattern.keyHeader] = `Bearer ${apiKey}`;
                } else if (pattern.keyHeader) {
                    headers[pattern.keyHeader] = apiKey;
                }

                if (pattern.method === 'POST') {
                    response = await client.post(fullUrl, {}, { headers });
                } else {
                    response = await client.get(fullUrl, { headers });
                }
            }

            // Analyze the response
            return this.analyzeResponse(response.data, response.status, pattern);

        } catch (error) {
            console.log(`[SmartScanner] Error on ${pattern.name || pattern.endpoint}: ${error.message}`);
            return {
                success: false,
                errorType: 'CONNECTION_ERROR',
                error: error.message
            };
        }
    }



    /**
     * Analyze Admin API response to determine success or error type
     */
    analyzeResponse(data, statusCode, pattern) {
        // Handle non-JSON responses
        if (typeof data === 'string') {
            // Try to parse as JSON
            try {
                data = JSON.parse(data);
            } catch {
                // Not JSON - likely HTML error page
                if (data.includes('<!DOCTYPE') || data.includes('<html')) {
                    return {
                        success: false,
                        errorType: 'NOT_API_ENDPOINT',
                        error: 'Received HTML instead of JSON'
                    };
                }
                return {
                    success: false,
                    errorType: 'INVALID_RESPONSE',
                    error: 'Response is not valid JSON'
                };
            }
        }

        // Handle null/undefined response
        if (!data) {
            return {
                success: false,
                errorType: 'EMPTY_RESPONSE',
                error: 'Empty response from server'
            };
        }

        // Handle HTTP 401/403 - Invalid API Key
        if (statusCode === 401 || statusCode === 403) {
            return {
                success: false,
                errorType: 'INVALID_API_KEY',
                error: 'Invalid Admin API Key or unauthorized access'
            };
        }

        // ========== ADMIN API SUCCESS RESPONSES ==========

        // Check if we got an array response (orders, users, or services)
        if (Array.isArray(data)) {
            console.log(`[SmartScanner] Admin API detected! Got ${data.length} ${pattern.checkType || 'items'}`);
            return this.buildSuccessResponse(pattern);
        }

        // Check if we got an object with orders array
        if (data.orders && Array.isArray(data.orders)) {
            console.log(`[SmartScanner] Admin API detected! Got ${data.orders.length} orders`);
            return this.buildSuccessResponse(pattern);
        }

        // Check if we got an object with users array
        if (data.users && Array.isArray(data.users)) {
            console.log(`[SmartScanner] Admin API detected! Got ${data.users.length} users`);
            return this.buildSuccessResponse(pattern);
        }

        // Check if we got an object with services array
        if (data.services && Array.isArray(data.services)) {
            console.log(`[SmartScanner] Admin API detected! Got ${data.services.length} services`);
            return this.buildSuccessResponse(pattern);
        }

        // Check for payments array (Admin API v2)
        if (data.payments && Array.isArray(data.payments)) {
            console.log(`[SmartScanner] Admin API detected! Got ${data.payments.length} payments`);
            return this.buildSuccessResponse(pattern);
        }

        // Check for tickets array (Admin API v2)
        if (data.tickets && Array.isArray(data.tickets)) {
            console.log(`[SmartScanner] Admin API detected! Got ${data.tickets.length} tickets`);
            return this.buildSuccessResponse(pattern);
        }

        // Check for refill tasks response (Admin API v2)
        if (data.refill_tasks && Array.isArray(data.refill_tasks)) {
            console.log(`[SmartScanner] Admin API detected! Got ${data.refill_tasks.length} refill tasks`);
            return this.buildSuccessResponse(pattern);
        }

        // Check for cancel tasks response (Admin API v2)
        if (data.cancel_tasks && Array.isArray(data.cancel_tasks)) {
            console.log(`[SmartScanner] Admin API detected! Got ${data.cancel_tasks.length} cancel tasks`);
            return this.buildSuccessResponse(pattern);
        }

        // Check for Admin API v1 status: "success" response
        if (data.status === 'success') {
            console.log(`[SmartScanner] Admin API v1 detected via status: success`);
            return this.buildSuccessResponse(pattern);
        }

        // Check for pagination response (Admin API format)
        if (data.pagination !== undefined || data.total !== undefined || data.count !== undefined) {
            console.log(`[SmartScanner] Admin API detected via pagination response`);
            return this.buildSuccessResponse(pattern);
        }

        // Check for data wrapper with array
        if (data.data && Array.isArray(data.data)) {
            console.log(`[SmartScanner] Admin API detected via data wrapper`);
            return this.buildSuccessResponse(pattern);
        }

        // Check for data wrapper with object (single item response)
        if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
            console.log(`[SmartScanner] Admin API detected via data object`);
            return this.buildSuccessResponse(pattern);
        }

        // Check for success: true response
        if (data.success === true) {
            console.log(`[SmartScanner] Admin API detected via success flag`);
            return this.buildSuccessResponse(pattern);
        }

        // Check for success: 1 response (some panels use number instead of boolean)
        if (data.success === 1) {
            console.log(`[SmartScanner] Admin API detected via success: 1`);
            return this.buildSuccessResponse(pattern);
        }

        // Check for status: "ok" or similar
        if (data.status === 'ok' || data.status === 200) {
            console.log(`[SmartScanner] Admin API detected via status field`);
            return this.buildSuccessResponse(pattern);
        }

        // Check for status: "fail" with specific errors that indicate valid API
        // (e.g., "order_not_found" means API is working, just no data)
        if (data.status === 'fail' && data.error) {
            const errorLower = (typeof data.error === 'string' ? data.error : '').toLowerCase();
            // These errors mean the API is valid, just no data found
            const validEmptyErrors = ['order_not_found', 'no_orders', 'not_found', 'empty', 'no_data'];
            if (validEmptyErrors.some(e => errorLower.includes(e))) {
                console.log(`[SmartScanner] Admin API detected via valid empty response: ${data.error}`);
                return this.buildSuccessResponse(pattern);
            }
        }

        // Check for ticket_id response (Admin API v1 addTicket)
        if (data.ticket_id !== undefined) {
            console.log(`[SmartScanner] Admin API v1 detected via ticket_id`);
            return this.buildSuccessResponse(pattern);
        }

        // Check for provider data response (Admin API v1)
        if (data.total_providers !== undefined || data.total_orders_found !== undefined) {
            console.log(`[SmartScanner] Admin API v1 detected via provider data`);
            return this.buildSuccessResponse(pattern);
        }


        // ========== ERROR RESPONSES ==========

        const errorMsg = data.error || data.message || data.msg || data.error_message || '';
        const errorLower = (typeof errorMsg === 'string' ? errorMsg : '').toLowerCase();

        // ========== ADMIN API V1 ERROR CODES ==========
        // These are specific error codes from Admin API v1 documentation

        // bad_auth - Invalid API key (STOP scanning, key is wrong)
        if (errorMsg === 'bad_auth' || errorLower.includes('bad_auth')) {
            return {
                success: false,
                errorType: 'INVALID_API_KEY',
                error: 'Invalid Admin API Key (bad_auth)'
            };
        }

        // bad_action - Invalid action (means API is responding, just wrong action)
        // This is actually a SUCCESS indicator - API is working!
        if (errorMsg === 'bad_action' || errorLower.includes('bad_action')) {
            console.log(`[SmartScanner] Admin API detected via bad_action response`);
            return this.buildSuccessResponse(pattern);
        }

        // These V1 errors indicate the API is working, just no data found
        const validV1Errors = [
            'order_not_found', 'no_orders', 'orders_not_found',
            'bad_username', 'user_not_found',
            'service_not_found', 'bad_service',
            'bad_amount', 'no_data', 'empty'
        ];

        if (validV1Errors.some(e => errorMsg === e || errorLower.includes(e))) {
            console.log(`[SmartScanner] Admin API detected via V1 error: ${errorMsg}`);
            return this.buildSuccessResponse(pattern);
        }

        // Invalid API key errors
        if (errorLower.includes('invalid') && (errorLower.includes('key') || errorLower.includes('api'))) {
            return {
                success: false,
                errorType: 'INVALID_API_KEY',
                error: errorMsg || 'Invalid Admin API Key'
            };
        }

        // API key required/missing
        if (errorLower.includes('required') || errorLower.includes('missing') || errorLower.includes('unauthorized')) {
            return {
                success: false,
                errorType: 'API_KEY_REQUIRED',
                error: errorMsg || 'Admin API Key is required'
            };
        }

        // Rate limiting
        if (errorLower.includes('rate') || errorLower.includes('limit') || errorLower.includes('too many')) {
            return {
                success: false,
                errorType: 'RATE_LIMITED',
                error: errorMsg || 'Rate limited - please try again later'
            };
        }

        // Generic error from API
        if (data.error || data.status === false || data.success === false) {
            return {
                success: false,
                errorType: 'API_ERROR',
                error: errorMsg || 'Unknown API error'
            };
        }

        // Unknown response format
        return {
            success: false,
            errorType: 'UNKNOWN_FORMAT',
            error: 'Unrecognized Admin API response format'
        };
    }

    /**
     * Build success response for Admin API
     */
    buildSuccessResponse(pattern) {
        // Extract base endpoint (remove query params and resource name)
        let baseEndpoint = pattern.endpoint.split('?')[0];
        // Remove resource suffixes
        baseEndpoint = baseEndpoint.replace(/\/(orders|users|services|payments|tickets|refill|cancel)(\/.*)?$/, '');

        // Determine API version
        const isV1 = pattern.isV1 === true;
        const apiVersion = isV1 ? 'v1' : 'v2';

        // Determine auth type
        let authType = 'header';
        if (pattern.useBearer) {
            authType = 'bearer';
        } else if (isV1 && pattern.keyParam) {
            authType = 'param';
        }

        // Set correct panelType based on API version
        // V1 (action-based, key param) = RENTAL
        // V2 (RESTful, header auth) = PERFECT_PANEL
        const panelType = isV1 ? 'RENTAL' : 'PERFECT_PANEL';

        return {
            success: true,
            balance: 0, // Admin API doesn't return balance directly
            currency: 'USD',
            panelType: panelType,
            detectedConfig: {
                endpoint: baseEndpoint,
                method: pattern.method,
                keyHeader: pattern.keyHeader || null,
                keyParam: pattern.keyParam || null,
                authType: authType,
                apiVersion: apiVersion,
                isAdminApi: true,
                isV1: isV1,
                patternName: pattern.name || 'Unknown',
                checkType: pattern.checkType || 'orders'
            }
        };
    }



    /**
     * Main scanning function - tries all Admin API configurations until success
     * 
     * @param {string} url - Panel URL
     * @param {string} apiKey - Admin API Key
     * @param {function|null} onProgress - Optional callback for progress updates
     * @returns {Promise<object>} Scan result
     */
    async scan(url, apiKey, onProgress = null) {
        const startTime = Date.now();
        const baseUrl = this.normalizeUrl(url);

        console.log(`[SmartScanner] Starting Admin API scan for: ${baseUrl}`);
        console.log(`[SmartScanner] Testing ${this.scanPatterns.length} configurations...`);

        const attempts = [];
        let connectionErrorCount = 0;

        for (let i = 0; i < this.scanPatterns.length; i++) {
            const pattern = this.scanPatterns[i];

            // Check max scan time
            if (Date.now() - startTime > this.maxScanTime) {
                console.log(`[SmartScanner] Max scan time reached (${this.maxScanTime}ms)`);
                break;
            }

            // Progress callback
            if (onProgress) {
                onProgress({
                    current: i + 1,
                    total: this.scanPatterns.length,
                    testing: `${pattern.method} ${baseUrl}${pattern.endpoint}`,
                    percentage: Math.round(((i + 1) / this.scanPatterns.length) * 100)
                });
            }

            // Try this configuration
            const result = await this.tryConfiguration(baseUrl, apiKey, pattern);

            attempts.push({
                pattern,
                result
            });

            // SUCCESS - return immediately
            if (result.success) {
                console.log(`[SmartScanner] ✅ SUCCESS! Admin API detected`);
                console.log(`[SmartScanner] Endpoint: ${pattern.endpoint}`);

                return {
                    success: true,
                    balance: result.balance,
                    currency: result.currency,
                    panelType: result.panelType,
                    detectedConfig: result.detectedConfig,
                    attempts: attempts.length,
                    scanTime: Date.now() - startTime
                };
            }

            // INVALID KEY - stop scanning immediately
            if (result.errorType === 'INVALID_API_KEY') {
                console.log(`[SmartScanner] ❌ Invalid Admin API Key`);
                return {
                    success: false,
                    errorType: 'INVALID_API_KEY',
                    error: 'Invalid Admin API Key. Please check your Admin API Key from the panel admin settings.',
                    attempts: attempts.length,
                    scanTime: Date.now() - startTime
                };
            }

            // CONNECTION ERROR counter
            if (result.errorType === 'CONNECTION_ERROR') {
                connectionErrorCount++;
                if (connectionErrorCount >= 2) {
                    console.log(`[SmartScanner] ❌ Cannot connect to panel`);
                    return {
                        success: false,
                        errorType: 'CONNECTION_ERROR',
                        error: 'Cannot connect to panel. Please check the URL and make sure the panel is online.',
                        attempts: attempts.length,
                        scanTime: Date.now() - startTime
                    };
                }
            }

            // Add delay between requests
            if (i < this.scanPatterns.length - 1) {
                await this.delay(this.requestDelay);
            }
        }

        // All patterns tried, none worked
        console.log(`[SmartScanner] ❌ Could not detect Admin API after ${attempts.length} attempts`);

        return {
            success: false,
            errorType: 'DETECTION_FAILED',
            error: 'Could not detect Admin API. Make sure you are using the Admin API Key (not User API Key).',
            attempts: attempts.length,
            scanTime: Date.now() - startTime,
            triedPatterns: attempts.map(a => ({
                endpoint: a.pattern.endpoint,
                method: a.pattern.method,
                errorType: a.result.errorType
            }))
        };
    }

    /**
     * Quick test - only tries the most common pattern
     * Useful for re-testing a known panel
     */
    async quickTest(url, apiKey) {
        const baseUrl = this.normalizeUrl(url);
        const pattern = this.scanPatterns[0]; // Most common: /adminapi/v2/orders

        console.log(`[SmartScanner] Quick test: ${baseUrl}`);

        const result = await this.tryConfiguration(baseUrl, apiKey, pattern);

        if (result.success) {
            return {
                success: true,
                panelType: result.panelType,
                detectedConfig: result.detectedConfig
            };
        }

        return {
            success: false,
            errorType: result.errorType,
            error: result.error
        };
    }
}

module.exports = new SmartPanelScanner();
