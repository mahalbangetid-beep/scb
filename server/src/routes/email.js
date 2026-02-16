const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { successResponse, createdResponse } = require('../utils/response');
const emailService = require('../services/emailService');

router.use(authenticate);
router.use(requireAdmin);

// ==================== EMAIL TEMPLATES ====================

// GET /api/admin/email/templates — List all templates
router.get('/templates', async (req, res, next) => {
    try {
        const templates = await prisma.emailTemplate.findMany({
            orderBy: { slug: 'asc' }
        });
        successResponse(res, templates);
    } catch (err) {
        next(err);
    }
});

// GET /api/admin/email/templates/:id — Get single template
router.get('/templates/:id', async (req, res, next) => {
    try {
        const template = await prisma.emailTemplate.findUnique({
            where: { id: req.params.id }
        });
        if (!template) return res.status(404).json({ success: false, error: { message: 'Template not found' } });
        successResponse(res, template);
    } catch (err) {
        next(err);
    }
});

// PUT /api/admin/email/templates/:id — Update template
router.put('/templates/:id', async (req, res, next) => {
    try {
        const { name, subject, body, description, variables, isActive } = req.body;
        const template = await prisma.emailTemplate.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(subject !== undefined && { subject }),
                ...(body !== undefined && { body }),
                ...(description !== undefined && { description }),
                ...(variables !== undefined && { variables }),
                ...(isActive !== undefined && { isActive })
            }
        });
        successResponse(res, template);
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/email/templates — Create new template
router.post('/templates', async (req, res, next) => {
    try {
        const { slug, name, subject, body, description, variables } = req.body;
        if (!slug || !name || !subject || !body) {
            return res.status(400).json({ success: false, error: { message: 'slug, name, subject, and body are required' } });
        }
        const template = await prisma.emailTemplate.create({
            data: { slug, name, subject, body, description, variables: variables || [] }
        });
        createdResponse(res, template, 'Template created');
    } catch (err) {
        if (err.code === 'P2002') {
            return res.status(400).json({ success: false, error: { message: 'Template slug already exists' } });
        }
        next(err);
    }
});

// DELETE /api/admin/email/templates/:id — Delete template
router.delete('/templates/:id', async (req, res, next) => {
    try {
        await prisma.emailTemplate.delete({ where: { id: req.params.id } });
        successResponse(res, null, 'Template deleted');
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/email/templates/:id/toggle — Toggle active status
router.post('/templates/:id/toggle', async (req, res, next) => {
    try {
        const template = await prisma.emailTemplate.findUnique({ where: { id: req.params.id } });
        if (!template) return res.status(404).json({ success: false, error: { message: 'Not found' } });
        const updated = await prisma.emailTemplate.update({
            where: { id: req.params.id },
            data: { isActive: !template.isActive }
        });
        successResponse(res, updated);
    } catch (err) {
        next(err);
    }
});

// ==================== EMAIL TEST & LOGS ====================

// POST /api/admin/email/test-connection — Test SMTP connection
router.post('/test-connection', async (req, res, next) => {
    try {
        const result = await emailService.testConnection();
        successResponse(res, result);
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/email/send-test — Send a test email
router.post('/send-test', async (req, res, next) => {
    try {
        const { to, templateId } = req.body;
        if (!to) return res.status(400).json({ success: false, error: { message: 'Recipient email required' } });

        if (templateId) {
            const template = await prisma.emailTemplate.findUnique({ where: { id: templateId } });
            if (!template) return res.status(404).json({ success: false, error: { message: 'Template not found' } });

            // Build sample variables (handle both array and stringified array)
            const sampleVars = {};
            let vars = template.variables;
            if (typeof vars === 'string') { try { vars = JSON.parse(vars); } catch (e) { vars = []; } }
            if (!Array.isArray(vars)) vars = [];
            vars.forEach(v => {
                sampleVars[v] = `[SAMPLE_${v.toUpperCase()}]`;
            });
            sampleVars.username = sampleVars.username || 'TestUser';
            sampleVars.amount = sampleVars.amount || '10.00';
            sampleVars.platformName = sampleVars.platformName || (process.env.SMTP_FROM_NAME || 'SMMChatBot');
            sampleVars.dashboardUrl = sampleVars.dashboardUrl || (process.env.FRONTEND_URL || 'http://localhost:5173');
            sampleVars.topupUrl = sampleVars.topupUrl || ((process.env.FRONTEND_URL || 'http://localhost:5173') + '/wallet');
            sampleVars.date = new Date().toLocaleDateString();

            const result = await emailService.sendTemplateEmail(template.slug, to, sampleVars);
            return successResponse(res, result);
        }

        // Plain test email
        const result = await emailService.sendDirectEmail(
            to,
            'Test Email — SMMChatBot',
            '<h2>Test Email ✅</h2><p>If you received this, your SMTP configuration is working correctly!</p><p>Sent at: ' + new Date().toISOString() + '</p>'
        );
        successResponse(res, result);
    } catch (err) {
        next(err);
    }
});

// GET /api/admin/email/logs — Get email logs
router.get('/logs', async (req, res, next) => {
    try {
        const { page = 1, limit = 20, status, template } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const where = {};
        if (status) where.status = status;
        if (template) where.template = template;

        const [logs, total] = await Promise.all([
            prisma.emailLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take,
                include: {
                    user: { select: { id: true, username: true, name: true, email: true } }
                }
            }),
            prisma.emailLog.count({ where })
        ]);

        successResponse(res, {
            logs,
            pagination: {
                page: parseInt(page),
                limit: take,
                total,
                pages: Math.ceil(total / take)
            }
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/admin/email/stats — Email statistics
router.get('/stats', async (req, res, next) => {
    try {
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);

        const [totalSent, totalFailed, sentToday, templateCount] = await Promise.all([
            prisma.emailLog.count({ where: { status: 'sent' } }),
            prisma.emailLog.count({ where: { status: 'failed' } }),
            prisma.emailLog.count({ where: { status: 'sent', createdAt: { gte: today } } }),
            prisma.emailTemplate.count()
        ]);

        successResponse(res, { totalSent, totalFailed, sentToday, templateCount });
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/email/seed — Seed default templates
router.post('/seed', async (req, res, next) => {
    try {
        await emailService.seedDefaultTemplates();
        const templates = await prisma.emailTemplate.findMany({ orderBy: { slug: 'asc' } });
        successResponse(res, { templates });
    } catch (err) {
        next(err);
    }
});

// GET /api/admin/email/smtp-status — Check if SMTP is configured
router.get('/smtp-status', async (req, res) => {
    const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    successResponse(res, {
        configured,
        host: process.env.SMTP_HOST || null,
        port: process.env.SMTP_PORT || '587',
        secure: process.env.SMTP_SECURE === 'true',
        fromName: process.env.SMTP_FROM_NAME || 'SMMChatBot',
        fromEmail: process.env.SMTP_FROM_EMAIL || 'noreply@example.com'
    });
});

module.exports = router;
