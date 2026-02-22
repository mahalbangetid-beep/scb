/**
 * Command Handler Service
 * 
 * Process SMM commands (refill, cancel, speed-up, status) for orders
 * Validates ownership, checks status, and executes commands
 */

const prisma = require('../utils/prisma');
const adminApiService = require('./adminApiService');
const commandParser = require('./commandParser');
const groupForwardingService = require('./groupForwarding');
const securityService = require('./securityService');
const commandTemplateService = require('./commandTemplateService');
const responseTemplateService = require('./responseTemplateService');
const botFeatureService = require('./botFeatureService');
const userMappingService = require('./userMappingService');

class CommandHandlerService {
    constructor() {
        this.io = null;
    }

    /**
     * Set Socket.IO instance for real-time updates
     */
    setSocketIO(io) {
        this.io = io;
    }

    /**
     * Set dependencies
     */
    setDependencies(io, whatsappService) {
        this.io = io;
        groupForwardingService.setDependencies(io, whatsappService);
    }

    /**
     * Process a command message
     * @param {Object} params - { userId, panelId, message, senderNumber, platform, isGroup }
     * @returns {Object} - { success, responses[], summary }
     */
    async processCommand(params) {
        const { userId, panelId, panelIds, deviceId, message, senderNumber, platform = 'WHATSAPP', isGroup = false, isStaffOverride = false, groupJid } = params;

        // Build scope for per-device/per-panel settings
        const scope = {};
        if (deviceId) scope.deviceId = deviceId;
        if (panelId) scope.panelId = panelId;

        // Parse the command
        const parsed = commandParser.parse(message);

        if (!parsed.isValid) {
            return {
                success: false,
                error: parsed.error || 'Invalid command format',
                responses: []
            };
        }

        const { command, isUserCommand, argument, needsArgument } = parsed;

        // ==================== HANDLE USER COMMANDS (verify, account, ticket) ====================
        if (isUserCommand) {
            return await this.processUserCommand({
                userId,
                command,
                argument,
                needsArgument,
                senderNumber,
                platform,
                scope,  // Pass scope for per-device/panel checks
                // Pass ticket-specific params if present
                ticketNumber: parsed.ticketNumber,
                showList: parsed.showList
            });
        }

        // ==================== HANDLE ORDER COMMANDS ====================
        const { orderIds } = parsed;
        const responses = [];
        const summary = {
            total: orderIds.length,
            success: 0,
            failed: 0
        };

        // ==================== CHECK COMMAND PERMISSION ====================
        // Check if this command type is enabled in user's bot feature toggles
        // Staff override groups bypass command permission checks (Section 5)
        if (!isStaffOverride) {
            const isCommandAllowed = await botFeatureService.isCommandAllowed(userId, command, scope);
            if (!isCommandAllowed) {
                return {
                    success: false,
                    error: `❌ The "${command}" command is currently disabled. Please enable it in Bot Settings.`,
                    responses: []
                };
            }
        }

        // ==================== COLLECT FOR BATCH FORWARDING ====================
        // Track successful orders with their provider order IDs for batch forwarding
        const successfulOrders = [];

        // Determine bulk delay based on panel type (V1/Rental needs delay to avoid 429)
        let bulkDelayMs = 0;
        if (orderIds.length > 1) {
            try {
                const targetPanelIds = (panelIds && panelIds.length > 0) ? panelIds : (panelId ? [panelId] : []);
                if (targetPanelIds.length > 0) {
                    const firstPanel = await prisma.smmPanel.findUnique({
                        where: { id: targetPanelIds[0] },
                        select: { panelType: true }
                    });
                    const pType = (firstPanel?.panelType || '').toUpperCase();
                    if (pType === 'V1' || pType === 'RENTAL') {
                        bulkDelayMs = 5000; // 5s for V1/Rental to avoid rate limiting
                        console.log(`[CommandHandler] Bulk mode: V1/Rental panel detected, using ${bulkDelayMs}ms delay between orders`);
                    }
                }
            } catch (e) { /* non-critical */ }
        }

        // Process each order ID
        for (let i = 0; i < orderIds.length; i++) {
            const orderId = orderIds[i];

            // Add delay between orders for V1/Rental panels to prevent rate limiting (429)
            if (i > 0 && bulkDelayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, bulkDelayMs));
            }

            try {
                const result = await this.processOrderCommand({
                    userId,
                    panelId,
                    panelIds,   // Pass panelIds for multi-panel order lookup
                    deviceId,   // Pass deviceId for per-device settings
                    orderId,
                    command,
                    senderNumber,
                    platform,
                    isGroup,
                    groupJid,   // Pass groupJid for group-based ownership check
                    isStaffOverride,  // Staff Override Group bypass (Section 5)
                    skipIndividualForward: orderIds.length > 1
                });

                responses.push({
                    orderId,
                    success: result.success,
                    message: result.message,
                    details: result.details
                });

                if (result.success) {
                    summary.success++;
                    // Collect for batch forwarding
                    // Use providerOrderId if available, otherwise fallback to panel orderId
                    const forwardOrderId = result.details?.providerOrderId ||
                        result.details?.order?.providerOrderId ||
                        orderId;  // Fallback to panel order ID

                    successfulOrders.push({
                        panelOrderId: orderId,
                        providerOrderId: forwardOrderId,
                        providerName: result.details?.providerName || result.details?.order?.providerName,
                        panelId: result.details?.order?.panelId || panelId,
                        order: result.details?.order
                    });

                    console.log(`[CommandHandler] Collected for batch: panelId=${orderId}, forwardId=${forwardOrderId}, provider=${result.details?.providerName || 'unknown'}`);
                } else {
                    summary.failed++;
                }
            } catch (error) {
                console.error(`[CommandHandler] Error processing ${orderId}:`, error);
                responses.push({
                    orderId,
                    success: false,
                    message: `Error: ${error.message}`,
                    error: error.message
                });
                summary.failed++;
            }
        }

        // ==================== BATCH FORWARD TO PROVIDER GROUP ====================
        // Forward successful orders to provider support group (works for single and bulk orders)
        let batchForwardResult = null;
        if (successfulOrders.length > 0 && ['refill', 'cancel', 'speedup', 'speed_up'].includes(command.toLowerCase())) {
            try {
                batchForwardResult = await this.sendBatchForward({
                    userId,
                    command,
                    successfulOrders,
                    panelId
                });
                console.log(`[CommandHandler] Batch forward result:`, batchForwardResult);
            } catch (batchError) {
                console.error(`[CommandHandler] Batch forward failed:`, batchError.message);
            }
        }

        return {
            success: summary.failed === 0,
            command,
            responses,
            summary,
            formattedResponse: await this.formatResponses(command, responses, userId, scope, { isStaffOverride }),
            batchForward: batchForwardResult
        };
    }

    /**
     * Process a single order command
     */
    async processOrderCommand(params) {
        const { userId, panelId, panelIds, deviceId, orderId, command, senderNumber, platform = 'WHATSAPP', isGroup = false, groupJid, skipIndividualForward } = params;

        // Build order query - filter by panelId(s) if provided
        const whereClause = {
            externalOrderId: orderId,
            userId
        };

        // Multi-panel support: use panelIds array if available, fallback to single panelId
        const effectivePanelIds = (panelIds && panelIds.length > 0) ? panelIds : (panelId ? [panelId] : []);

        if (effectivePanelIds.length > 0) {
            whereClause.panelId = { in: effectivePanelIds };
            console.log(`[CommandHandler] Looking for order ${orderId} in ${effectivePanelIds.length} panel(s)`);
        } else {
            console.log(`[CommandHandler] Looking for order ${orderId} across all user panels (no panelId specified)`);
        }

        // Find the order - check by external order ID (from panel)
        let order = await prisma.order.findFirst({
            where: whereClause,
            include: {
                panel: {
                    select: {
                        id: true,
                        name: true,
                        alias: true,
                        url: true,
                        panelType: true,
                        apiKey: true,
                        adminApiBaseUrl: true,
                        supportsAdminApi: true,
                        adminApiKey: true
                    }
                }
            }
        });

        // ==================== AUTO-FETCH FROM PANEL API ====================
        // If order not found in database, try to fetch from Panel API
        if (!order) {
            console.log(`[CommandHandler] Order ${orderId} not in DB, attempting API fetch...`);

            // Get user's panels to search (multi-panel aware)
            const panelsToSearch = effectivePanelIds.length > 0
                ? await prisma.smmPanel.findMany({ where: { id: { in: effectivePanelIds } } })
                : await prisma.smmPanel.findMany({ where: { userId, isActive: true } });

            console.log(`[CommandHandler] Searching in ${panelsToSearch.filter(p => p).length} panels for order ${orderId}`);
            if (effectivePanelIds.length > 0) {
                console.log(`[CommandHandler] Using specific panelIds: ${effectivePanelIds.join(', ')}`);
            }

            for (const panel of panelsToSearch) {
                if (!panel) continue;
                console.log(`[CommandHandler] Querying panel: ${panel.alias || panel.name} (${panel.id})`);

                try {
                    let orderData = null;

                    // Try Admin API first if panel supports it (uses /adminapi/v2/orders/{id})
                    if (panel.supportsAdminApi && panel.adminApiKey) {
                        console.log(`[CommandHandler] Trying Admin API for order ${orderId}...`);
                        const adminResult = await adminApiService.getOrderStatus(panel, orderId);
                        if (adminResult.success) {
                            orderData = adminResult;
                            console.log(`[CommandHandler] Admin API succeeded for order ${orderId}`);
                        } else {
                            console.log(`[CommandHandler] Admin API failed: ${adminResult.error}`);
                        }
                    }

                    // Fallback to User API if Admin API failed or not supported
                    if (!orderData) {
                        console.log(`[CommandHandler] Trying User API for order ${orderId}...`);
                        const smmPanelService = require('./smmPanel');
                        try {
                            const userApiResult = await smmPanelService.getOrderStatus(panel.id, orderId);
                            if (userApiResult && userApiResult.status) {
                                orderData = userApiResult;
                                console.log(`[CommandHandler] User API succeeded for order ${orderId}`);
                            }
                        } catch (userApiErr) {
                            console.log(`[CommandHandler] User API failed: ${userApiErr.message}`);

                            // User API failed — retry with direct /api/v2 call
                            // The panel may have a custom endpointOrderStatus pointing to admin API
                            console.log(`[CommandHandler] Retrying with direct /api/v2 URL...`);
                            try {
                                const axios = require('axios');
                                const { decrypt } = require('../utils/encryption');
                                // Get base domain from panel URL, strip any API paths
                                const cleanUrl = (panel.url || '').replace(/\/$/, '').replace(/\/(?:admin)?api\/v[12].*$/, '').replace(/\/api$/, '');
                                const apiKey = decrypt(panel.apiKey);
                                const userApiUrl = `${cleanUrl}/api/v2`;

                                console.log(`[CommandHandler] Retry URL: ${userApiUrl}`);
                                const retryRes = await axios.post(userApiUrl, new URLSearchParams({
                                    key: apiKey,
                                    action: 'status',
                                    order: orderId
                                }), { timeout: 30000 });

                                const retryData = retryRes.data;
                                console.log(`[CommandHandler] Retry response:`, typeof retryData === 'object' ? JSON.stringify(retryData).substring(0, 200) : retryData);

                                if (retryData && retryData.status && !retryData.error) {
                                    orderData = {
                                        status: retryData.status,
                                        charge: retryData.charge ? parseFloat(retryData.charge) : null,
                                        startCount: retryData.start_count ? parseInt(retryData.start_count) : null,
                                        remains: retryData.remains !== undefined ? parseInt(retryData.remains) : null,
                                        customerUsername: null, // User API doesn't return username
                                        providerName: null,
                                        providerOrderId: null
                                    };
                                    console.log(`[CommandHandler] Retry User API succeeded for order ${orderId}: status=${retryData.status}`);
                                } else if (retryData?.error) {
                                    console.log(`[CommandHandler] Retry User API error: ${retryData.error}`);
                                }
                            } catch (retryErr) {
                                console.log(`[CommandHandler] Retry User API failed: ${retryErr.message}`);
                            }
                        }
                    }

                    if (orderData && orderData.status) {
                        console.log(`[CommandHandler] Order ${orderId} found in panel ${panel.alias}, creating local record...`);
                        console.log(`[CommandHandler] Order data: status=${orderData.status}, serviceName="${orderData.serviceName}", provider="${orderData.providerName}", providerOrderId="${orderData.providerOrderId}"`);

                        // Normalize status
                        const smmPanelService = require('./smmPanel');
                        const normalizedStatus = orderData.success !== undefined
                            ? orderData.status  // Already normalized from Admin API
                            : smmPanelService.mapStatus(orderData.status);

                        // Prepare create data - include provider fields for auto-forwarding
                        const createData = {
                            externalOrderId: orderId,
                            panelId: panel.id,
                            userId,
                            status: normalizedStatus,
                            charge: orderData.charge,
                            startCount: orderData.startCount,
                            remains: orderData.remains,
                            serviceName: orderData.serviceName,
                            link: orderData.link,
                            // Customer info - CRITICAL for User Mapping validation
                            customerUsername: orderData.customerUsername || null,
                            // Provider info from Admin API - critical for auto-forwarding
                            providerName: orderData.providerName || null,
                            providerOrderId: orderData.providerOrderId || null,
                            providerStatus: orderData.providerStatus || null,
                            providerSyncedAt: orderData.providerName ? new Date() : null,
                            // Available actions from Admin API (null = unknown, triggers guarantee check)
                            canRefill: orderData.canRefill ?? null,
                            canCancel: orderData.canCancel ?? null,
                            actionsUpdatedAt: new Date()
                        };

                        // Set completedAt if order is already COMPLETED
                        if (normalizedStatus === 'COMPLETED') {
                            createData.completedAt = new Date();
                        }

                        // Create order record in database
                        order = await prisma.order.create({
                            data: createData,
                            include: {
                                panel: {
                                    select: {
                                        id: true,
                                        name: true,
                                        alias: true,
                                        url: true,
                                        panelType: true,
                                        apiKey: true,
                                        adminApiBaseUrl: true,
                                        supportsAdminApi: true,
                                        adminApiKey: true
                                    }
                                }
                            }
                        });

                        console.log(`[CommandHandler] Order ${orderId} created from API response (status: ${normalizedStatus}, serviceName: "${order.serviceName}")`);
                        break; // Found it, stop searching
                    }
                } catch (apiError) {
                    console.log(`[CommandHandler] Panel ${panel.alias} API error for order ${orderId}:`, apiError.message);
                    // Continue to next panel
                }
            }
        }

        // If still not found after API fetch attempts
        if (!order) {
            const panelInfo = panelId ? ` in the assigned panel` : '';
            console.log(`[CommandHandler] Order ${orderId} not found${panelInfo} (neither in DB nor via API)`);
            return {
                success: false,
                message: securityService.sanitizeErrorMessage('not_found', 'order'),
                details: { reason: 'not_found', panelId }
            };
        }

        // ==================== REFRESH STATUS FROM API ====================
        // Always refresh status from Panel API to ensure we have latest data
        // This is important because order status can change in panel
        try {
            console.log(`[CommandHandler] Refreshing status for order ${orderId} from API...`);

            let latestStatus = null;

            // Try Admin API first if available
            if (order.panel?.supportsAdminApi && order.panel?.adminApiKey) {
                const adminResult = await adminApiService.getOrderStatus(order.panel, orderId);
                if (adminResult.success) {
                    latestStatus = adminResult;
                    console.log(`[CommandHandler] Got latest status from Admin API: ${latestStatus.status}`);
                }
            }

            // Fallback to User API
            if (!latestStatus) {
                const smmPanelService = require('./smmPanel');
                try {
                    const userApiResult = await smmPanelService.getOrderStatus(order.panelId, orderId);
                    if (userApiResult && userApiResult.status) {
                        latestStatus = {
                            status: smmPanelService.mapStatus(userApiResult.status),
                            startCount: userApiResult.startCount,
                            remains: userApiResult.remains,
                            charge: userApiResult.charge
                        };
                        console.log(`[CommandHandler] Got latest status from User API: ${latestStatus.status}`);
                    }
                } catch (e) {
                    // User API failed, use DB status
                }
            }

            // Update order with latest status if we got it
            if (latestStatus && latestStatus.status && latestStatus.status !== order.status) {
                console.log(`[CommandHandler] Updating order ${orderId} status: ${order.status} -> ${latestStatus.status}`);

                // Set completedAt if status is now COMPLETED
                const updateData = {
                    status: latestStatus.status,
                    startCount: latestStatus.startCount ?? order.startCount,
                    remains: latestStatus.remains ?? order.remains,
                    charge: latestStatus.charge ?? order.charge,
                    serviceName: latestStatus.serviceName || order.serviceName,
                    link: latestStatus.link || order.link,
                    // Update provider info if available (for auto-forwarding)
                    providerName: latestStatus.providerName || order.providerName,
                    providerOrderId: latestStatus.providerOrderId || order.providerOrderId,
                    providerStatus: latestStatus.providerStatus || order.providerStatus,
                    providerSyncedAt: latestStatus.providerName ? new Date() : order.providerSyncedAt,
                    // Update available actions
                    canRefill: latestStatus.canRefill ?? order.canRefill,
                    canCancel: latestStatus.canCancel ?? order.canCancel,
                    actionsUpdatedAt: new Date()
                };

                // Set completedAt when order becomes COMPLETED for the first time
                if (latestStatus.status === 'COMPLETED' && !order.completedAt) {
                    updateData.completedAt = new Date();
                }

                order = await prisma.order.update({
                    where: { id: order.id },
                    data: updateData,
                    include: {
                        panel: {
                            select: {
                                id: true,
                                name: true,
                                alias: true,
                                url: true,
                                panelType: true,
                                apiKey: true,
                                adminApiBaseUrl: true,
                                supportsAdminApi: true,
                                adminApiKey: true
                            }
                        }
                    }
                });

                console.log(`[CommandHandler] Order ${orderId} updated - serviceName: "${order.serviceName}", completedAt: ${order.completedAt}`);
            }
        } catch (refreshError) {
            console.log(`[CommandHandler] Status refresh failed (using cached):`, refreshError.message);
            // Continue with existing status
        }


        // ==================== SECURITY CHECKS ====================
        const securityCheck = await securityService.performSecurityChecks({
            order,
            senderNumber,
            isGroup,
            groupJid,
            userId,
            command,
            panelId,
            isStaffOverride: params.isStaffOverride || false  // Staff Override Group bypass (Section 5)
        });

        if (!securityCheck.allowed) {
            // Check if registration is needed (WA number not in mapping)
            if (securityCheck.needsRegistration) {
                console.log(`[CommandHandler] Registration needed for ${senderNumber}`);
                return {
                    success: false,
                    message: securityCheck.message,
                    details: { reason: 'needs_registration' }
                };
            }

            // Check if username verification is needed
            if (securityCheck.needsUsernameVerification) {
                // Start username verification flow
                const conversationStateService = require('./conversationStateService');

                const verificationResult = await conversationStateService.startUsernameVerification({
                    senderPhone: senderNumber,
                    userId,
                    platform,
                    orderId,
                    command,
                    orderUsername: securityCheck.orderUsername
                });

                console.log(`[CommandHandler] Username verification started for order ${orderId}`);

                return {
                    success: false,
                    message: verificationResult.message,
                    details: {
                        reason: 'username_verification_required',
                        pendingConversation: true
                    }
                };
            }

            return {
                success: false,
                message: securityCheck.message,
                details: { reason: 'security_check_failed' }
            };
        }

        // Auto-claim if needed (first-claim in DM with auto mode)
        if (securityCheck.shouldClaim) {
            await securityService.claimOrder(order, senderNumber);
            console.log(`[CommandHandler] Order ${orderId} auto-claimed by ${senderNumber}`);
        }

        // Store settings for later use
        const userSettings = securityCheck.settings;


        // ==================== FETCH PROVIDER INFO VIA ADMIN API ====================
        // Try to get provider info if panel supports Admin API and we don't have it yet
        if (order.panel.supportsAdminApi && !order.providerOrderId) {
            try {
                console.log(`[CommandHandler] Fetching provider info for order ${orderId}`);

                const providerResult = await adminApiService.getOrderWithProvider(
                    order.panel,
                    order.externalOrderId
                );

                if (providerResult.success && providerResult.data) {
                    const providerData = providerResult.data;

                    // Update order in database with provider info ONLY
                    // DO NOT overwrite status here - status is already set correctly!
                    order = await prisma.order.update({
                        where: { id: order.id },
                        data: {
                            providerName: providerData.providerName || order.providerName,
                            providerOrderId: providerData.providerOrderId || order.providerOrderId,
                            providerStatus: providerData.providerStatus || order.providerStatus,
                            providerCharge: providerData.providerCharge || order.providerCharge,
                            providerSyncedAt: new Date(),
                            // Only update optional fields if missing
                            serviceName: order.serviceName || providerData.serviceName,
                            customerUsername: order.customerUsername || providerData.customerUsername,
                            customerEmail: order.customerEmail || providerData.customerEmail
                            // NOTE: Do NOT update 'status' here - it causes the PENDING bug!
                        },
                        include: {
                            panel: {
                                select: {
                                    id: true,
                                    name: true,
                                    alias: true,
                                    url: true,
                                    panelType: true,
                                    apiKey: true,
                                    adminApiBaseUrl: true,
                                    supportsAdminApi: true,
                                    adminApiKey: true
                                }
                            }
                        }
                    });

                    console.log(`[CommandHandler] Provider info synced: ${order.providerName} - ${order.providerOrderId} (status preserved: ${order.status})`);
                }
            } catch (providerError) {
                // Log but don't fail the command
                console.log(`[CommandHandler] Failed to fetch provider info:`, providerError.message);
            }
        }

        // Execute command based on type
        let result;
        switch (command) {
            case 'refill':
                result = await this.handleRefill(order, orderId, senderNumber, userSettings, deviceId, skipIndividualForward);
                break;
            case 'cancel':
                result = await this.handleCancel(order, orderId, senderNumber, userSettings, deviceId, skipIndividualForward);
                break;
            case 'speedup':
                result = await this.handleSpeedUp(order, orderId, senderNumber, userSettings, deviceId, skipIndividualForward);
                break;
            case 'status':
                result = await this.handleStatus(order, orderId, userSettings, { deviceId });
                break;
            default:
                return {
                    success: false,
                    message: `Unknown command: ${command}`,
                    details: { reason: 'unknown_command' }
                };
        }


        // Create cooldown after successful command (except status which is read-only)
        if (result.success && command !== 'status') {
            try {
                await securityService.createCommandCooldown(
                    order.id,
                    command,
                    senderNumber,
                    userId,
                    userSettings.commandCooldownSecs
                );
            } catch (cooldownError) {
                console.log(`[CommandHandler] Failed to create cooldown:`, cooldownError.message);
            }
        }

        return result;
    }

    /**
     * Handle refill command
     */
    async handleRefill(order, orderId, senderNumber, userSettings, deviceId, skipIndividualForward = false) {
        // Check action mode
        const actionMode = userSettings?.refillActionMode || 'forward';

        if (actionMode === 'disabled') {
            return {
                success: false,
                message: '❌ Refill command is disabled. Please contact admin.',
                details: { reason: 'disabled' }
            };
        }

        console.log(`[CommandHandler] Refill check for order ${orderId}: status="${order.status}" (expected: "COMPLETED" or "PARTIAL")`);

        // Refill only for completed or partial orders
        if (order.status !== 'COMPLETED' && order.status !== 'PARTIAL') {
            // Use customizable template from Response Templates page
            let statusMsg = `❌ Order #${orderId}: Your order is ${order.status.toLowerCase()}.`;
            try {
                const responseTemplateService = require('./responseTemplateService');
                const tpl = await responseTemplateService.getResponse(order.userId, 'REFILL_STATUS_INVALID', {
                    order_id: orderId,
                    status: order.status.toLowerCase()
                });
                if (tpl) statusMsg = tpl;
            } catch (e) { /* use fallback */ }
            return {
                success: false,
                message: statusMsg,
                details: { reason: 'status', status: order.status }
            };
        }

        // ==================== PANEL API REFILL CHECK ====================
        // First, check if panel Admin API explicitly tells us refill is available
        // This takes priority over local pattern-based guarantee check
        let panelRefillAvailable = order.canRefill;

        // If we don't have canRefill info cached, try to fetch from panel
        if (panelRefillAvailable === null || panelRefillAvailable === undefined) {
            if (order.panel?.supportsAdminApi && order.panel?.adminApiKey) {
                try {
                    console.log(`[CommandHandler] Checking refill availability from Panel API for order ${orderId}...`);
                    const statusResult = await adminApiService.getOrderStatus(order.panel, orderId);
                    if (statusResult.success) {
                        panelRefillAvailable = statusResult.canRefill;
                        console.log(`[CommandHandler] Panel API canRefill: ${panelRefillAvailable}`);

                        // Update the order record with this info
                        await prisma.order.update({
                            where: { id: order.id },
                            data: {
                                canRefill: panelRefillAvailable,
                                actionsUpdatedAt: new Date()
                            }
                        });
                    }
                } catch (apiError) {
                    console.log(`[CommandHandler] Failed to check refill from Panel API: ${apiError.message}`);
                }
            }
        }

        // If Panel API explicitly says refill is NOT available (technically impossible)
        if (panelRefillAvailable === false) {
            console.log(`[CommandHandler] Panel API says refill is NOT available for order ${orderId}`);
            return {
                success: false,
                message: `❌ Order ${orderId}: Refill is not available according to panel. The refill period may have expired.`,
                details: { reason: 'panel_refill_not_available' }
            };
        }

        // ==================== GUARANTEE VALIDATION ====================
        // ALWAYS run guarantee check regardless of panel API canRefill value
        // Panel API only tells us if the refill BUTTON exists, not if the guarantee period is still valid
        try {
            const guaranteeService = require('./guaranteeService');

            console.log(`[CommandHandler] Checking local guarantee for order ${orderId}:`);
            console.log(`  - Service Name: "${order.serviceName}"`);
            console.log(`  - Completed At: ${order.completedAt}`);
            console.log(`  - Panel canRefill: ${panelRefillAvailable}`);

            const guaranteeCheck = await guaranteeService.checkGuarantee(order, order.userId);

            if (!guaranteeCheck.valid) {
                console.log(`[CommandHandler] Guarantee check FAILED for order ${orderId}: ${guaranteeCheck.reason}`);

                // Format message based on reason
                let message;
                if (guaranteeCheck.reason === 'NO_GUARANTEE') {
                    message = `❌ Order ${orderId}: This is not possible to refill. This is a no-refill, no-support service.`;
                } else if (guaranteeCheck.reason === 'EXPIRED') {
                    message = `❌ Order ${orderId}: Refill period has expired.`;
                } else {
                    message = guaranteeService.formatGuaranteeMessage(guaranteeCheck, order);
                }

                return {
                    success: false,
                    message,
                    details: {
                        reason: 'guarantee_failed',
                        guaranteeReason: guaranteeCheck.reason,
                        ...guaranteeCheck.details
                    }
                };
            }

            console.log(`[CommandHandler] Guarantee check PASSED for order ${orderId}: ${guaranteeCheck.reason}`);
        } catch (guaranteeError) {
            // Log but don't fail the command if guarantee service has issues
            console.error('[CommandHandler] Guarantee validation error:', guaranteeError.message);
        }

        try {
            // Create command record
            const commandRecord = await prisma.orderCommand.create({
                data: {
                    orderId: order.id,
                    command: 'REFILL',
                    status: 'PROCESSING',
                    requestedBy: senderNumber || 'bot'
                }
            });

            let apiResult = null;
            let forwardResult = null;

            // Execute based on action mode
            // "auto" = API only, "forward" = forward only, "both" = API + forward
            if (actionMode === 'auto' || actionMode === 'both') {
                // Send refill request to panel Admin API
                try {
                    const _refillStart = Date.now();
                    apiResult = await adminApiService.createRefill(order.panel, order.externalOrderId);
                    // Log API action
                    try {
                        const apiActionLogService = require('./apiActionLogService');
                        await apiActionLogService.log({
                            userId: order.userId, orderId: order.id, panelId: order.panelId,
                            action: 'REFILL', provider: order.providerName,
                            requestData: { orderId: order.externalOrderId },
                            responseData: apiResult, success: apiResult?.success || false,
                            errorMessage: apiResult?.error || null, duration: Date.now() - _refillStart
                        });
                    } catch (logErr) { /* logging failure must not break flow */ }
                } catch (apiError) {
                    console.log(`[CommandHandler] API refill failed:`, apiError.message);
                    // If mode is 'auto' only and API fails, return error
                    if (actionMode === 'auto') {
                        throw apiError;
                    }
                    // If 'both', continue with forwarding even if API fails
                }
            }

            if (!skipIndividualForward && (actionMode === 'forward' || actionMode === 'both' || actionMode === 'auto')) {
                // Forward to provider group with PROVIDER Order ID
                try {
                    forwardResult = await groupForwardingService.forwardToProvider({
                        order: order,
                        command: 'REFILL',
                        userId: order.userId,
                        providerOrderId: order.providerOrderId,
                        providerName: order.providerName,
                        deviceId: deviceId
                    });
                } catch (fwdError) {
                    console.log(`[CommandHandler] Group forwarding failed:`, fwdError.message);
                }
            }

            // Update command status
            await prisma.orderCommand.update({
                where: { id: commandRecord.id },
                data: {
                    status: 'SUCCESS',
                    response: JSON.stringify({ apiResult, forwardResult, actionMode }),
                    processedAt: new Date()
                }
            });

            // Build response message based on mode
            let message;
            if (actionMode === 'auto') {
                message = `✅ Refill submitted via API for Order #${orderId}${forwardResult?.success ? ` and forwarded to ${forwardResult.groupName || 'provider'}` : ''}`;
            } else if (actionMode === 'forward') {
                message = forwardResult?.success
                    ? `✅ Refill request forwarded to ${forwardResult.groupName || 'provider'}`
                    : `⚠️ Refill request queued for Order #${orderId}`;
            } else { // both
                message = `✅ Refill submitted${apiResult ? ' via API' : ''}${forwardResult?.success ? ` and forwarded to ${forwardResult.groupName}` : ''}`;
            }

            return {
                success: true,
                message: message,
                details: {
                    refillId: apiResult?.refillId,
                    panelAlias: order.panel?.alias,
                    providerOrderId: order.providerOrderId,
                    providerName: order.providerName,
                    actionMode,
                    forwarded: forwardResult?.success,
                    order: {
                        id: order.id,
                        panelId: order.panelId,
                        providerOrderId: order.providerOrderId,
                        providerName: order.providerName
                    }
                }
            };
        } catch (error) {
            // Log error
            await prisma.orderCommand.updateMany({
                where: { orderId: order.id, status: 'PROCESSING' },
                data: {
                    status: 'FAILED',
                    error: error.message,
                    processedAt: new Date()
                }
            });

            return {
                success: false,
                message: commandParser.generateResponse('refill', orderId, false, {
                    reason: 'api',
                    error: error.message
                }),
                details: { error: error.message }
            };
        }
    }


    /**
     * Handle cancel command
     */
    async handleCancel(order, orderId, senderNumber, userSettings, deviceId, skipIndividualForward = false) {
        // Check action mode
        const actionMode = userSettings?.cancelActionMode || 'forward';

        if (actionMode === 'disabled') {
            return {
                success: false,
                message: '❌ Cancel command is disabled. Please contact admin.',
                details: { reason: 'disabled' }
            };
        }

        // Cannot cancel completed, already cancelled, refunded, or partial orders
        if (['COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIAL'].includes(order.status)) {
            // Use customizable template from Response Templates page
            let statusMsg = `❌ Order #${orderId}: Your order is ${order.status.toLowerCase()}.`;
            try {
                const responseTemplateService = require('./responseTemplateService');
                const tpl = await responseTemplateService.getResponse(order.userId, 'CANCEL_STATUS_INVALID', {
                    order_id: orderId,
                    status: order.status.toLowerCase()
                });
                if (tpl) statusMsg = tpl;
            } catch (e) { /* use fallback */ }
            return {
                success: false,
                message: statusMsg,
                details: { reason: 'status', status: order.status }
            };
        }

        // ==================== PANEL API CANCEL CHECK ====================
        // Check if panel Admin API explicitly tells us cancel is available
        let panelCancelAvailable = order.canCancel;

        // If we don't have canCancel info cached, try to fetch from panel
        if (panelCancelAvailable === null || panelCancelAvailable === undefined) {
            if (order.panel?.supportsAdminApi && order.panel?.adminApiKey) {
                try {
                    console.log(`[CommandHandler] Checking cancel availability from Panel API for order ${orderId}...`);
                    const statusResult = await adminApiService.getOrderStatus(order.panel, orderId);
                    if (statusResult.success) {
                        panelCancelAvailable = statusResult.canCancel;
                        console.log(`[CommandHandler] Panel API canCancel: ${panelCancelAvailable}`);

                        // Update the order record with this info
                        await prisma.order.update({
                            where: { id: order.id },
                            data: {
                                canCancel: panelCancelAvailable,
                                actionsUpdatedAt: new Date()
                            }
                        });
                    }
                } catch (apiError) {
                    console.log(`[CommandHandler] Failed to check cancel from Panel API: ${apiError.message}`);
                }
            }
        }

        // If Panel API explicitly says cancel is NOT available
        if (panelCancelAvailable === false) {
            console.log(`[CommandHandler] Panel API says cancel is NOT available for order ${orderId}`);
            return {
                success: false,
                message: `❌ Order ${orderId}: Cancel is not available according to panel. Order may be in progress or already processed.`,
                details: { reason: 'panel_cancel_not_available' }
            };
        }

        // Log if panel confirms cancel is available
        if (panelCancelAvailable === true) {
            console.log(`[CommandHandler] Panel API confirms cancel is available for order ${orderId}`);
        }


        try {
            // Create command record
            const commandRecord = await prisma.orderCommand.create({
                data: {
                    orderId: order.id,
                    command: 'CANCEL',
                    status: 'PROCESSING',
                    requestedBy: senderNumber || 'bot'
                }
            });

            let apiResult = null;
            let forwardResult = null;

            // Execute based on action mode
            if (actionMode === 'auto' || actionMode === 'both') {
                // Send cancel request to panel Admin API
                try {
                    const _cancelStart = Date.now();
                    apiResult = await adminApiService.createCancel(order.panel, order.externalOrderId);
                    // Log API action
                    try {
                        const apiActionLogService = require('./apiActionLogService');
                        await apiActionLogService.log({
                            userId: order.userId, orderId: order.id, panelId: order.panelId,
                            action: 'CANCEL', provider: order.providerName,
                            requestData: { orderId: order.externalOrderId },
                            responseData: apiResult, success: apiResult?.success || false,
                            errorMessage: apiResult?.error || null, duration: Date.now() - _cancelStart
                        });
                    } catch (logErr) { /* logging failure must not break flow */ }

                    // Update order status if API succeeded
                    await prisma.order.update({
                        where: { id: order.id },
                        data: { status: 'CANCELLED' }
                    });
                } catch (apiError) {
                    console.log(`[CommandHandler] API cancel failed:`, apiError.message);
                    if (actionMode === 'auto') {
                        throw apiError;
                    }
                }
            }

            if (!skipIndividualForward && (actionMode === 'forward' || actionMode === 'both' || actionMode === 'auto')) {
                // Forward to provider group
                try {
                    forwardResult = await groupForwardingService.forwardToProvider({
                        order: order,
                        command: 'CANCEL',
                        userId: order.userId,
                        providerOrderId: order.providerOrderId,
                        providerName: order.providerName,
                        deviceId: deviceId
                    });
                } catch (fwdError) {
                    console.log(`[CommandHandler] Group forwarding failed:`, fwdError.message);
                }
            }

            // Update command status
            await prisma.orderCommand.update({
                where: { id: commandRecord.id },
                data: {
                    status: 'SUCCESS',
                    response: JSON.stringify({ apiResult, forwardResult, actionMode }),
                    processedAt: new Date()
                }
            });

            // Build response message based on mode
            let message;
            if (actionMode === 'auto') {
                message = `✅ Cancel submitted via API for Order #${orderId}${forwardResult?.success ? ` and forwarded to ${forwardResult.groupName || 'provider'}` : ''}`;
            } else if (actionMode === 'forward') {
                message = forwardResult?.success
                    ? `✅ Cancel request forwarded to ${forwardResult.groupName || 'provider'}`
                    : `⚠️ Cancel request queued for Order #${orderId}`;
            } else { // both
                message = `✅ Cancel submitted${apiResult ? ' via API' : ''}${forwardResult?.success ? ` and forwarded to ${forwardResult.groupName}` : ''}`;
            }

            return {
                success: true,
                message: message,
                details: {
                    panelAlias: order.panel?.alias,
                    providerOrderId: order.providerOrderId,
                    providerName: order.providerName,
                    actionMode,
                    forwarded: forwardResult?.success,
                    order: {
                        id: order.id,
                        panelId: order.panelId,
                        providerOrderId: order.providerOrderId,
                        providerName: order.providerName
                    }
                }
            };
        } catch (error) {
            return {
                success: false,
                message: commandParser.generateResponse('cancel', orderId, false, {
                    reason: 'api',
                    error: error.message
                }),
                details: { error: error.message }
            };
        }
    }


    /**
     * Handle speed-up command
     */
    async handleSpeedUp(order, orderId, senderNumber, userSettings, deviceId, skipIndividualForward = false) {
        // Check action mode
        const actionMode = userSettings?.speedupActionMode || 'forward';

        if (actionMode === 'disabled') {
            return {
                success: false,
                message: '❌ Speed-up command is disabled. Please contact admin.',
                details: { reason: 'disabled' }
            };
        }

        // Speed-up only for pending/in-progress orders
        if (!['PENDING', 'IN_PROGRESS', 'PROCESSING'].includes(order.status)) {
            return {
                success: false,
                message: commandParser.generateResponse('speedup', orderId, false, {
                    reason: 'status',
                    status: order.status
                }),
                details: { reason: 'status', status: order.status }
            };
        }

        // Create command record
        const commandRecord = await prisma.orderCommand.create({
            data: {
                orderId: order.id,
                command: 'SPEED_UP',
                status: 'PROCESSING',
                requestedBy: senderNumber || 'bot'
            }
        });

        let forwardResult = null;

        // Speed-up is usually forward-only (no API endpoint for speedup)
        // But we support all modes for consistency
        if (!skipIndividualForward && (actionMode === 'forward' || actionMode === 'both' || actionMode === 'auto')) {
            try {
                forwardResult = await groupForwardingService.forwardToProvider({
                    order: order,
                    command: 'SPEED_UP',
                    userId: order.userId,
                    providerOrderId: order.providerOrderId,
                    providerName: order.providerName,
                    deviceId: deviceId
                });
            } catch (fwdError) {
                console.log(`[CommandHandler] Group forwarding failed:`, fwdError.message);
            }
        }

        // Update command status
        await prisma.orderCommand.update({
            where: { id: commandRecord.id },
            data: {
                status: 'SUCCESS',
                response: JSON.stringify({ forwardResult, actionMode }),
                processedAt: new Date()
            }
        });

        const message = forwardResult?.success
            ? `⚡ Speed-up request forwarded to ${forwardResult.groupName || 'provider'}`
            : `⚡ Speed-up request queued for Order #${orderId}`;

        return {
            success: true,
            message: message,
            details: {
                panelAlias: order.panel?.alias,
                providerOrderId: order.providerOrderId,
                providerName: order.providerName,
                actionMode,
                forwarded: forwardResult?.success,
                order: {
                    id: order.id,
                    panelId: order.panelId,
                    providerOrderId: order.providerOrderId,
                    providerName: order.providerName
                }
            }
        };
    }


    /**
     * Handle status command
     */
    async handleStatus(order, orderId, userSettings = {}, scope = {}) {
        try {
            // Get fresh status from panel Admin API
            const status = await adminApiService.getOrderStatus(order.panel, order.externalOrderId);

            // Update order with new status and action availability
            const newStatus = status.status || 'PENDING';
            const updatedOrder = await prisma.order.update({
                where: { id: order.id },
                data: {
                    status: newStatus,
                    startCount: status.startCount ? parseInt(status.startCount) : order.startCount,
                    remains: status.remains ? parseInt(status.remains) : order.remains,
                    lastCheckedAt: new Date(),
                    // Update action availability from panel
                    canRefill: status.canRefill ?? order.canRefill,
                    canCancel: status.canCancel ?? order.canCancel,
                    actionsUpdatedAt: new Date()
                }
            });

            // Use updated values for display
            order = { ...order, ...updatedOrder };

            // Build template variables
            const templateVars = {
                orderId: orderId,
                status: status.status,
                statusEmoji: commandTemplateService.getStatusEmoji(status.status),
                serviceName: order.serviceName || 'Unknown Service',
                link: order.link || '-',
                quantity: order.quantity?.toString() || '-',
                startCount: status.startCount?.toString() || order.startCount?.toString() || '-',
                delivered: order.quantity && order.remains
                    ? (order.quantity - parseInt(status.remains || order.remains)).toString()
                    : '-',
                remains: status.remains?.toString() || order.remains?.toString() || '0',
                charge: order.charge ? `$${order.charge.toFixed(2)}` : '-',
                panelAlias: order.panel?.alias || 'Panel',
                providerName: order.providerName || '-',
                providerOrderId: order.providerOrderId || '-',
                customerUsername: order.customerUsername || '-',
                date: order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '-',
                // Refill/Cancel availability
                canRefill: order.canRefill ? '✅ Available' : '❌ Not Available',
                canCancel: order.canCancel ? '✅ Available' : '❌ Not Available'
            };


            // Choose template based on user settings
            // Use STATUS_DETAILED if showDetailedStatus is enabled
            const templateName = userSettings.showDetailedStatus ? 'STATUS_DETAILED' : 'STATUS';

            // Get formatted response using appropriate template
            const message = await commandTemplateService.getFormattedResponse(
                order.userId,
                templateName,
                templateVars,
                { deviceId: scope.deviceId, panelId: order.panelId }
            );

            // Build response details
            const details = {
                status: status.status,
                startCount: status.startCount,
                remains: status.remains,
                panelAlias: order.panel?.alias
            };

            // Add provider info if enabled (for detailed mode or showProviderInResponse)
            if ((userSettings.showDetailedStatus || userSettings.showProviderInResponse) && order.providerName) {
                details.providerName = order.providerName;
                details.providerOrderId = order.providerOrderId;
            }


            return {
                success: true,
                message: message,
                details
            };
        } catch (error) {
            // Use error template
            const errorMessage = await commandTemplateService.getFormattedResponse(
                order.userId,
                'ERROR_GENERIC',
                { orderId, errorMessage: 'Failed to fetch order status' },
                { deviceId: scope.deviceId, panelId: order.panelId }
            );

            return {
                success: false,
                message: errorMessage,
                details: { error: 'Status check failed' }
            };
        }
    }

    /**
     * Format all responses into a single message
     */
    async formatResponses(command, responses, userId = null, scope = {}, options = {}) {
        const { isStaffOverride = false } = options;
        if (responses.length === 0) {
            return 'No orders processed.';
        }

        if (responses.length === 1) {
            return responses[0].message;
        }

        // Multiple orders - group by success/failure
        const successful = responses.filter(r => r.success);
        const failed = responses.filter(r => !r.success);

        // Check for user's custom mass reply template
        let customTemplate = null;
        if (userId) {
            try {
                const toggles = await botFeatureService.getToggles(userId, scope);
                // Use support-side template if from staff override group, otherwise use regular mass reply template
                customTemplate = isStaffOverride
                    ? (toggles?.massSupportReplyTemplate || toggles?.massCommandReplyTemplate)
                    : toggles?.massCommandReplyTemplate;
            } catch (err) {
                console.error('[CommandHandler] Failed to get mass reply template:', err.message);
            }
        }

        if (customTemplate) {
            // Build results text
            let resultsText = '';
            if (successful.length > 0) {
                resultsText += `✅ Successful (${successful.length}):\n`;
                for (const r of successful.slice(0, 20)) {
                    resultsText += `• ${r.orderId}\n`;
                }
                if (successful.length > 20) resultsText += `... and ${successful.length - 20} more\n`;
            }
            if (failed.length > 0) {
                if (resultsText) resultsText += '\n';
                resultsText += `❌ Failed (${failed.length}):\n`;
                for (const r of failed.slice(0, 10)) {
                    resultsText += `• ${r.orderId}: ${r.details?.error || r.details?.reason || 'Error'}\n`;
                }
                if (failed.length > 10) resultsText += `... and ${failed.length - 10} more\n`;
            }

            return customTemplate
                .replace(/\{command\}/g, commandParser.getDisplayCommand(command))
                .replace(/\{total\}/g, responses.length.toString())
                .replace(/\{success_count\}/g, successful.length.toString())
                .replace(/\{failed_count\}/g, failed.length.toString())
                .replace(/\{results\}/g, resultsText.trim());
        }

        // Default format: Group by category using customizable templates
        const commandDisplay = commandParser.getDisplayCommand(command);
        const responseTemplateService = require('./responseTemplateService');

        // Helper: get template text or fallback
        const getLabel = async (key, vars = {}) => {
            if (userId) {
                try {
                    const tpl = await responseTemplateService.getResponse(userId, key, vars);
                    if (tpl) return tpl;
                } catch (e) { /* fallback */ }
            }
            // Fallback: use default from service
            const def = responseTemplateService.defaultTemplates[key];
            if (def) return responseTemplateService.formatTemplate(def.template, vars);
            return null;
        };

        // Categorize responses by specific status
        const queued = [];              // Successfully processed
        const alreadyCancelled = [];    // Status: CANCELLED
        const alreadyCompleted = [];    // Status: COMPLETED (for cancel/speedup)
        const partialRefund = [];       // Status: PARTIAL
        const guaranteeExpired = [];    // Guarantee period expired
        const noGuarantee = [];         // No refill / no guarantee service
        const cooldown = [];            // Cooldown / already in progress
        const notFound = [];            // not_found or security_check_failed
        const otherFailed = [];         // other errors

        for (const r of responses) {
            if (r.success) {
                queued.push(r);
            } else {
                const reason = r.details?.reason || '';
                const status = r.details?.status || '';
                const gReason = r.details?.guaranteeReason || '';

                if (reason === 'not_found' || reason === 'security_check_failed' || reason === 'needs_registration') {
                    notFound.push(r);
                } else if (reason === 'status' && status === 'CANCELLED') {
                    alreadyCancelled.push(r);
                } else if (reason === 'status' && status === 'COMPLETED') {
                    alreadyCompleted.push(r);
                } else if (reason === 'status' && status === 'PARTIAL') {
                    partialRefund.push(r);
                } else if (reason === 'guarantee_failed' && (gReason === 'EXPIRED')) {
                    guaranteeExpired.push(r);
                } else if (reason === 'guarantee_failed' && (gReason === 'NO_GUARANTEE' || gReason === 'API_NO_REFILL' || gReason === 'NO_GUARANTEE_ASK')) {
                    noGuarantee.push(r);
                } else if (reason === 'status' || reason === 'cooldown' || reason === 'disabled' ||
                    reason === 'panel_cancel_not_available' || reason === 'panel_refill_not_available' ||
                    reason === 'guarantee_failed') {
                    cooldown.push(r);
                } else {
                    otherFailed.push(r);
                }
            }
        }

        // Build message using customizable templates
        let message = await getLabel('BULK_HEADER', { command: commandDisplay }) || `📋 *${commandDisplay} Results*\n━━━━━━━━━━━━━━━━`;
        message += '\n';

        // ✅ Successfully queued
        if (queued.length > 0) {
            const orderList = queued.map(r => r.orderId).join(', ');
            const label = await getLabel('BULK_SUCCESS_LABEL', { command: commandDisplay.toLowerCase() }) || `✅ *These orders are added to ${commandDisplay.toLowerCase()} support queue:*`;
            message += `\n${label}\n${orderList}\n`;
        }

        // 🔴 Guarantee Expired
        if (guaranteeExpired.length > 0) {
            const orderList = guaranteeExpired.map(r => r.orderId).join(', ');
            const label = await getLabel('BULK_GUARANTEE_EXPIRED') || `🔴 *Order Not Eligible for Refill ( Refill Time Period Expired ):*`;
            message += `\n${label}\n${orderList}\n`;
        }

        // 🔴 No Guarantee / No Refill
        if (noGuarantee.length > 0) {
            const orderList = noGuarantee.map(r => r.orderId).join(', ');
            const label = await getLabel('BULK_NO_GUARANTEE') || `🔴 *Order Not Eligible for Refill ( No Refill/ No Guarantee ):*`;
            message += `\n${label}\n${orderList}\n`;
        }

        // 🔴 Already Cancelled
        if (alreadyCancelled.length > 0) {
            const orderList = alreadyCancelled.map(r => r.orderId).join(', ');
            const cancelLabel = command === 'refill'
                ? `🔴 *Order Already Cancelled ( Impossible to Refill ):*`
                : `🔴 *Already Cancelled – Cannot Be Cancelled Again:*`;
            const label = await getLabel('BULK_ALREADY_CANCELLED') || cancelLabel;
            message += `\n${label}\n${orderList}\n`;
        }

        // 🔴 Already Completed
        if (alreadyCompleted.length > 0) {
            const orderList = alreadyCompleted.map(r => r.orderId).join(', ');
            const label = await getLabel('BULK_ALREADY_COMPLETED') || `🔴 *Already Completed – Cannot Be Processed:*`;
            message += `\n${label}\n${orderList}\n`;
        }

        // 🔴 Partially Refunded
        if (partialRefund.length > 0) {
            const orderList = partialRefund.map(r => r.orderId).join(', ');
            const label = await getLabel('BULK_PARTIAL_REFUND') || `🔴 *Partially Refunded – Not Possible:*`;
            message += `\n${label}\n${orderList}\n`;
        }

        // ⏳ Cooldown / already in progress
        if (cooldown.length > 0) {
            const orderList = cooldown.map(r => r.orderId).join(', ');
            const label = await getLabel('BULK_COOLDOWN') || `⏳ *These support requests are already in progress:*`;
            const hint = await getLabel('BULK_COOLDOWN_HINT') || `_For each order you can request support per 12 hour. If support request is already in queue you can't create a new support request with same order._`;
            message += `\n${label}\n${orderList}\n${hint}\n`;
        }

        // ❌ Not found / not yours
        if (notFound.length > 0) {
            const orderList = notFound.map(r => r.orderId).join(', ');
            const label = await getLabel('BULK_NOT_FOUND') || `❌ *These orders are not found or not belong to you:*`;
            message += `\n${label}\n${orderList}\n`;
        }

        // ⚠️ Other errors
        if (otherFailed.length > 0) {
            const orderList = otherFailed.map(r => `${r.orderId}: ${r.details?.error || 'Error'}`).join('\n');
            const label = await getLabel('BULK_OTHER_ERRORS') || `⚠️ *Other errors:*`;
            message += `\n${label}\n${orderList}\n`;
        }

        const totalFailed = guaranteeExpired.length + noGuarantee.length + alreadyCancelled.length + alreadyCompleted.length + partialRefund.length + cooldown.length + notFound.length + otherFailed.length;
        const summary = await getLabel('BULK_SUMMARY', { total: responses.length.toString(), success_count: queued.length.toString(), failed_count: totalFailed.toString() })
            || `━━━━━━━━━━━━━━━━\nTotal: ${responses.length} | ✅ ${queued.length} | ❌ ${totalFailed}`;
        message += `\n${summary}`;

        return message;
    }

    /**
     * Check if user has orders to process from specific sender
     * Used for order ownership validation
     */
    async validateSenderOwnership(userId, senderNumber, orderIds) {
        // For now, we validate based on order belonging to user
        // In future, can match sender's WhatsApp number with order customer
        const orders = await prisma.order.findMany({
            where: {
                externalOrderId: { in: orderIds },
                userId
            },
            select: {
                externalOrderId: true
            }
        });

        const foundIds = orders.map(o => o.externalOrderId);
        const notFound = orderIds.filter(id => !foundIds.includes(id));

        return {
            valid: notFound.length === 0,
            found: foundIds,
            notFound
        };
    }

    // ==================== USER COMMANDS (verify, account) ====================

    /**
     * Process user commands that don't require order IDs
     * @param {Object} params - { userId, command, argument, needsArgument, senderNumber, platform }
     */
    async processUserCommand(params) {
        const { userId, command, argument, needsArgument, senderNumber, platform, scope = {} } = params;

        // Check if command is allowed
        const isAllowed = await botFeatureService.isUserCommandAllowed(userId, command, scope);
        if (!isAllowed) {
            const commandName = command === 'verify' ? 'Payment Verification' : 'Account Details';
            return {
                success: false,
                error: `❌ ${commandName} is currently disabled. Please enable it in Bot Settings.`,
                responses: []
            };
        }

        // Route to appropriate handler
        switch (command) {
            case 'verify':
                return await this.handleVerifyPayment(userId, argument, needsArgument, senderNumber);
            case 'account':
                return await this.handleAccountDetails(userId, senderNumber);
            case 'ticket':
                return await this.handleTicketStatus(userId, senderNumber, params.ticketNumber, params.showList);
            default:
                return {
                    success: false,
                    error: `Unknown user command: ${command}`,
                    responses: []
                };
        }
    }

    /**
     * Handle payment verification command
     * Usage: verify [transactionId] [amount]
     * If TXN ID + amount provided and user has FonePay mapping → FonePay flow
     * Otherwise → existing internal payment check
     */
    async handleVerifyPayment(userId, transactionId, needsArgument, senderNumber) {
        // If no transaction ID provided, ask for it
        if (needsArgument || !transactionId) {
            return {
                success: true,
                formattedResponse: `💳 *Payment Verification*\n\nPlease provide your Transaction ID:\n\`verify YOUR_TRANSACTION_ID\`\n\nExample: \`verify TXN123456789\`\n\nFor FonePay: \`verify TXN123456789 5000\``,
                responses: []
            };
        }

        try {
            // Check if this is a FonePay request (TXN ID + amount)
            const parts = transactionId.trim().split(/\s+/);
            if (parts.length >= 2 && senderNumber) {
                const potentialTxnId = parts[0];
                const potentialAmount = parseFloat(parts[1]);

                if (!isNaN(potentialAmount) && potentialAmount > 0) {
                    // Pre-check: does this user even have FonePay set up?
                    // If not, fall through to existing payment check instead of returning FonePay errors
                    const fonepayService = require('./fonepayService');
                    const hasFonepay = await fonepayService.hasFonepayMapping(senderNumber, userId);

                    if (hasFonepay) {
                        const result = await fonepayService.processVerification(
                            senderNumber, potentialTxnId, potentialAmount, null, userId
                        );

                        return {
                            success: result.success,
                            formattedResponse: result.message,
                            responses: []
                        };
                    }
                    // No FonePay mapping → fall through to internal payment check
                }
            }
        } catch (fonepayError) {
            console.error('[CommandHandler] FonePay flow error:', fonepayError.message);
            // Fall through to existing payment check
        }

        try {
            // Search for payment by various identifiers
            const payment = await prisma.payment.findFirst({
                where: {
                    userId,
                    OR: [
                        { id: transactionId },
                        { transactionId: transactionId },
                        { reference: transactionId }
                    ]
                },
                orderBy: { createdAt: 'desc' }
            });

            // Also search in WalletTransaction
            let walletTxn = null;
            if (!payment) {
                walletTxn = await prisma.walletTransaction.findFirst({
                    where: {
                        userId,
                        OR: [
                            { id: transactionId },
                            { gatewayRef: transactionId }
                        ]
                    },
                    orderBy: { createdAt: 'desc' }
                });
            }

            if (!payment && !walletTxn) {
                // No exact match, show recent payments
                const recentPayments = await prisma.payment.findMany({
                    where: { userId },
                    orderBy: { createdAt: 'desc' },
                    take: 3
                });

                if (recentPayments.length === 0) {
                    return {
                        success: false,
                        formattedResponse: `❌ *Payment Not Found*\n\nNo payment found with ID: \`${transactionId}\`\n\nYou don't have any recent payments on record.`,
                        responses: []
                    };
                }

                let message = `❌ *Payment Not Found*\n\nNo payment found with ID: \`${transactionId}\`\n\n📋 *Your Recent Payments:*\n`;
                recentPayments.forEach((p, i) => {
                    const statusEmoji = p.status === 'COMPLETED' ? '✅' : p.status === 'PENDING' ? '⏳' : '❌';
                    message += `\n${i + 1}. ${statusEmoji} $${p.amount.toFixed(2)} - ${p.method}\n   ID: \`${p.reference || p.id}\`\n   Status: ${p.status}`;
                });

                return {
                    success: false,
                    formattedResponse: message,
                    responses: []
                };
            }

            // Format response based on payment type
            if (payment) {
                const statusEmoji = payment.status === 'COMPLETED' ? '✅' :
                    payment.status === 'PENDING' ? '⏳' :
                        payment.status === 'FAILED' ? '❌' : '⚠️';

                const message = `💳 *Payment Details*\n\n` +
                    `${statusEmoji} *Status:* ${payment.status}\n` +
                    `💰 *Amount:* $${payment.amount.toFixed(2)} ${payment.currency}\n` +
                    `🏦 *Method:* ${payment.method}\n` +
                    `🔖 *Reference:* \`${payment.reference || payment.id}\`\n` +
                    `📅 *Created:* ${payment.createdAt.toLocaleString()}\n` +
                    (payment.completedAt ? `✅ *Completed:* ${payment.completedAt.toLocaleString()}\n` : '') +
                    (payment.notes ? `📝 *Notes:* ${payment.notes}\n` : '');

                return {
                    success: true,
                    formattedResponse: message,
                    responses: [{ success: true, payment }]
                };
            }

            if (walletTxn) {
                const statusEmoji = walletTxn.status === 'COMPLETED' ? '✅' :
                    walletTxn.status === 'PENDING' ? '⏳' : '❌';

                const message = `💳 *Transaction Details*\n\n` +
                    `${statusEmoji} *Status:* ${walletTxn.status}\n` +
                    `💰 *Amount:* $${walletTxn.amount.toFixed(2)}\n` +
                    `🏦 *Gateway:* ${walletTxn.gateway || 'N/A'}\n` +
                    `🔖 *Reference:* \`${walletTxn.gatewayRef || walletTxn.id}\`\n` +
                    `📅 *Created:* ${walletTxn.createdAt.toLocaleString()}`;

                return {
                    success: true,
                    formattedResponse: message,
                    responses: [{ success: true, transaction: walletTxn }]
                };
            }

        } catch (error) {
            console.error('[CommandHandler] handleVerifyPayment error:', error);
            return {
                success: false,
                formattedResponse: `❌ Error checking payment: ${error.message}`,
                responses: []
            };
        }
    }

    /**
     * Handle account details command
     * Usage: account / balance / me
     */
    async handleAccountDetails(userId, senderNumber) {
        try {
            // Get user details
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    name: true,
                    creditBalance: true,
                    role: true,
                    createdAt: true,
                    _count: {
                        select: {
                            orders: true,
                            payments: true
                        }
                    }
                }
            });

            if (!user) {
                return {
                    success: false,
                    formattedResponse: `❌ User not found`,
                    responses: []
                };
            }

            // Get total spent from completed payments
            const totalSpent = await prisma.payment.aggregate({
                where: {
                    userId,
                    status: 'COMPLETED'
                },
                _sum: {
                    amount: true
                }
            });

            // Get recent transactions summary
            const recentOrders = await prisma.order.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 3,
                select: {
                    externalOrderId: true,
                    status: true,
                    serviceName: true,
                    createdAt: true
                }
            });

            // Format message
            let message = `👤 *Account Details*\n\n`;
            message += `📛 *Name:* ${user.name}\n`;
            message += `👤 *Username:* ${user.username}\n`;
            message += `📧 *Email:* ${user.email}\n`;
            message += `💰 *Balance:* $${user.creditBalance.toFixed(2)}\n`;
            message += `📊 *Total Orders:* ${user._count.orders}\n`;
            message += `💳 *Total Payments:* ${user._count.payments}\n`;
            message += `💸 *Total Spent:* $${(totalSpent._sum.amount || 0).toFixed(2)}\n`;
            message += `📅 *Member Since:* ${user.createdAt.toLocaleDateString()}\n`;

            if (recentOrders.length > 0) {
                message += `\n📋 *Recent Orders:*\n`;
                recentOrders.forEach((order, i) => {
                    const statusEmoji = order.status === 'COMPLETED' ? '✅' :
                        order.status === 'PROCESSING' ? '🔄' :
                            order.status === 'PENDING' ? '⏳' : '⚠️';
                    const serviceName = order.serviceName ?
                        (order.serviceName.length > 30 ? order.serviceName.substring(0, 30) + '...' : order.serviceName) :
                        'Unknown Service';
                    message += `${statusEmoji} #${order.externalOrderId} - ${serviceName}\n`;
                });
            }

            return {
                success: true,
                formattedResponse: message,
                responses: [{ success: true, user }]
            };

        } catch (error) {
            console.error('[CommandHandler] handleAccountDetails error:', error);
            return {
                success: false,
                formattedResponse: `❌ Error fetching account details: ${error.message}`,
                responses: []
            };
        }
    }

    /**
     * Handle ticket status command
     * Usage: ticket (shows list) or ticket T2501-0001 (shows specific ticket)
     */
    async handleTicketStatus(userId, senderNumber, ticketNumber = null, showList = false) {
        try {
            const ticketService = require('./ticketAutomationService');

            if (showList || !ticketNumber) {
                // Show list of customer's recent tickets
                const tickets = await ticketService.getByCustomerPhone(userId, senderNumber);

                if (!tickets || tickets.length === 0) {
                    return {
                        success: true,
                        formattedResponse: `📋 *Your Tickets*\n\nNo tickets found for your number.\n\nTo create a ticket, contact support or use a command that requires support (e.g., refill for unsupported orders).`,
                        responses: []
                    };
                }

                // Format tickets list
                let message = `📋 *Your Tickets*\n\n`;
                const statusEmoji = {
                    'OPEN': '🔵',
                    'PENDING': '🟡',
                    'IN_PROGRESS': '🔄',
                    'WAITING_CUSTOMER': '⏳',
                    'RESOLVED': '✅',
                    'CLOSED': '⚫'
                };

                tickets.slice(0, 5).forEach((ticket, idx) => {
                    const emoji = statusEmoji[ticket.status] || '📌';
                    message += `${idx + 1}. ${emoji} *#${ticket.ticketNumber}*\n`;
                    message += `   ${ticket.subject}\n`;
                    message += `   Status: ${ticket.status}\n\n`;
                });

                if (tickets.length > 5) {
                    message += `_... and ${tickets.length - 5} more tickets_\n\n`;
                }

                message += `💡 To view ticket details, reply:\n*TICKET [TICKET_NUMBER]*\n\nExample: TICKET ${tickets[0].ticketNumber}`;

                return {
                    success: true,
                    formattedResponse: message,
                    responses: tickets
                };
            }

            // Show specific ticket details
            const ticket = await ticketService.getByNumber(ticketNumber, userId);

            if (!ticket) {
                return {
                    success: false,
                    formattedResponse: `❌ Ticket *#${ticketNumber}* not found.\n\nMake sure you entered the correct ticket number.\nTo see your tickets list, send: *TICKET*`,
                    responses: []
                };
            }

            // Format ticket details with history
            const statusEmoji = {
                'OPEN': '🔵 Open',
                'PENDING': '🟡 Pending',
                'IN_PROGRESS': '🔄 In Progress',
                'WAITING_CUSTOMER': '⏳ Waiting for You',
                'RESOLVED': '✅ Resolved',
                'CLOSED': '⚫ Closed'
            };

            let message = `📋 *Ticket Details*\n\n`;
            message += `📌 *Ticket:* #${ticket.ticketNumber}\n`;
            message += `📝 *Subject:* ${ticket.subject}\n`;
            message += `📊 *Status:* ${statusEmoji[ticket.status] || ticket.status}\n`;
            message += `📂 *Category:* ${ticket.category}\n`;
            message += `🕐 *Created:* ${new Date(ticket.createdAt).toLocaleString()}\n`;

            if (ticket.resolvedAt) {
                message += `✅ *Resolved:* ${new Date(ticket.resolvedAt).toLocaleString()}\n`;
            }

            // Show message history
            const messages = ticket.messages || [];
            if (messages.length > 0) {
                message += `\n━━━━━━━━━━━━━━━━━━\n`;
                message += `💬 *Message History* (${messages.length})\n\n`;

                // Show last 5 messages
                const recentMessages = messages.slice(-5);
                recentMessages.forEach((msg, idx) => {
                    const typeEmoji = msg.type === 'CUSTOMER' ? '👤' : (msg.type === 'STAFF' ? '👨‍💼' : '🔔');
                    const time = new Date(msg.timestamp).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    });
                    message += `${typeEmoji} *${msg.type}* (${time})\n`;
                    // Truncate long messages
                    const content = msg.content.length > 100 ? msg.content.substring(0, 100) + '...' : msg.content;
                    message += `${content}\n\n`;
                });

                if (messages.length > 5) {
                    message += `_... ${messages.length - 5} earlier messages_\n`;
                }
            } else {
                message += `\n💬 *No replies yet* - We will respond shortly.`;
            }

            // Add action hints based on status
            if (ticket.status === 'WAITING_CUSTOMER') {
                message += `\n\n⚠️ *Action Required:* Please reply to this ticket in the panel.`;
            } else if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
                message += `\n\n✅ This ticket has been ${ticket.status.toLowerCase()}.`;
            } else {
                message += `\n\n⏳ Our team will respond shortly.`;
            }

            return {
                success: true,
                formattedResponse: message,
                responses: [ticket]
            };

        } catch (error) {
            console.error('[CommandHandler] handleTicketStatus error:', error);
            return {
                success: false,
                formattedResponse: `❌ Error fetching ticket status: ${error.message}`,
                responses: []
            };
        }
    }

    /**
     * Send batch forward to provider groups
     * Groups orders by provider and sends comma-separated provider order IDs
     * Example output: "7450284,7450283,7450282 cancel"
     */
    async sendBatchForward(params) {
        const { userId, command, successfulOrders, panelId } = params;

        if (!successfulOrders || successfulOrders.length === 0) {
            return { success: false, reason: 'no_orders' };
        }

        // Group orders by provider
        const ordersByProvider = new Map();

        for (const order of successfulOrders) {
            const providerKey = order.providerName || 'default';
            if (!ordersByProvider.has(providerKey)) {
                ordersByProvider.set(providerKey, {
                    providerName: order.providerName,
                    panelId: order.panelId,
                    orders: [],
                    sampleOrder: order.order
                });
            }
            ordersByProvider.get(providerKey).orders.push({
                panelOrderId: order.panelOrderId,
                providerOrderId: order.providerOrderId
            });
        }

        const results = [];

        // Send batch message for each provider
        for (const [providerKey, providerData] of ordersByProvider) {
            try {
                console.log(`[CommandHandler] Looking for provider group for: ${providerKey}, panelId: ${providerData.panelId || panelId}`);

                // Find provider group for this provider
                // Try specific provider first, then default group
                let providerGroup = await prisma.providerGroup.findFirst({
                    where: {
                        userId,
                        isActive: true,
                        OR: [
                            // Try specific panel + provider
                            { panelId: providerData.panelId || panelId, providerName: providerData.providerName },
                            // Try specific panel + default (no provider name)
                            { panelId: providerData.panelId || panelId, providerName: null },
                            // Try any panel with matching provider
                            { providerName: providerData.providerName },
                            // Try any active group as fallback
                            { providerName: null }
                        ]
                    },
                    include: {
                        device: true
                    },
                    orderBy: [
                        { providerName: 'desc' },  // Prefer specific provider group
                        { panelId: 'desc' }        // Prefer groups with panelId
                    ]
                });

                if (!providerGroup) {
                    console.log(`[CommandHandler] No provider group found for ${providerKey}, checking ProviderConfig...`);

                    // Fallback: check ProviderConfig (Provider Aliases page)
                    try {
                        const providerConfig = await prisma.providerConfig.findFirst({
                            where: {
                                userId,
                                providerName: providerData.providerName,
                                isActive: true
                            }
                        });

                        if (providerConfig && (providerConfig.whatsappGroupJid || providerConfig.whatsappNumber)) {
                            console.log(`[CommandHandler] Found ProviderConfig for ${providerKey}, using for batch forward`);

                            // Build batch message
                            const providerOrderIds = providerData.orders
                                .map(o => o.providerOrderId)
                                .filter(id => id)
                                .join(',');

                            if (!providerOrderIds) {
                                results.push({ provider: providerKey, success: false, reason: 'no_provider_ids' });
                                continue;
                            }

                            const commandMap = { 'refill': 'refill', 'cancel': 'cancel', 'speedup': 'speed up', 'speed_up': 'speed up' };
                            const cmdText = commandMap[command.toLowerCase()] || command.toLowerCase();
                            const batchMessage = `${providerOrderIds} ${cmdText}`;

                            // Resolve device
                            let cfgDeviceId = providerConfig.deviceId;
                            if (!cfgDeviceId) {
                                const connDev = await prisma.device.findFirst({ where: { userId, status: 'connected' }, select: { id: true } });
                                cfgDeviceId = connDev?.id;
                            }
                            if (!cfgDeviceId) {
                                results.push({ provider: providerKey, success: false, reason: 'no_device' });
                                continue;
                            }

                            // Send to group or number
                            const targetJid = providerConfig.whatsappGroupJid
                                ? (providerConfig.whatsappGroupJid.includes('@') ? providerConfig.whatsappGroupJid : `${providerConfig.whatsappGroupJid}@g.us`)
                                : `${providerConfig.whatsappNumber.replace(/\D/g, '')}@s.whatsapp.net`;

                            await groupForwardingService.whatsappService.sendMessage(cfgDeviceId, targetJid, batchMessage);

                            console.log(`[CommandHandler] ✅ Batch forward via ProviderConfig: ${providerData.orders.length} orders to ${providerConfig.alias || providerConfig.providerName}`);
                            results.push({
                                provider: providerKey,
                                success: true,
                                groupName: providerConfig.alias || providerConfig.providerName,
                                message: batchMessage,
                                orderCount: providerData.orders.length,
                                source: 'ProviderConfig'
                            });
                            continue;
                        }
                    } catch (cfgErr) {
                        console.log(`[CommandHandler] ProviderConfig fallback failed:`, cfgErr.message);
                    }

                    results.push({
                        provider: providerKey,
                        success: false,
                        reason: 'no_group'
                    });
                    continue;
                }

                // Build batch message
                // Format: "7450284,7450283,7450282 cancel"
                const providerOrderIds = providerData.orders
                    .map(o => o.providerOrderId)
                    .filter(id => id)  // Filter out null/undefined
                    .join(',');

                if (!providerOrderIds) {
                    console.log(`[CommandHandler] No provider order IDs for ${providerKey}`);
                    results.push({
                        provider: providerKey,
                        success: false,
                        reason: 'no_provider_ids'
                    });
                    continue;
                }

                // Format command for message
                const commandMap = {
                    'refill': 'refill',
                    'cancel': 'cancel',
                    'speedup': 'speed up',
                    'speed_up': 'speed up'
                };
                const cmdText = commandMap[command.toLowerCase()] || command.toLowerCase();

                // Check for custom mass forwarding template
                let batchMessage = `${providerOrderIds} ${cmdText}`;
                try {
                    const toggles = await botFeatureService.getToggles(userId, { panelId: providerData.panelId || panelId });
                    if (toggles?.massForwardingTemplate) {
                        // Get panel alias for template
                        let panelAlias = 'Panel';
                        if (providerData.panelId || panelId) {
                            const panel = await prisma.smmPanel.findUnique({ where: { id: providerData.panelId || panelId }, select: { alias: true, name: true } });
                            panelAlias = panel?.alias || panel?.name || 'Panel';
                        }
                        batchMessage = toggles.massForwardingTemplate
                            .replace(/\{order_ids\}/g, providerOrderIds)
                            .replace(/\{command\}/g, cmdText)
                            .replace(/\{provider\}/g, providerData.providerName || 'Unknown')
                            .replace(/\{panel\}/g, panelAlias)
                            .replace(/\{count\}/g, providerData.orders.length.toString());
                    }
                } catch (tplErr) {
                    console.error('[CommandHandler] Failed to get mass forwarding template:', tplErr.message);
                }

                console.log(`[CommandHandler] Sending batch forward to ${providerGroup.groupName}: ${batchMessage}`);

                // Send via WhatsApp
                if (!groupForwardingService.whatsappService) {
                    results.push({
                        provider: providerKey,
                        success: false,
                        reason: 'no_whatsapp_service'
                    });
                    continue;
                }

                // Resolve deviceId: group > device relation > first connected
                let batchDeviceId = providerGroup.deviceId || providerGroup.device?.id;
                if (!batchDeviceId) {
                    try {
                        const connDev = await prisma.device.findFirst({ where: { userId, status: 'connected' }, select: { id: true } });
                        if (connDev) batchDeviceId = connDev.id;
                    } catch (e) { /* non-critical */ }
                }
                if (!batchDeviceId) {
                    results.push({
                        provider: providerKey,
                        success: false,
                        reason: 'no_device'
                    });
                    continue;
                }

                // Format JID
                const targetJid = providerGroup.groupId.includes('@')
                    ? providerGroup.groupId
                    : `${providerGroup.groupId.replace(/\D/g, '')}@s.whatsapp.net`;

                await groupForwardingService.whatsappService.sendMessage(batchDeviceId, targetJid, batchMessage);

                results.push({
                    provider: providerKey,
                    success: true,
                    groupName: providerGroup.groupName,
                    message: batchMessage,
                    orderCount: providerData.orders.length
                });

                console.log(`[CommandHandler] ✅ Batch forward sent: ${providerData.orders.length} orders to ${providerGroup.groupName}`);

            } catch (error) {
                console.error(`[CommandHandler] Batch forward error for ${providerKey}:`, error.message);
                results.push({
                    provider: providerKey,
                    success: false,
                    error: error.message
                });
            }
        }

        return {
            success: results.some(r => r.success),
            totalProviders: ordersByProvider.size,
            results
        };
    }
}

module.exports = new CommandHandlerService();
