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
 * GET /api/tickets/:id
 * Get single ticket
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
 * GET /api/tickets/number/:ticketNumber
 * Get ticket by number
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
        const { content, type } = req.body;

        if (!content) {
            throw new AppError('Reply content is required', 400);
        }

        const ticket = await ticketService.addReply(
            req.params.id,
            req.user.id,
            content,
            type || 'STAFF'
        );

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
 * GET /api/tickets/customer/:phone
 * Get tickets by customer phone
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
 * POST /api/tickets/:id/notify
 * Send notification to customer
 */
router.post('/:id/notify', async (req, res, next) => {
    try {
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
