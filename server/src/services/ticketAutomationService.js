/**
 * Ticket Automation Service
 * 
 * Service for automating ticket creation and management
 * Phase 4: Rule-Based Bot Control - Ticket Page Automation
 * 
 * Features:
 * - Auto-create tickets from WhatsApp commands
 * - Sync tickets with panel API (if supported)
 * - Track ticket status and responses
 * - Auto-reply with ticket updates
 */

const prisma = require('../utils/prisma');

class TicketAutomationService {
    constructor() {
        // Default ticket categories
        this.categories = {
            REFILL: 'Refill Request',
            CANCEL: 'Cancel Request',
            SPEEDUP: 'Speed Up Request',
            PARTIAL: 'Partial Refund',
            GENERAL: 'General Inquiry',
            TECHNICAL: 'Technical Issue'
        };

        // Priority levels
        this.priorities = {
            LOW: 1,
            NORMAL: 2,
            HIGH: 3,
            URGENT: 4
        };

        // Ticket status
        this.statuses = {
            OPEN: 'OPEN',
            PENDING: 'PENDING',
            IN_PROGRESS: 'IN_PROGRESS',
            WAITING_CUSTOMER: 'WAITING_CUSTOMER',
            RESOLVED: 'RESOLVED',
            CLOSED: 'CLOSED'
        };
    }

    /**
     * Create a ticket from WhatsApp message
     */
    async createFromMessage(userId, data) {
        const {
            orderId,
            orderExternalId,
            customerPhone,
            customerUsername,
            category,
            subject,
            message,
            priority,
            panelId
        } = data;

        // Generate ticket number
        const ticketNumber = await this.generateTicketNumber(userId);

        // Create ticket in database
        const ticket = await prisma.ticket.create({
            data: {
                userId,
                ticketNumber,
                orderId: orderId || null,
                orderExternalId: orderExternalId || null,
                panelId: panelId || null,
                customerPhone: customerPhone || null,
                customerUsername: customerUsername || null,
                category: category || 'GENERAL',
                subject: subject || 'Support Request',
                status: 'OPEN',
                priority: priority || 'NORMAL',
                source: 'WHATSAPP',
                messages: JSON.stringify([{
                    type: 'CUSTOMER',
                    content: message,
                    timestamp: new Date().toISOString()
                }])
            }
        });


        // Try to sync with panel if API supports it
        if (panelId) {
            await this.syncToPanel(ticket, panelId).catch(err => {
                console.log('[TicketAutomation] Panel sync failed:', err.message);
            });
        }

        // Section 8.1: Auto-forward ticket to provider WA/Telegram group
        // Section 16.1: If forward fails, queue for retry (zero-miss)
        setImmediate(async () => {
            try {
                const result = await this.forwardTicketToProvider(userId, ticket, data);
                if (result && !result.success) {
                    // Forward was attempted but didn't send — queue it
                    const complaintQueueService = require('./complaintQueueService');
                    await complaintQueueService.addToQueue(userId, {
                        orderId: ticket.orderExternalId,
                        command: ticket.category || 'GENERAL',
                        senderPhone: ticket.customerPhone,
                        senderName: ticket.customerUsername,
                        message: ticket.subject,
                        reason: 'no_provider_config',
                        panelId: data.panelId || ticket.panelId
                    });
                }
            } catch (fwdErr) {
                console.warn('[TicketAutomation] Auto-forward failed, queueing:', fwdErr.message);
                try {
                    const complaintQueueService = require('./complaintQueueService');
                    await complaintQueueService.addToQueue(userId, {
                        orderId: ticket.orderExternalId,
                        command: ticket.category || 'GENERAL',
                        senderPhone: ticket.customerPhone,
                        senderName: ticket.customerUsername,
                        message: ticket.subject,
                        reason: 'api_error',
                        panelId: data.panelId || ticket.panelId
                    });
                } catch (_) { /* non-critical */ }
            }
        });

        console.log(`[TicketAutomation] Created ticket #${ticketNumber} for user ${userId}`);

        return ticket;
    }

    /**
     * Create ticket from order command (refill, cancel, etc.)
     */
    async createFromOrderCommand(userId, order, command, customerPhone) {
        const categoryMap = {
            'REFILL': 'REFILL',
            'CANCEL': 'CANCEL',
            'SPEEDUP': 'SPEEDUP',
            'PARTIAL': 'PARTIAL'
        };

        return this.createFromMessage(userId, {
            orderId: order.id,
            orderExternalId: order.externalOrderId,
            customerPhone,
            customerUsername: order.customerUsername,
            category: categoryMap[command.toUpperCase()] || 'GENERAL',
            subject: `${command.toUpperCase()} Request - Order #${order.externalOrderId}`,
            message: `${command.toUpperCase()} request for order #${order.externalOrderId}\n\nService: ${order.serviceName}\nStatus: ${order.status}\nQuantity: ${order.quantity}`,
            priority: command.toUpperCase() === 'CANCEL' ? 'HIGH' : 'NORMAL',
            panelId: order.panelId
        });
    }

    /**
     * Add reply to ticket
     */
    async addReply(ticketId, userId, content, type = 'STAFF') {
        const ticket = await prisma.ticket.findFirst({
            where: { id: ticketId, userId }
        });

        if (!ticket) {
            throw new Error('Ticket not found');
        }

        const messages = this.safeJSONParse(ticket.messages, []);
        messages.push({
            type, // 'STAFF', 'CUSTOMER', 'SYSTEM'
            content,
            timestamp: new Date().toISOString()
        });

        const updateData = {
            messages: JSON.stringify(messages),
            lastReplyAt: new Date()
        };

        // Auto-update status based on reply type
        if (type === 'STAFF' && ticket.status === 'OPEN') {
            updateData.status = 'IN_PROGRESS';
        } else if (type === 'CUSTOMER' && ticket.status === 'WAITING_CUSTOMER') {
            updateData.status = 'PENDING';
        }

        return prisma.ticket.update({
            where: { id: ticketId },
            data: updateData
        });
    }

    /**
     * Update ticket status
     */
    async updateStatus(ticketId, userId, status, note = null) {
        const validStatuses = Object.values(this.statuses);
        if (!validStatuses.includes(status)) {
            throw new Error('Invalid status');
        }

        const updateData = {
            status,
            updatedAt: new Date()
        };

        if (status === 'RESOLVED' || status === 'CLOSED') {
            updateData.resolvedAt = new Date();
        }

        const ticket = await prisma.ticket.update({
            where: { id: ticketId },
            data: updateData
        });

        // Add system message if note provided
        if (note) {
            await this.addReply(ticketId, userId, `Status changed to ${status}: ${note}`, 'SYSTEM');
        }

        return ticket;
    }

    /**
     * Get tickets for a user
     */
    async getTickets(userId, options = {}) {
        const where = { userId };

        if (options.status) where.status = options.status;
        if (options.category) where.category = options.category;
        if (options.priority) where.priority = options.priority;
        if (options.customerPhone) where.customerPhone = { contains: options.customerPhone };

        if (options.search) {
            where.OR = [
                { ticketNumber: { contains: options.search } },
                { subject: { contains: options.search, mode: 'insensitive' } },
                { customerUsername: { contains: options.search, mode: 'insensitive' } }
            ];
        }

        const tickets = await prisma.ticket.findMany({
            where,
            orderBy: options.orderBy || { createdAt: 'desc' },
            take: options.limit || 50,
            skip: options.offset || 0
        });

        return tickets.map(t => this.parseTicket(t));
    }

    /**
     * Get single ticket
     */
    async getById(ticketId, userId) {
        const ticket = await prisma.ticket.findFirst({
            where: { id: ticketId, userId }
        });

        return ticket ? this.parseTicket(ticket) : null;
    }

    /**
     * Get ticket by number
     */
    async getByNumber(ticketNumber, userId) {
        const ticket = await prisma.ticket.findFirst({
            where: { ticketNumber, userId }
        });

        return ticket ? this.parseTicket(ticket) : null;
    }

    /**
     * Get tickets by customer phone
     */
    async getByCustomerPhone(userId, phone) {
        const tickets = await prisma.ticket.findMany({
            where: {
                userId,
                customerPhone: { contains: phone }
            },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        return tickets.map(t => this.parseTicket(t));
    }

    /**
     * Get open tickets count
     */
    async getOpenCount(userId) {
        return prisma.ticket.count({
            where: {
                userId,
                status: { in: ['OPEN', 'PENDING', 'IN_PROGRESS'] }
            }
        });
    }

    /**
     * Get ticket statistics
     */
    async getStats(userId) {
        const [total, open, pending, resolved, avgResolutionTime] = await Promise.all([
            prisma.ticket.count({ where: { userId } }),
            prisma.ticket.count({ where: { userId, status: 'OPEN' } }),
            prisma.ticket.count({ where: { userId, status: 'PENDING' } }),
            prisma.ticket.count({ where: { userId, status: { in: ['RESOLVED', 'CLOSED'] } } }),
            this.calculateAvgResolutionTime(userId)
        ]);

        // Category breakdown
        const byCategory = await prisma.ticket.groupBy({
            by: ['category'],
            where: { userId },
            _count: true
        });

        return {
            total,
            open,
            pending,
            inProgress: total - open - pending - resolved,
            resolved,
            avgResolutionTime,
            byCategory: byCategory.reduce((acc, c) => {
                acc[c.category] = c._count;
                return acc;
            }, {})
        };
    }

    /**
     * Sync ticket to panel API
     */
    async syncToPanel(ticket, panelId) {
        const panel = await prisma.smmPanel.findUnique({
            where: { id: panelId }
        });

        if (!panel?.supportsAdminApi || !panel?.adminApiKey) {
            return null;
        }

        try {
            const adminApiService = require('./adminApiService');

            // Build ticket data for panel API
            const ticketData = {
                subject: ticket.subject || `Support Request #${ticket.ticketNumber}`,
                message: this._buildTicketMessage(ticket),
                priority: this._mapPriority(ticket.priority),
                orderId: ticket.orderExternalId || null
            };

            let result = null;

            if (adminApiService.isRentalPanel(panel)) {
                // Rental Panel: action=createTicket
                result = await adminApiService.makeAdminRequest(panel, 'POST', '', {
                    action: 'createTicket',
                    subject: ticketData.subject,
                    message: ticketData.message,
                    priority: ticketData.priority,
                    order_id: ticketData.orderId
                });
            } else {
                // Perfect Panel: POST /tickets
                result = await adminApiService.makeAdminRequest(panel, 'POST', '/tickets', {
                    subject: ticketData.subject,
                    message: ticketData.message,
                    priority: ticketData.priority,
                    order_id: ticketData.orderId
                });
            }

            // Log the sync attempt
            await this._logTicketSync(ticket, panel, result);

            if (result?.success) {
                const panelTicketId = result.data?.ticket_id || result.data?.id || result.data?.data?.id;
                console.log(`[TicketAutomation] ✅ Ticket #${ticket.ticketNumber} synced to panel ${panel.name} (panel ticket: ${panelTicketId})`);

                // Update ticket with panel reference
                if (panelTicketId) {
                    await prisma.ticket.update({
                        where: { id: ticket.id },
                        data: {
                            panelTicketId: String(panelTicketId)
                        }
                    }).catch(() => { /* panelTicketId column may not exist yet */ });
                }

                return { success: true, panelTicketId };
            } else {
                console.log(`[TicketAutomation] Panel ticket sync failed for #${ticket.ticketNumber}: ${result?.error || 'Unknown error'}`);
                return { success: false, error: result?.error };
            }
        } catch (err) {
            console.log('[TicketAutomation] Panel sync failed:', err.message);
            await this._logTicketSync(ticket, panel, { success: false, error: err.message });
            return null;
        }
    }

    /**
     * Build message body for forwarding to panel
     */
    _buildTicketMessage(ticket) {
        const parts = [];
        if (ticket.category && ticket.category !== 'GENERAL') {
            parts.push(`Category: ${ticket.category}`);
        }
        if (ticket.orderExternalId) {
            parts.push(`Order ID: ${ticket.orderExternalId}`);
        }
        if (ticket.customerUsername) {
            parts.push(`Customer: ${ticket.customerUsername}`);
        }
        if (ticket.customerPhone) {
            parts.push(`Phone: ${ticket.customerPhone}`);
        }

        // Extract original customer message
        const messages = this.safeJSONParse(ticket.messages, []);
        const firstMsg = messages.find(m => m.type === 'CUSTOMER');
        if (firstMsg) {
            parts.push('');
            parts.push(firstMsg.content);
        }

        return parts.join('\n') || ticket.subject;
    }

    /**
     * Map internal priority to panel priority format
     */
    _mapPriority(priority) {
        const map = { LOW: 1, NORMAL: 2, HIGH: 3, URGENT: 4 };
        return map[priority] || 2;
    }

    /**
     * Log ticket sync attempt for audit trail (Section 11.3)
     */
    async _logTicketSync(ticket, panel, result) {
        try {
            // Use a generic logging approach — store in ticket messages as SYSTEM entry
            const messages = this.safeJSONParse(ticket.messages, []);
            messages.push({
                type: 'SYSTEM',
                content: result?.success
                    ? `✅ Ticket forwarded to panel "${panel.name}" (ID: ${result.data?.ticket_id || result.data?.id || 'N/A'})`
                    : `❌ Failed to forward to panel "${panel.name}": ${result?.error || 'Unknown error'}`,
                timestamp: new Date().toISOString()
            });

            await prisma.ticket.update({
                where: { id: ticket.id },
                data: { messages: JSON.stringify(messages) }
            });
        } catch (logErr) {
            console.warn('[TicketAutomation] Failed to log sync:', logErr.message);
        }
    }

    /**
     * Section 8.1: Forward ticket to provider WA/Telegram group
     * - Checks allowTicketAutoForward toggle
     * - Extracts order ID from ticket
     * - Forwards complaint details to provider group OR creates provider panel ticket
     * - Sends confirmation (handled elsewhere via auto-reply)
     */
    async forwardTicketToProvider(userId, ticket, originalData) {
        try {
            // Check if auto-forward is enabled for this user
            const botFeatureService = require('./botFeatureService');
            const toggles = await botFeatureService.getToggles(userId);
            if (!toggles.allowTicketAutoForward) {
                console.log(`[TicketAutomation] Auto-forward disabled for user ${userId}`);
                return null;
            }

            // Determine target provider from ticket context
            let providerName = null;

            // Try to find provider from associated order
            if (ticket.orderId || ticket.orderExternalId) {
                const order = ticket.orderId
                    ? await prisma.order.findUnique({ where: { id: ticket.orderId }, select: { providerName: true, panelId: true } })
                    : await prisma.order.findFirst({ where: { externalOrderId: ticket.orderExternalId, userId }, select: { providerName: true, panelId: true } });

                if (order?.providerName) {
                    providerName = order.providerName;
                }
            }

            // Find matching ProviderConfig for forwarding destination
            const noProviderValues = ['n/a', '0', 'none', 'manual', ''];
            const isManual = !providerName || noProviderValues.includes(providerName.toLowerCase());
            const searchNames = isManual ? ['MANUAL', 'manual', 'default'] : [providerName, 'MANUAL', 'default'];

            const providerConfig = await prisma.providerConfig.findFirst({
                where: {
                    userId,
                    providerName: { in: searchNames },
                    isActive: true
                }
            });

            if (!providerConfig) {
                console.log(`[TicketAutomation] No provider config found for ticket forward (provider: ${providerName || 'none'})`);
                return null;
            }

            // Build ticket notification message for provider group
            const ticketMsg = this._buildProviderTicketMessage(ticket, providerName);

            let sent = false;

            // Forward via WhatsApp (group or number)
            const targetJid = providerConfig.whatsappGroupJid
                ? (providerConfig.whatsappGroupJid.includes('@') ? providerConfig.whatsappGroupJid : `${providerConfig.whatsappGroupJid}@g.us`)
                : providerConfig.whatsappNumber
                    ? `${providerConfig.whatsappNumber.replace(/\D/g, '')}@s.whatsapp.net`
                    : null;

            if (targetJid) {
                let sendDeviceId = providerConfig.deviceId || null;

                if (!sendDeviceId) {
                    const connectedDevice = await prisma.device.findFirst({
                        where: { userId, status: 'connected' },
                        select: { id: true }
                    });
                    if (connectedDevice) sendDeviceId = connectedDevice.id;
                }

                if (sendDeviceId) {
                    try {
                        const groupForwardingService = require('./groupForwarding');
                        if (groupForwardingService.whatsappService) {
                            await groupForwardingService.whatsappService.sendMessage(sendDeviceId, targetJid, ticketMsg);
                            sent = true;
                            console.log(`[TicketAutomation] ✅ Ticket #${ticket.ticketNumber} forwarded to WA provider group`);
                        }
                    } catch (waErr) {
                        console.warn('[TicketAutomation] WA forward failed:', waErr.message);
                    }
                }
            }

            // Forward via Telegram if configured
            if (providerConfig.telegramChatId) {
                try {
                    const telegramService = require('./telegram');
                    const firstBot = await prisma.telegramBot.findFirst({
                        where: { userId, status: 'connected' },
                        select: { id: true },
                        orderBy: { createdAt: 'asc' }
                    });
                    if (firstBot) {
                        await telegramService.sendMessage(firstBot.id, providerConfig.telegramChatId, ticketMsg, { parseMode: undefined });
                        sent = true;
                        console.log(`[TicketAutomation] ✅ Ticket #${ticket.ticketNumber} forwarded to Telegram provider group`);
                    }
                } catch (tgErr) {
                    console.warn('[TicketAutomation] Telegram forward failed:', tgErr.message);
                }
            }

            // Log forwarding in ticket messages
            if (sent) {
                try {
                    const messages = this.safeJSONParse(ticket.messages, []);
                    messages.push({
                        type: 'SYSTEM',
                        content: `📤 Ticket auto-forwarded to provider group "${providerConfig.alias || providerConfig.providerName}"`,
                        timestamp: new Date().toISOString()
                    });
                    await prisma.ticket.update({
                        where: { id: ticket.id },
                        data: { messages: JSON.stringify(messages) }
                    });
                } catch (_) { /* non-critical */ }
            }

            return { success: sent, provider: providerConfig.providerName };
        } catch (err) {
            console.warn('[TicketAutomation] forwardTicketToProvider error:', err.message);
            return null;
        }
    }

    /**
     * Build complaint message for provider group from ticket
     */
    _buildProviderTicketMessage(ticket, providerName) {
        const parts = [
            `🎫 *SUPPORT TICKET*`,
            ``,
            `📋 Ticket: #${ticket.ticketNumber}`,
            `📌 Subject: ${ticket.subject || 'Support Request'}`,
            `🏷️ Category: ${ticket.category || 'GENERAL'}`,
            `⚡ Priority: ${ticket.priority || 'NORMAL'}`
        ];

        if (ticket.orderExternalId) {
            parts.push(`📦 Order ID: ${ticket.orderExternalId}`);
        }
        if (providerName) {
            parts.push(`🔗 Provider: ${providerName}`);
        }
        if (ticket.customerUsername) {
            parts.push(`👤 Customer: ${ticket.customerUsername}`);
        }

        const messages = this.safeJSONParse(ticket.messages, []);
        const firstMsg = messages.find(m => m.type === 'CUSTOMER');
        if (firstMsg) {
            parts.push(``, `━━━━━━━━━━━━━━━`, `💬 *Message:*`, firstMsg.content);
        }

        parts.push(``, `📅 ${new Date().toLocaleString()}`);

        return parts.join('\n');
    }

    /**
     * Auto-assign ticket based on rules
     */
    async autoAssign(ticketId, userId) {
        // Future: implement round-robin or load-balanced assignment to staff
        // For now, just mark as assigned to the user/admin
        return prisma.ticket.update({
            where: { id: ticketId },
            data: {
                assignedAt: new Date()
            }
        });
    }

    /**
     * Send notification for ticket update
     * Routes through userNotificationService to charge wa_ticket_reply credits
     */
    async sendUpdateNotification(ticket, message) {
        if (!ticket.customerPhone) return;

        try {
            const userNotificationService = require('./userNotificationService');
            const fullMessage = `📋 *Ticket Update*\n\nTicket: #${ticket.ticketNumber}\n${message}`;
            await userNotificationService.sendNotification(
                ticket.userId,
                'wa_ticket_reply',
                ticket.customerPhone,
                fullMessage
            );
        } catch (error) {
            console.error('[TicketAutomation] Notification failed:', error.message);
        }
    }

    /**
     * Get auto-reply for ticket creation
     */
    getCreationReply(ticket) {
        return `✅ *Ticket Created*\n\n📋 Ticket Number: *#${ticket.ticketNumber}*\n📝 Subject: ${ticket.subject}\n📊 Priority: ${ticket.priority}\n\nWe will respond to your request shortly. You can check status by replying with:\n*STATUS ${ticket.ticketNumber}*`;
    }

    // ==================== HELPER METHODS ====================

    /**
     * Generate unique ticket number
     */
    async generateTicketNumber(userId) {
        const date = new Date();
        const prefix = `T${date.getFullYear().toString().slice(-2)}${(date.getMonth() + 1).toString().padStart(2, '0')}`;

        // Get count for today
        const startOfDay = new Date(date.setHours(0, 0, 0, 0));
        const count = await prisma.ticket.count({
            where: {
                userId,
                createdAt: { gte: startOfDay }
            }
        });

        return `${prefix}-${(count + 1).toString().padStart(4, '0')}`;
    }

    /**
     * Calculate average resolution time
     */
    async calculateAvgResolutionTime(userId) {
        const resolved = await prisma.ticket.findMany({
            where: {
                userId,
                status: { in: ['RESOLVED', 'CLOSED'] },
                resolvedAt: { not: null }
            },
            select: { createdAt: true, resolvedAt: true }
        });

        if (resolved.length === 0) return null;

        const totalHours = resolved.reduce((sum, t) => {
            const diff = new Date(t.resolvedAt) - new Date(t.createdAt);
            return sum + (diff / (1000 * 60 * 60));
        }, 0);

        return Math.round(totalHours / resolved.length * 10) / 10; // Hours, 1 decimal
    }

    /**
     * Parse ticket JSON fields
     */
    parseTicket(ticket) {
        return {
            ...ticket,
            messages: this.safeJSONParse(ticket.messages, [])
        };
    }

    /**
     * Safe JSON parse
     */
    safeJSONParse(str, defaultValue = null) {
        try {
            return JSON.parse(str || '[]');
        } catch {
            return defaultValue;
        }
    }
}

module.exports = new TicketAutomationService();
