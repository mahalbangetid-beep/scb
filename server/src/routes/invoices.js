/**
 * Invoice Routes
 * GET /api/invoices — list user invoices
 * GET /api/invoices/:id — get single invoice
 * GET /api/invoices/:id/download — download invoice as HTML (printable)
 * GET /api/invoices/admin/all — admin: list all invoices
 * GET /api/invoices/admin/stats — admin: invoice stats
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const invoiceService = require('../services/invoiceService');

// GET /api/invoices — list user invoices
router.get('/', authenticate, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const result = await invoiceService.getUserInvoices(req.user.id, {
            page: parseInt(page),
            limit: parseInt(limit)
        });

        res.json({
            success: true,
            data: result.invoices,
            pagination: {
                page: result.page,
                limit: result.limit,
                total: result.total,
                totalPages: Math.ceil(result.total / result.limit)
            }
        });
    } catch (error) {
        console.error('[Invoices] List error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/invoices/admin/all — admin: list all invoices
router.get('/admin/all', authenticate, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, userId, status } = req.query;
        const result = await invoiceService.getAllInvoices({
            page: parseInt(page),
            limit: parseInt(limit),
            userId,
            status
        });

        res.json({
            success: true,
            data: result.invoices,
            pagination: {
                page: result.page,
                limit: result.limit,
                total: result.total,
                totalPages: Math.ceil(result.total / result.limit)
            }
        });
    } catch (error) {
        console.error('[Invoices] Admin list error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/invoices/admin/stats — admin: invoice statistics
router.get('/admin/stats', authenticate, requireAdmin, async (req, res) => {
    try {
        const stats = await invoiceService.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('[Invoices] Stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/invoices/:id — get single invoice
router.get('/:id', authenticate, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'MASTER_ADMIN' || req.user.role === 'ADMIN';
        const invoice = await invoiceService.getInvoice(
            req.params.id,
            isAdmin ? null : req.user.id
        );

        if (!invoice) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        res.json({ success: true, data: invoice });
    } catch (error) {
        console.error('[Invoices] Get error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/invoices/:id/download-token — generate short-lived download token
router.post('/:id/download-token', authenticate, async (req, res, next) => {
    try {
        const jwt = require('jsonwebtoken');
        // Generate a short-lived token scoped for download only (5 min expiry)
        const downloadToken = jwt.sign(
            { userId: req.user.id, purpose: 'invoice_download', invoiceId: req.params.id },
            process.env.JWT_SECRET,
            { expiresIn: '5m' }
        );
        res.json({ success: true, data: { token: downloadToken } });
    } catch (error) {
        next(error);
    }
});

// GET /api/invoices/:id/download — download invoice as printable HTML
// Uses a short-lived download token because this opens in a new browser tab
router.get('/:id/download', async (req, res) => {
    try {
        const jwt = require('jsonwebtoken');
        const prisma = require('../utils/prisma');

        // Get token from query or header
        let token = req.query.token;
        if (!token && req.headers.authorization) {
            token = req.headers.authorization.replace('Bearer ', '');
        }

        if (!token) {
            return res.status(401).json({ success: false, error: 'No token provided' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtErr) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        // Support both full session tokens (userId) and scoped download tokens (id + purpose)
        const userId = decoded.userId || decoded.id;

        // Verify scoped download token matches this specific invoice
        if (decoded.purpose === 'invoice_download' && decoded.invoiceId !== req.params.id) {
            return res.status(403).json({ success: false, error: 'Token not valid for this invoice' });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        const isAdmin = user.role === 'MASTER_ADMIN' || user.role === 'ADMIN';
        const invoice = await invoiceService.getInvoice(
            req.params.id,
            isAdmin ? null : user.id
        );

        if (!invoice) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        const html = invoiceService.generateInvoiceHTML(invoice);

        // Sanitize filename
        const safeFilename = (invoice.invoiceNumber || 'invoice').replace(/[^a-zA-Z0-9\-]/g, '_');
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `inline; filename="${safeFilename}.html"`);
        res.send(html);
    } catch (error) {
        console.error('[Invoices] Download error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

