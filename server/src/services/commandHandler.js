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
const botFeatureService = require('./botFeatureService');

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
        const { userId, panelId, message, senderNumber, platform = 'WHATSAPP', isGroup = false } = params;

        // Parse the command
        const parsed = commandParser.parse(message);

        if (!parsed.isValid) {
            return {
                success: false,
                error: parsed.error || 'Invalid command format',
                responses: []
            };
        }

        const { command, orderIds } = parsed;
        const responses = [];
        const summary = {
            total: orderIds.length,
            success: 0,
            failed: 0
        };

        // ==================== CHECK COMMAND PERMISSION ====================
        // Check if this command type is enabled in user's bot feature toggles
        const isCommandAllowed = await botFeatureService.isCommandAllowed(userId, command);
        if (!isCommandAllowed) {
            return {
                success: false,
                error: `❌ The "${command}" command is currently disabled. Please enable it in Bot Settings.`,
                responses: []
            };
        }

        // Process each order ID
        for (const orderId of orderIds) {
            try {
                const result = await this.processOrderCommand({
                    userId,
                    panelId,    // Pass panelId for panel-specific order lookup
                    orderId,
                    command,
                    senderNumber,
                    isGroup
                });

                responses.push({
                    orderId,
                    success: result.success,
                    message: result.message,
                    details: result.details
                });

                if (result.success) {
                    summary.success++;
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

        return {
            success: summary.failed === 0,
            command,
            responses,
            summary,
            formattedResponse: this.formatResponses(command, responses)
        };
    }

    /**
     * Process a single order command
     */
    async processOrderCommand(params) {
        const { userId, panelId, orderId, command, senderNumber, isGroup = false } = params;

        // Build order query - filter by panelId if provided
        const whereClause = {
            externalOrderId: orderId,
            userId
        };

        // If panelId is specified, only search in that panel's orders
        // If panelId is null, search across ALL user's panels (backward compatible)
        if (panelId) {
            whereClause.panelId = panelId;
            console.log(`[CommandHandler] Looking for order ${orderId} in panel ${panelId}`);
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

            // Get user's panels to search
            const panelsToSearch = panelId
                ? [await prisma.smmPanel.findUnique({ where: { id: panelId } })]
                : await prisma.smmPanel.findMany({ where: { userId, isActive: true } });

            console.log(`[CommandHandler] Searching in ${panelsToSearch.filter(p => p).length} panels for order ${orderId}`);
            if (panelId) {
                console.log(`[CommandHandler] Using specific panelId: ${panelId}`);
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
                        const userApiResult = await smmPanelService.getOrderStatus(panel.id, orderId);
                        if (userApiResult && userApiResult.status) {
                            orderData = userApiResult;
                            console.log(`[CommandHandler] User API succeeded for order ${orderId}`);
                        }
                    }

                    if (orderData && orderData.status) {
                        console.log(`[CommandHandler] Order ${orderId} found in panel ${panel.alias}, creating local record...`);
                        console.log(`[CommandHandler] Order data: status=${orderData.status}, serviceName="${orderData.serviceName}"`);

                        // Normalize status
                        const smmPanelService = require('./smmPanel');
                        const normalizedStatus = orderData.success !== undefined
                            ? orderData.status  // Already normalized from Admin API
                            : smmPanelService.mapStatus(orderData.status);

                        // Prepare create data
                        const createData = {
                            externalOrderId: orderId,
                            panelId: panel.id,
                            userId,
                            status: normalizedStatus,
                            charge: orderData.charge,
                            startCount: orderData.startCount,
                            remains: orderData.remains,
                            serviceName: orderData.serviceName,
                            link: orderData.link
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
                    link: latestStatus.link || order.link
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
            userId,
            command
        });

        if (!securityCheck.allowed) {
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

                    // Update order in database with provider info
                    order = await prisma.order.update({
                        where: { id: order.id },
                        data: {
                            providerName: providerData.providerName || order.providerName,
                            providerOrderId: providerData.providerOrderId || order.providerOrderId,
                            providerStatus: providerData.providerStatus || order.providerStatus,
                            providerCharge: providerData.providerCharge || order.providerCharge,
                            providerSyncedAt: new Date(),
                            // Also update other fields if available
                            serviceName: providerData.serviceName || order.serviceName,
                            status: providerData.status || order.status,
                            startCount: providerData.startCount ?? order.startCount,
                            remains: providerData.remains ?? order.remains,
                            customerUsername: providerData.customerUsername || order.customerUsername,
                            customerEmail: providerData.customerEmail || order.customerEmail
                        },
                        include: {
                            panel: {
                                select: {
                                    id: true,
                                    name: true,
                                    alias: true,
                                    url: true,
                                    adminApiBaseUrl: true,
                                    supportsAdminApi: true,
                                    adminApiKey: true
                                }
                            }
                        }
                    });

                    console.log(`[CommandHandler] Provider info synced: ${order.providerName} - ${order.providerOrderId}`);
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
                result = await this.handleRefill(order, orderId, senderNumber, userSettings);
                break;
            case 'cancel':
                result = await this.handleCancel(order, orderId, senderNumber, userSettings);
                break;
            case 'speedup':
                result = await this.handleSpeedUp(order, orderId, senderNumber, userSettings);
                break;
            case 'status':
                result = await this.handleStatus(order, orderId, userSettings);
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
    async handleRefill(order, orderId, senderNumber, userSettings) {
        // Check action mode
        const actionMode = userSettings?.refillActionMode || 'forward';

        if (actionMode === 'disabled') {
            return {
                success: false,
                message: '❌ Refill command is disabled. Please contact admin.',
                details: { reason: 'disabled' }
            };
        }

        console.log(`[CommandHandler] Refill check for order ${orderId}: status="${order.status}" (expected: "COMPLETED")`);

        // Refill only for completed orders
        if (order.status !== 'COMPLETED') {
            return {
                success: false,
                message: commandParser.generateResponse('refill', orderId, false, {
                    reason: 'status',
                    status: order.status
                }),
                details: { reason: 'status', status: order.status }
            };
        }

        // ==================== GUARANTEE VALIDATION ====================
        // Check if order is within guarantee period based on service name keywords
        try {
            const guaranteeService = require('./guaranteeService');

            console.log(`[CommandHandler] Checking guarantee for order ${orderId}:`);
            console.log(`  - Service Name: "${order.serviceName}"`);
            console.log(`  - Completed At: ${order.completedAt}`);

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
                    apiResult = await adminApiService.createRefill(order.panel, order.externalOrderId);
                } catch (apiError) {
                    console.log(`[CommandHandler] API refill failed:`, apiError.message);
                    // If mode is 'auto' only and API fails, return error
                    if (actionMode === 'auto') {
                        throw apiError;
                    }
                    // If 'both', continue with forwarding even if API fails
                }
            }

            if (actionMode === 'forward' || actionMode === 'both') {
                // Forward to provider group with PROVIDER Order ID
                try {
                    forwardResult = await groupForwardingService.forwardToProvider({
                        order: order,
                        command: 'REFILL',
                        userId: order.userId,
                        providerOrderId: order.providerOrderId,
                        providerName: order.providerName
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
                message = `✅ Refill submitted via API for Order #${orderId}`;
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
                    forwarded: forwardResult?.success
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
    async handleCancel(order, orderId, senderNumber, userSettings) {
        // Check action mode
        const actionMode = userSettings?.cancelActionMode || 'forward';

        if (actionMode === 'disabled') {
            return {
                success: false,
                message: '❌ Cancel command is disabled. Please contact admin.',
                details: { reason: 'disabled' }
            };
        }

        // Cannot cancel completed or already cancelled orders
        if (['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(order.status)) {
            return {
                success: false,
                message: commandParser.generateResponse('cancel', orderId, false, {
                    reason: 'status',
                    status: order.status
                }),
                details: { reason: 'status', status: order.status }
            };
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
                    apiResult = await adminApiService.createCancel(order.panel, order.externalOrderId);

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

            if (actionMode === 'forward' || actionMode === 'both') {
                // Forward to provider group
                try {
                    forwardResult = await groupForwardingService.forwardToProvider({
                        order: order,
                        command: 'CANCEL',
                        userId: order.userId,
                        providerOrderId: order.providerOrderId,
                        providerName: order.providerName
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
                message = `✅ Cancel submitted via API for Order #${orderId}`;
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
                    forwarded: forwardResult?.success
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
    async handleSpeedUp(order, orderId, senderNumber, userSettings) {
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
        if (actionMode === 'forward' || actionMode === 'both' || actionMode === 'auto') {
            try {
                forwardResult = await groupForwardingService.forwardToProvider({
                    order: order,
                    command: 'SPEED_UP',
                    userId: order.userId,
                    providerOrderId: order.providerOrderId,
                    providerName: order.providerName
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
                forwarded: forwardResult?.success
            }
        };
    }


    /**
     * Handle status command
     */
    async handleStatus(order, orderId, userSettings = {}) {
        try {
            // Get fresh status from panel Admin API
            const status = await adminApiService.getOrderStatus(order.panel, order.externalOrderId);

            // Update order with new status
            const newStatus = status.status || 'PENDING';
            await prisma.order.update({
                where: { id: order.id },
                data: {
                    status: newStatus,
                    startCount: status.startCount ? parseInt(status.startCount) : order.startCount,
                    remains: status.remains ? parseInt(status.remains) : order.remains,
                    lastCheckedAt: new Date()
                }
            });

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
                templateVars
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
                { orderId, errorMessage: 'Failed to fetch order status' }
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
    formatResponses(command, responses) {
        if (responses.length === 0) {
            return 'No orders processed.';
        }

        if (responses.length === 1) {
            return responses[0].message;
        }

        // Multiple orders - group by success/failure
        const successful = responses.filter(r => r.success);
        const failed = responses.filter(r => !r.success);

        let message = `📋 ${commandParser.getDisplayCommand(command)} Results\n`;
        message += `━━━━━━━━━━━━━━━━\n`;

        if (successful.length > 0) {
            message += `\n✅ Successful (${successful.length}):\n`;
            for (const r of successful.slice(0, 20)) { // Limit display
                message += `• ${r.orderId}\n`;
            }
            if (successful.length > 20) {
                message += `... and ${successful.length - 20} more\n`;
            }
        }

        if (failed.length > 0) {
            message += `\n❌ Failed (${failed.length}):\n`;
            for (const r of failed.slice(0, 10)) {
                message += `• ${r.orderId}: ${r.details?.error || r.details?.reason || 'Error'}\n`;
            }
            if (failed.length > 10) {
                message += `... and ${failed.length - 10} more\n`;
            }
        }

        message += `\n━━━━━━━━━━━━━━━━\n`;
        message += `Total: ${responses.length} | ✅ ${successful.length} | ❌ ${failed.length}`;

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
}

module.exports = new CommandHandlerService();
