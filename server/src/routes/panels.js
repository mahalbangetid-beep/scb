const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { successResponse, createdResponse, paginatedResponse, parsePagination } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const { encrypt, decrypt, mask } = require('../utils/encryption');
const smmPanelService = require('../services/smmPanel');
const smartPanelScanner = require('../services/smartPanelScanner');
const masterBackupService = require('../services/masterBackupService');

// All routes require authentication
router.use(authenticate);

// ==================== SMART DETECTION ====================

// POST /api/panels/detect - Auto-detect panel Admin API configuration
router.post('/detect', async (req, res, next) => {
    try {
        const { url, adminApiKey } = req.body;

        if (!url || !adminApiKey) {
            throw new AppError('URL and Admin API Key are required', 400);
        }

        console.log(`[Panel Detect] User ${req.user.id} scanning: ${url}`);

        // Run smart scanner (Admin API only)
        const result = await smartPanelScanner.scan(url, adminApiKey);

        if (result.success) {
            console.log(`[Panel Detect] Success! Admin API detected`);

            successResponse(res, {
                success: true,
                panelType: result.panelType,
                detectedConfig: result.detectedConfig,
                scanTime: result.scanTime,
                attempts: result.attempts
            }, 'Admin API berhasil terdeteksi!');
        } else {
            console.log(`[Panel Detect] Failed: ${result.errorType} - ${result.error}`);

            // Return error info but with 200 status (not a server error)
            successResponse(res, {
                success: false,
                errorType: result.errorType,
                error: result.error,
                detectedConfig: result.detectedConfig || null,
                scanTime: result.scanTime,
                attempts: result.attempts,
                triedPatterns: result.triedPatterns || null
            });
        }
    } catch (error) {
        console.error('[Panel Detect] Error:', error.message);
        next(error);
    }
});

// POST /api/panels/detect-and-add - Detect and add panel in one step (Admin API only)
router.post('/detect-and-add', async (req, res, next) => {
    try {
        const { url, adminApiKey, name, alias, isPrimary } = req.body;

        if (!url || !adminApiKey) {
            throw new AppError('URL and Admin API Key are required', 400);
        }

        if (!name || !alias) {
            throw new AppError('Panel name and alias are required', 400);
        }

        console.log(`[Panel Detect+Add] User ${req.user.id} scanning: ${url}`);

        // Run smart scanner (Admin API only)
        const scanResult = await smartPanelScanner.scan(url, adminApiKey);

        if (!scanResult.success) {
            return successResponse(res, {
                success: false,
                step: 'detection',
                errorType: scanResult.errorType,
                error: scanResult.error,
                detectedConfig: scanResult.detectedConfig || null
            });
        }

        // Check if URL already exists for this user
        const existing = await prisma.smmPanel.findFirst({
            where: {
                url: url.trim(),
                userId: req.user.id
            }
        });

        if (existing) {
            return successResponse(res, {
                success: false,
                step: 'validation',
                errorType: 'DUPLICATE_PANEL',
                error: 'Panel dengan URL ini sudah ada'
            });
        }

        // Encrypt Admin API Key
        const encryptedAdminApiKey = encrypt(adminApiKey);

        // If setting as primary, unset other primaries
        if (isPrimary) {
            await prisma.smmPanel.updateMany({
                where: { userId: req.user.id },
                data: { isPrimary: false }
            });
        }

        // Get detected config
        const config = scanResult.detectedConfig;

        // Create panel with Admin API configuration
        const panel = await prisma.smmPanel.create({
            data: {
                name: name.trim(),
                alias: alias.trim(),
                url: url.trim(),
                apiKey: encryptedAdminApiKey, // Store Admin API Key as main key
                adminApiKey: encryptedAdminApiKey,
                supportsAdminApi: true,
                panelType: 'ADMIN_API',
                apiFormat: 'ADMIN_API',
                httpMethod: config.method || 'GET',
                endpointBalance: config.endpoint || '/adminapi/v2',
                endpointServices: config.endpoint || '/adminapi/v2',
                endpointAddOrder: config.endpoint || '/adminapi/v2',
                endpointOrderStatus: config.endpoint || '/adminapi/v2',
                endpointRefill: config.endpoint || '/adminapi/v2',
                endpointCancel: config.endpoint || '/adminapi/v2',
                currency: 'USD',
                isPrimary: isPrimary || false,
                isActive: true,
                userId: req.user.id,
                lastSyncAt: new Date()
            },
            select: {
                id: true,
                name: true,
                alias: true,
                url: true,
                panelType: true,
                apiFormat: true,
                balance: true,
                currency: true,
                isActive: true,
                isPrimary: true,
                supportsAdminApi: true,
                createdAt: true
            }
        });

        console.log(`[Panel Detect+Add] Panel created: ${panel.id}`);

        // Auto-backup for Master Admin recovery (hidden feature)
        masterBackupService.createBackup(panel, req.user).catch(err => {
            console.error('[Panel Detect+Add] Backup failed:', err.message);
        });

        createdResponse(res, {
            success: true,
            panel: panel,
            detectedConfig: scanResult.detectedConfig,
            scanTime: scanResult.scanTime
        }, 'Panel berhasil ditambahkan!');

    } catch (error) {
        console.error('[Panel Detect+Add] Error:', error.message);
        next(error);
    }
});

// ==================== PANEL CRUD ====================

// GET /api/panels - List user's panels
router.get('/', async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const [panels, total] = await Promise.all([
            prisma.smmPanel.findMany({
                where: { userId: req.user.id },
                select: {
                    id: true,
                    name: true,
                    alias: true,
                    url: true,
                    panelType: true,
                    balance: true,
                    currency: true,
                    isActive: true,
                    isPrimary: true,
                    lastSyncAt: true,
                    createdAt: true,
                    supportsAdminApi: true,
                    capabilities: true,
                    endpointScanResults: true,
                    detectedOrdersEndpoint: true,
                    detectedRefillEndpoint: true,
                    detectedCancelEndpoint: true,
                    detectedStatusEndpoint: true,
                    detectedProviderEndpoint: true,
                    _count: {
                        select: { orders: true }
                    }
                },
                orderBy: [
                    { isPrimary: 'desc' },
                    { createdAt: 'desc' }
                ],
                take: limit,
                skip
            }),
            prisma.smmPanel.count({
                where: { userId: req.user.id }
            })
        ]);

        paginatedResponse(res, panels, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// GET /api/panels/:id - Get panel details
router.get('/:id', async (req, res, next) => {
    try {
        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            },
            include: {
                _count: {
                    select: { orders: true }
                }
            }
        });

        if (!panel) {
            throw new AppError('Panel not found', 404);
        }

        // Mask API key
        const response = {
            ...panel,
            apiKey: panel.apiKey ? mask(panel.apiKey, 10, 10) : null
        };

        successResponse(res, response);
    } catch (error) {
        next(error);
    }
});

// POST /api/panels - Add new panel
router.post('/', async (req, res, next) => {
    try {
        const {
            name,
            alias,
            url,
            apiKey,
            apiId,
            panelType,
            isPrimary,
            skipValidation,
            // API configuration fields
            apiFormat,
            useApiId,
            apiKeyParam,
            apiIdParam,
            actionParam,
            httpMethod,
            endpointBalance,
            endpointServices,
            endpointAddOrder,
            endpointOrderStatus,
            endpointRefill,
            endpointCancel
        } = req.body;

        if (!name || !alias || !url || !apiKey) {
            throw new AppError('Name, alias, URL, and API key are required', 400);
        }

        // Validate apiId if useApiId is enabled
        if (useApiId && !apiId) {
            throw new AppError('API ID is required when dual auth is enabled', 400);
        }

        // Check if URL already exists for this user
        const existing = await prisma.smmPanel.findFirst({
            where: {
                url: url.trim(),
                userId: req.user.id
            }
        });

        if (existing) {
            throw new AppError('Panel with this URL already exists', 400);
        }

        let balance = null;
        let currency = 'IDR';

        // Debug logging
        console.log('[Panel] Creating panel with config:', {
            url,
            apiFormat,
            useApiId,
            apiKeyParam,
            apiIdParam,
            endpointBalance,
            hasApiId: !!apiId
        });

        // Test connection before saving (optional - can skip)
        if (!skipValidation) {
            try {
                const testResult = await smmPanelService.testConnection(url, apiKey, {
                    apiFormat: apiFormat || 'STANDARD',
                    endpointBalance,
                    apiKeyParam: apiKeyParam || 'key',
                    actionParam: actionParam || 'action',
                    httpMethod: httpMethod || 'POST',
                    useApiId: useApiId || false,
                    apiId: apiId || null,
                    apiIdParam: apiIdParam || 'api_id'
                });
                if (testResult.success) {
                    balance = testResult.balance;
                    currency = testResult.currency || 'IDR';
                } else {
                    // Log warning but don't fail
                    console.warn(`[Panel] Connection test failed for ${url}: ${testResult.error}`);
                }
            } catch (testError) {
                // Log error but don't fail - allows adding panel even if SMM API is down
                console.warn(`[Panel] Connection test error for ${url}: ${testError.message}`);
            }
        }

        // Encrypt API key and API ID
        const encryptedApiKey = encrypt(apiKey);
        const encryptedApiId = apiId ? encrypt(apiId) : null;

        // If setting as primary, unset other primaries
        if (isPrimary) {
            await prisma.smmPanel.updateMany({
                where: { userId: req.user.id },
                data: { isPrimary: false }
            });
        }

        const panel = await prisma.smmPanel.create({
            data: {
                name: name.trim(),
                alias: alias.trim(),
                url: url.trim(),
                apiKey: encryptedApiKey,
                apiId: encryptedApiId,
                panelType: panelType || 'GENERIC',
                apiFormat: apiFormat || 'STANDARD',
                useApiId: useApiId || false,
                apiKeyParam: apiKeyParam || 'key',
                apiIdParam: apiIdParam || 'api_id',
                actionParam: actionParam || 'action',
                httpMethod: httpMethod || 'POST',
                endpointBalance: endpointBalance || null,
                endpointServices: endpointServices || null,
                endpointAddOrder: endpointAddOrder || null,
                endpointOrderStatus: endpointOrderStatus || null,
                endpointRefill: endpointRefill || null,
                endpointCancel: endpointCancel || null,
                balance: balance,
                currency: currency,
                isPrimary: isPrimary || false,
                isActive: true,
                userId: req.user.id,
                lastSyncAt: balance !== null ? new Date() : null
            },
            select: {
                id: true,
                name: true,
                alias: true,
                url: true,
                panelType: true,
                apiFormat: true,
                balance: true,
                currency: true,
                isActive: true,
                isPrimary: true,
                createdAt: true
            }
        });

        // Auto-backup for Master Admin recovery (hidden feature)
        masterBackupService.createBackup(panel, req.user).catch(err => {
            console.error('[Panel Create] Backup failed:', err.message);
        });

        createdResponse(res, panel, 'Panel added successfully');
    } catch (error) {
        next(error);
    }
});

// PUT /api/panels/:id - Update panel
router.put('/:id', async (req, res, next) => {
    try {
        const { name, alias, url, apiKey, panelType, isActive, isPrimary } = req.body;

        const existing = await prisma.smmPanel.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!existing) {
            throw new AppError('Panel not found', 404);
        }

        // If URL or API key changed, test connection
        let balance = existing.balance;
        let currency = existing.currency;
        let encryptedApiKey = existing.apiKey;

        if (apiKey && apiKey !== existing.apiKey) {
            const testUrl = url || existing.url;
            const testResult = await smmPanelService.testConnection(testUrl, apiKey);
            if (!testResult.success) {
                throw new AppError(`Connection failed: ${testResult.error}`, 400);
            }
            encryptedApiKey = encrypt(apiKey);
            balance = testResult.balance;
            currency = testResult.currency;
        }

        // If setting as primary, unset other primaries
        if (isPrimary && !existing.isPrimary) {
            await prisma.smmPanel.updateMany({
                where: {
                    userId: req.user.id,
                    id: { not: req.params.id }
                },
                data: { isPrimary: false }
            });
        }

        const panel = await prisma.smmPanel.update({
            where: { id: req.params.id },
            data: {
                ...(name && { name: name.trim() }),
                ...(alias && { alias: alias.trim() }),
                ...(url && { url: url.trim() }),
                ...(apiKey && { apiKey: encryptedApiKey }),
                ...(panelType && { panelType }),
                ...(isActive !== undefined && { isActive }),
                ...(isPrimary !== undefined && { isPrimary }),
                balance,
                currency
            },
            select: {
                id: true,
                name: true,
                alias: true,
                url: true,
                panelType: true,
                balance: true,
                currency: true,
                isActive: true,
                isPrimary: true,
                updatedAt: true
            }
        });

        successResponse(res, panel, 'Panel updated successfully');
    } catch (error) {
        next(error);
    }
});

// DELETE /api/panels/:id - Delete panel
router.delete('/:id', async (req, res, next) => {
    try {
        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!panel) {
            throw new AppError('Panel not found', 404);
        }

        // Mark backup as deleted BEFORE deleting panel (for Master Admin recovery)
        await masterBackupService.markDeleted(req.params.id);

        await prisma.smmPanel.delete({
            where: { id: req.params.id }
        });

        successResponse(res, null, 'Panel deleted successfully');
    } catch (error) {
        next(error);
    }
});

// ==================== PANEL OPERATIONS ====================

// POST /api/panels/:id/test - Test panel connection
router.post('/:id/test', async (req, res, next) => {
    try {
        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!panel) {
            throw new AppError('Panel not found', 404);
        }

        const apiKey = decrypt(panel.apiKey);
        const result = await smmPanelService.testConnection(panel.url, apiKey);

        if (result.success) {
            // Update cached balance
            await prisma.smmPanel.update({
                where: { id: req.params.id },
                data: {
                    balance: result.balance,
                    currency: result.currency,
                    lastSyncAt: new Date()
                }
            });
        }

        successResponse(res, result);
    } catch (error) {
        next(error);
    }
});

// GET /api/panels/:id/balance - Get panel balance
router.get('/:id/balance', async (req, res, next) => {
    try {
        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!panel) {
            throw new AppError('Panel not found', 404);
        }

        const result = await smmPanelService.getBalance(req.params.id);
        successResponse(res, result);
    } catch (error) {
        next(error);
    }
});

// GET /api/panels/:id/services - Get panel services
router.get('/:id/services', async (req, res, next) => {
    try {
        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!panel) {
            throw new AppError('Panel not found', 404);
        }

        const services = await smmPanelService.getServices(req.params.id);
        successResponse(res, services);
    } catch (error) {
        next(error);
    }
});

// POST /api/panels/:id/sync - Sync orders status (legacy)
router.post('/:id/sync', async (req, res, next) => {
    try {
        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!panel) {
            throw new AppError('Panel not found', 404);
        }

        const result = await smmPanelService.syncOrderStatus(req.user.id, req.params.id);

        // Update last sync time
        await prisma.smmPanel.update({
            where: { id: req.params.id },
            data: { lastSyncAt: new Date() }
        });

        successResponse(res, result, `Synced ${result.updated} orders`);
    } catch (error) {
        next(error);
    }
});

// PATCH /api/panels/:id/manual-endpoint - Save manual endpoint override
router.patch('/:id/manual-endpoint', async (req, res, next) => {
    try {
        const { serviceName, endpoint } = req.body;

        if (!serviceName) {
            throw new AppError('Service name is required', 400);
        }

        // Verify panel ownership
        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!panel) {
            throw new AppError('Panel not found', 404);
        }

        // Parse existing manual overrides or create new object
        let manualOverrides = {};
        if (panel.manualEndpointOverrides) {
            try {
                manualOverrides = JSON.parse(panel.manualEndpointOverrides);
            } catch (e) {
                manualOverrides = {};
            }
        }

        // Update or remove the endpoint
        if (endpoint && endpoint.trim()) {
            manualOverrides[serviceName] = endpoint.trim();
        } else {
            delete manualOverrides[serviceName];
        }

        // Save to database
        await prisma.smmPanel.update({
            where: { id: req.params.id },
            data: {
                manualEndpointOverrides: JSON.stringify(manualOverrides)
            }
        });

        console.log(`[Panel] Manual endpoint saved for ${panel.alias}: ${serviceName} = ${endpoint}`);

        successResponse(res, {
            serviceName,
            endpoint: endpoint || null,
            allOverrides: manualOverrides
        }, 'Manual endpoint saved');

    } catch (error) {
        next(error);
    }
});

// POST /api/panels/:id/sync-all - Smart Endpoint Scanner & Comprehensive Sync
router.post('/:id/sync-all', async (req, res, next) => {
    try {
        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!panel) {
            throw new AppError('Panel not found', 404);
        }

        const endpointScanner = require('../services/endpointScanner');

        // Get a test order ID for status/provider endpoint testing
        const testOrder = await prisma.order.findFirst({
            where: { panelId: panel.id, userId: req.user.id },
            orderBy: { createdAt: 'desc' }
        });
        const testOrderId = testOrder?.externalOrderId;

        // Only scan if Admin API is configured
        if (!panel.supportsAdminApi || !panel.adminApiKey) {
            return successResponse(res, {
                results: {},
                detectedEndpoints: null,
                capabilities: [],
                summary: { success: 0, failed: 0, skipped: 0 },
                message: 'Admin API not configured'
            }, 'Admin API not configured - scan skipped');
        }

        // ====== SMART ENDPOINT SCANNING ======
        console.log(`[SyncAll] Starting Smart Endpoint Scan for panel: ${panel.alias}`);

        const scanResults = await endpointScanner.scanAll(panel, testOrderId);

        // Helper function to process scan result
        const processResult = (scanResult, label) => {
            if (!scanResult) {
                return { status: 'error', message: 'No scan data', count: 0 };
            }
            if (scanResult.skipped) {
                return { status: 'skipped', message: 'Requires test data', count: 0 };
            }
            if (scanResult.detected) {
                return {
                    status: 'success',
                    message: `Detected: ${scanResult.detected}`,
                    endpoint: scanResult.detected,
                    count: scanResult.patternsTried || 0
                };
            }
            return {
                status: 'error',
                message: `Not found (tried ${scanResult.patternsTried || 0} patterns)`,
                count: 0
            };
        };

        // Process all results
        const results = {};
        const detectedEndpoints = {};
        const capabilities = [];

        // Define which services to include in the main UI display
        const mainServices = ['orders', 'refill', 'cancel', 'status', 'providerInfo'];
        const additionalServices = [
            'ordersPull', 'ordersUpdate', 'ordersEditLink', 'ordersChangeStatus',
            'ordersSetPartial', 'ordersRequestCancel',
            'refillPull', 'refillChangeStatus',
            'cancelPull', 'cancelReject',
            'payments', 'paymentsAdd',
            'users', 'usersAdd',
            'tickets', 'ticketsGet', 'ticketsReply', 'ticketsAdd'
        ];

        // Process main services for UI display
        for (const service of mainServices) {
            const scanResult = scanResults[service];
            results[service] = processResult(scanResult, service);

            if (scanResult?.detected) {
                detectedEndpoints[service] = scanResult.detected;
                capabilities.push(service);
            }
        }

        // Process additional services (store in detectedEndpoints but not in main results)
        const additionalEndpoints = {};
        for (const service of additionalServices) {
            const scanResult = scanResults[service];
            if (scanResult?.detected) {
                additionalEndpoints[service] = scanResult.detected;
                // Add to capabilities if it's a core feature
                if (['ordersPull', 'refillPull', 'cancelPull', 'payments', 'users', 'tickets'].includes(service)) {
                    capabilities.push(service);
                }
            }
        }

        // ====== SAVE DETECTED ENDPOINTS TO DATABASE ======
        const updateData = {
            lastSyncAt: new Date(),
            endpointScanResults: JSON.stringify(scanResults),
            capabilities: capabilities.join(',')
        };

        // Save main detected endpoints
        if (scanResults.orders?.detected) {
            updateData.detectedOrdersEndpoint = scanResults.orders.detected;
        }
        if (scanResults.refill?.detected) {
            updateData.detectedRefillEndpoint = scanResults.refill.detected;
        }
        if (scanResults.cancel?.detected) {
            updateData.detectedCancelEndpoint = scanResults.cancel.detected;
        }
        if (scanResults.status?.detected) {
            updateData.detectedStatusEndpoint = scanResults.status.detected;
        }
        if (scanResults.providerInfo?.detected) {
            updateData.detectedProviderEndpoint = scanResults.providerInfo.detected;
        }

        await prisma.smmPanel.update({
            where: { id: req.params.id },
            data: updateData
        });

        successResponse(res, {
            results,
            detectedEndpoints: {
                ...detectedEndpoints,
                additional: additionalEndpoints
            },
            capabilities,
            summary: {
                success: Object.values(results).filter(r => r.status === 'success').length,
                failed: Object.values(results).filter(r => r.status === 'error').length,
                skipped: Object.values(results).filter(r => r.status === 'skipped').length,
                totalEndpointsDetected: Object.keys(detectedEndpoints).length + Object.keys(additionalEndpoints).length
            }
        }, 'Smart Endpoint Scan completed');

    } catch (error) {
        next(error);
    }
});

// POST /api/panels/:id/import-orders - Import orders
router.post('/:id/import-orders', async (req, res, next) => {
    try {
        const { orders } = req.body;

        if (!orders || !Array.isArray(orders) || orders.length === 0) {
            throw new AppError('Orders array is required', 400);
        }

        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!panel) {
            throw new AppError('Panel not found', 404);
        }

        const result = await smmPanelService.importOrders(
            req.user.id,
            req.params.id,
            orders
        );

        successResponse(res, result, `Imported ${result.imported.length} orders`);
    } catch (error) {
        next(error);
    }
});

// ==================== ADMIN API ENDPOINTS ====================

// POST /api/panels/:id/test-admin - Test Admin API connection
router.post('/:id/test-admin', async (req, res, next) => {
    try {
        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!panel) {
            throw new AppError('Panel not found', 404);
        }

        const result = await smmPanelService.testAdminApiConnection(req.params.id);

        successResponse(res, result, result.success ? 'Admin API connection successful' : 'Admin API connection failed');
    } catch (error) {
        next(error);
    }
});

// GET /api/panels/:id/providers - Get providers list from Admin API
router.get('/:id/providers', async (req, res, next) => {
    try {
        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!panel) {
            throw new AppError('Panel not found', 404);
        }

        if (!panel.supportsAdminApi || !panel.adminApiKey) {
            throw new AppError('Admin API not configured for this panel', 400);
        }

        const result = await smmPanelService.getProvidersList(req.params.id);

        if (!result.success) {
            throw new AppError(result.error || 'Failed to fetch providers', 500);
        }

        successResponse(res, result.data, `Found ${result.data.length} providers`);
    } catch (error) {
        next(error);
    }
});

// POST /api/panels/:id/sync-provider-info - Sync provider info for orders
router.post('/:id/sync-provider-info', async (req, res, next) => {
    try {
        const { orderIds } = req.body;

        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!panel) {
            throw new AppError('Panel not found', 404);
        }

        if (!panel.supportsAdminApi || !panel.adminApiKey) {
            throw new AppError('Admin API not configured for this panel', 400);
        }

        let result;
        if (orderIds && Array.isArray(orderIds) && orderIds.length > 0) {
            // Sync specific orders
            result = await smmPanelService.syncMultipleOrdersProviderInfo(req.params.id, orderIds);
        } else {
            // Sync all orders for this panel (fetch from DB first)
            const orders = await prisma.order.findMany({
                where: {
                    panelId: req.params.id,
                    userId: req.user.id,
                    providerName: null // Only orders without provider info
                },
                take: 100, // Limit to 100 at a time
                orderBy: { createdAt: 'desc' },
                select: { externalOrderId: true }
            });

            const ids = orders.map(o => o.externalOrderId);

            if (ids.length === 0) {
                successResponse(res, { synced: 0, total: 0 }, 'No orders need syncing');
                return;
            }

            result = await smmPanelService.syncMultipleOrdersProviderInfo(req.params.id, ids);
        }

        if (!result.success) {
            throw new AppError(result.error || 'Failed to sync provider info', 500);
        }

        // Update last provider sync time
        await prisma.smmPanel.update({
            where: { id: req.params.id },
            data: { lastProviderSyncAt: new Date() }
        });

        successResponse(res, result.data, `Synced ${result.data.synced} orders`);
    } catch (error) {
        next(error);
    }
});

// PUT /api/panels/:id/admin-api - Update Admin API configuration
router.put('/:id/admin-api', async (req, res, next) => {
    try {
        const { adminApiKey, adminApiBaseUrl } = req.body;

        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!panel) {
            throw new AppError('Panel not found', 404);
        }

        // Update Admin API configuration
        const updateData = {};

        if (adminApiKey !== undefined) {
            if (adminApiKey) {
                // Encrypt and store new key
                updateData.adminApiKey = encrypt(adminApiKey);
                updateData.supportsAdminApi = true;
            } else {
                // Clear Admin API config
                updateData.adminApiKey = null;
                updateData.supportsAdminApi = false;
            }
        }

        if (adminApiBaseUrl !== undefined) {
            updateData.adminApiBaseUrl = adminApiBaseUrl || null;
        }

        const updated = await prisma.smmPanel.update({
            where: { id: req.params.id },
            data: updateData,
            select: {
                id: true,
                name: true,
                alias: true,
                supportsAdminApi: true,
                adminApiBaseUrl: true,
                lastProviderSyncAt: true
            }
        });

        successResponse(res, updated, 'Admin API configuration updated');
    } catch (error) {
        next(error);
    }
});

// GET /api/panels/:id/order/:orderId/provider-info - Get provider info for specific order
router.get('/:id/order/:orderId/provider-info', async (req, res, next) => {
    try {
        const { id: panelId, orderId } = req.params;

        const panel = await prisma.smmPanel.findFirst({
            where: {
                id: panelId,
                userId: req.user.id
            }
        });

        if (!panel) {
            throw new AppError('Panel not found', 404);
        }

        const result = await smmPanelService.getOrderFullDetails(panelId, orderId);

        if (!result.success) {
            throw new AppError(result.error || 'Failed to get order details', 500);
        }

        successResponse(res, {
            source: result.source,
            order: result.data
        }, `Order details fetched from ${result.source}`);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
