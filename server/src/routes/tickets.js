/**
 * Ticket Routes
 * 
 * API endpoints for ticket management
 * Phase 4: Rule-Based Bot Control - Ticket Page Automation
 */

const express = require('express');
const router = express.Router();
const ticketService = require('../services/ticketAutomationService');
const { authenticate } = require('../middleware/auth');
const { successResponse, createdResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/tickets/staff/all
 * Staff: Get all tickets from users they manage
 * Requires support permission
 */
router.get('/staff/all', async (req, res, next) => {
    try {
        const prismaClient = require('../utils/prisma');

        // Check if user is staff with support permission
        if (req.user.role !== 'STAFF' && req.user.role !== 'ADMIN' && req.user.role !== 'MASTER_ADMIN') {
            throw new AppError('Not authorized', 403);
        }

        let targetUserIds = [];

        if (req.user.role === 'ADMIN' || req.user.role === 'MASTER_ADMIN') {
            // Admins see all tickets — no userId filter
            targetUserIds = null;
        } else {
            // Staff: find which users they manage (from staffPermissions)
            const perms = await prismaClient.staffPermission.findMany({
                where: { staffId: req.user.id, permission: 'support' },
                select: { userId: true }
            });

            if (perms.length === 0) {
                throw new AppError('No support permission', 403);
            }

            // Get user IDs this staff can manage
            targetUserIds = perms.map(p => p.userId).filter(Boolean);
            // If any permission has null userId, it means all users
            if (perms.some(p => !p.userId)) {
                targetUserIds = null;
            }
        }

        const { status, category, priority, search, limit, offset } = req.query;

        const where = {};
        if (targetUserIds) {
            where.userId = { in: targetUserIds };
        }
        if (status) where.status = status;
        if (category) where.category = category;
        if (priority) where.priority = priority;
        if (search) {
            where.OR = [
                { ticketNumber: { contains: search } },
                { subject: { contains: search, mode: 'insensitive' } },
                { customerUsername: { contains: search, mode: 'insensitive' } }
            ];
        }

        const tickets = await prismaClient.ticket.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit) || 50,
            skip: parseInt(offset) || 0
        });

        const total = await prismaClient.ticket.count({ where });

        successResponse(res, {
            tickets: tickets.map(t => ticketService.parseTicket(t)),
            total,
            isStaffView: true
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/tickets
 * Get tickets for current user
 */
router.get('/', async (req, res, next) => {
    try {
        const { status, category, priority, search, limit, offset } = req.query;

        const options = {};
        if (status) options.status = status;
        if (category) options.category = category;
        if (priority) options.priority = priority;
        if (search) options.search = search;
        if (limit) options.limit = parseInt(limit);
        if (offset) options.offset = parseInt(offset);

        const tickets = await ticketService.getTickets(req.user.id, options);
        successResponse(res, tickets);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/tickets/stats
 * Get ticket statistics
 */
router.get('/stats', async (req, res, next) => {
    try {
        const stats = await ticketService.getStats(req.user.id);
        successResponse(res, stats);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/tickets/open-count
 * Get count of open tickets
 */
router.get('/open-count', async (req, res, next) => {
    try {
        const count = await ticketService.getOpenCount(req.user.id);
        successResponse(res, { count });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/tickets/number/:ticketNumber
 * Get ticket by number
 * NOTE: Must be before /:id route
 */
router.get('/number/:ticketNumber', async (req, res, next) => {
    try {
        const ticket = await ticketService.getByNumber(req.params.ticketNumber, req.user.id);

        if (!ticket) {
            throw new AppError('Ticket not found', 404);
        }

        successResponse(res, ticket);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/tickets/customer/:phone
 * Get tickets by customer phone
 * NOTE: Must be before /:id route
 */
router.get('/customer/:phone', async (req, res, next) => {
    try {
        const tickets = await ticketService.getByCustomerPhone(
            req.user.id,
            req.params.phone
        );

        successResponse(res, tickets);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/tickets/:id
 * Get single ticket
 * NOTE: This MUST be after all named routes like /stats, /number/:x, /customer/:x
 */
router.get('/:id', async (req, res, next) => {
    try {
        const ticket = await ticketService.getById(req.params.id, req.user.id);

        if (!ticket) {
            throw new AppError('Ticket not found', 404);
        }

        successResponse(res, ticket);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/tickets
 * Create a new ticket
 */
router.post('/', async (req, res, next) => {
    try {
        const ticket = await ticketService.createFromMessage(req.user.id, req.body);
        createdResponse(res, ticketService.parseTicket(ticket), 'Ticket created');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/tickets/:id/reply
 * Add reply to ticket
 */
router.post('/:id/reply', async (req, res, next) => {
    try {
        const { content } = req.body;

        if (!content) {
            throw new AppError('Reply content is required', 400);
        }

        // Determine type based on user role, not user input
        const replyType = ['STAFF', 'ADMIN', 'MASTER_ADMIN'].includes(req.user.role)
            ? 'STAFF'
            : 'CUSTOMER';

        const ticket = await ticketService.addReply(
            req.params.id,
            req.user.id,
            content,
            replyType
        );

        // Send email notification only for staff replies (don't notify owner about their own replies)
        if (replyType === 'STAFF') {
            try {
                const emailService = require('../services/emailService');
                const prisma = require('../utils/prisma');
                const ticketOwner = await prisma.user.findUnique({
                    where: { id: ticket.userId },
                    select: { email: true, username: true }
                });
                if (ticketOwner && ticketOwner.email) {
                    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
                    emailService.sendTemplateEmail('ticket_reply', ticketOwner.email, {
                        username: ticketOwner.username,
                        ticketSubject: ticket.subject || `Ticket #${ticket.ticketNumber}`,
                        replyContent: content,
                        ticketUrl: `${frontendUrl}/tickets`
                    }, ticket.userId).catch(() => { });
                }
            } catch (e) { /* email is non-critical */ }
        }

        successResponse(res, ticketService.parseTicket(ticket), 'Reply added');
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/tickets/:id/status
 * Update ticket status
 */
router.put('/:id/status', async (req, res, next) => {
    try {
        const { status, note } = req.body;

        if (!status) {
            throw new AppError('Status is required', 400);
        }

        // Verify ownership or staff role
        const isStaff = ['STAFF', 'ADMIN', 'MASTER_ADMIN'].includes(req.user.role);
        const existing = await ticketService.getById(req.params.id, req.user.id);
        if (!existing && !isStaff) {
            throw new AppError('Ticket not found', 404);
        }

        const ticket = await ticketService.updateStatus(
            req.params.id,
            req.user.id,
            status,
            note
        );

        successResponse(res, ticketService.parseTicket(ticket), 'Status updated');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/tickets/:id/resolve
 * Resolve ticket
 */
router.post('/:id/resolve', async (req, res, next) => {
    try {
        const { note } = req.body;

        // Verify ownership or staff role
        const isStaff = ['STAFF', 'ADMIN', 'MASTER_ADMIN'].includes(req.user.role);
        const existing = await ticketService.getById(req.params.id, req.user.id);
        if (!existing && !isStaff) {
            throw new AppError('Ticket not found', 404);
        }

        const ticket = await ticketService.updateStatus(
            req.params.id,
            req.user.id,
            'RESOLVED',
            note || 'Ticket resolved'
        );

        successResponse(res, ticketService.parseTicket(ticket), 'Ticket resolved');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/tickets/:id/close
 * Close ticket
 */
router.post('/:id/close', async (req, res, next) => {
    try {
        // Verify ownership or staff role
        const isStaff = ['STAFF', 'ADMIN', 'MASTER_ADMIN'].includes(req.user.role);
        const existing = await ticketService.getById(req.params.id, req.user.id);
        if (!existing && !isStaff) {
            throw new AppError('Ticket not found', 404);
        }

        const ticket = await ticketService.updateStatus(
            req.params.id,
            req.user.id,
            'CLOSED',
            'Ticket closed'
        );

        successResponse(res, ticketService.parseTicket(ticket), 'Ticket closed');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/tickets/:id/reopen
 * Reopen a closed ticket
 */
router.post('/:id/reopen', async (req, res, next) => {
    try {
        // Verify ownership or staff role
        const isStaff = ['STAFF', 'ADMIN', 'MASTER_ADMIN'].includes(req.user.role);
        const existing = await ticketService.getById(req.params.id, req.user.id);
        if (!existing && !isStaff) {
            throw new AppError('Ticket not found', 404);
        }

        const ticket = await ticketService.updateStatus(
            req.params.id,
            req.user.id,
            'OPEN',
            'Ticket reopened'
        );

        successResponse(res, ticketService.parseTicket(ticket), 'Ticket reopened');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/tickets/:id/notify
 * Send notification to customer
 */
router.post('/:id/notify', async (req, res, next) => {
    try {
        // Only staff/admin can send notifications
        if (!['STAFF', 'ADMIN', 'MASTER_ADMIN'].includes(req.user.role)) {
            throw new AppError('Only staff and admins can send notifications', 403);
        }

        const { message } = req.body;

        if (!message) {
            throw new AppError('Message is required', 400);
        }

        const ticket = await ticketService.getById(req.params.id, req.user.id);

        if (!ticket) {
            throw new AppError('Ticket not found', 404);
        }

        await ticketService.sendUpdateNotification(ticket, message);

        successResponse(res, null, 'Notification sent');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
