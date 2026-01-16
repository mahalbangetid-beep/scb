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

        // This would call the panel's ticket API if supported
        // Implementation depends on panel API structure
        console.log(`[TicketAutomation] Would sync ticket #${ticket.ticketNumber} to panel ${panel.name}`);

        return null;
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
     */
    async sendUpdateNotification(ticket, message) {
        if (!ticket.customerPhone) return;

        // Use WhatsApp service to send notification
        try {
            const whatsAppService = require('./whatsapp');
            const device = await prisma.device.findFirst({
                where: { userId: ticket.userId, status: 'CONNECTED' }
            });

            if (device) {
                await whatsAppService.sendMessage(
                    device.id,
                    ticket.customerPhone,
                    `📋 *Ticket Update*\n\nTicket: #${ticket.ticketNumber}\n${message}`
                );
            }
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
