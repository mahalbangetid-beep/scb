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
                            // Provider info from Admin API - critical for auto-forwarding
                            providerName: orderData.providerName || null,
                            providerOrderId: orderData.providerOrderId || null,
                            providerStatus: orderData.providerStatus || null,
                            providerSyncedAt: orderData.providerName ? new Date() : null,
                            // Available actions from Admin API
                            canRefill: orderData.canRefill || false,
                            canCancel: orderData.canCancel || false,
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
    formatResponses(command, responses, userId = null) {
        if (responses.length === 0) {
            return 'No orders processed.';
        }

        if (responses.length === 1) {
            return responses[0].message;
        }

        // Multiple orders - group by success/failure
        const successful = responses.filter(r => r.success);
        const failed = responses.filter(r => !r.success);

        // Get templates (use defaults, will be customizable via UI)
        const defaults = responseTemplateService.defaultTemplates;

        // Format header
        const headerTemplate = defaults['BULK_HEADER']?.template || '📋 {command} Results\n━━━━━━━━━━━━━━━━';
        const successItemTemplate = defaults['BULK_SUCCESS_ITEM']?.template || '• {order_id}';
        const failedItemTemplate = defaults['BULK_FAILED_ITEM']?.template || '• {order_id}: {error}';
        const summaryTemplate = defaults['BULK_SUMMARY']?.template || '━━━━━━━━━━━━━━━━\nTotal: {total} | ✅ {success_count} | ❌ {failed_count}';

        let message = responseTemplateService.formatTemplate(headerTemplate, {
            command: commandParser.getDisplayCommand(command)
        });
        message += '\n';

        if (successful.length > 0) {
            message += `\n✅ Successful (${successful.length}):\n`;
            for (const r of successful.slice(0, 20)) { // Limit display
                message += responseTemplateService.formatTemplate(successItemTemplate, {
                    order_id: r.orderId,
                    status: r.details?.status || '',
                    service: r.details?.service || ''
                }) + '\n';
            }
            if (successful.length > 20) {
                message += `... and ${successful.length - 20} more\n`;
            }
        }

        if (failed.length > 0) {
            message += `\n❌ Failed (${failed.length}):\n`;
            for (const r of failed.slice(0, 10)) {
                message += responseTemplateService.formatTemplate(failedItemTemplate, {
                    order_id: r.orderId,
                    error: r.details?.error || r.details?.reason || 'Error',
                    reason: r.details?.reason || ''
                }) + '\n';
            }
            if (failed.length > 10) {
                message += `... and ${failed.length - 10} more\n`;
            }
        }

        message += '\n' + responseTemplateService.formatTemplate(summaryTemplate, {
            total: responses.length.toString(),
            success_count: successful.length.toString(),
            failed_count: failed.length.toString()
        });

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
        const { userId, command, argument, needsArgument, senderNumber, platform } = params;

        // Check if command is allowed
        const isAllowed = await botFeatureService.isUserCommandAllowed(userId, command);
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
     * Usage: verify [transactionId]
     */
    async handleVerifyPayment(userId, transactionId, needsArgument, senderNumber) {
        // If no transaction ID provided, ask for it
        if (needsArgument || !transactionId) {
            return {
                success: true,
                formattedResponse: `💳 *Payment Verification*\n\nPlease provide your Transaction ID:\n\`verify YOUR_TRANSACTION_ID\`\n\nExample: \`verify TXN123456789\``,
                responses: []
            };
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
}

module.exports = new CommandHandlerService();
