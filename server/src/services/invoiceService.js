/**
 * Invoice Service
 * Auto-generate invoices when payments are completed
 * HTML generation for download
 */

const prisma = require('../utils/prisma');

/**
 * Escape HTML entities to prevent XSS
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

class InvoiceService {
    /**
     * Generate next invoice number in format INV-YYYYMM-XXXX
     */
    async generateInvoiceNumber() {
        const now = new Date();
        const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const prefix = `INV-${yearMonth}-`;

        // Find the last invoice for this month
        const lastInvoice = await prisma.invoice.findFirst({
            where: {
                invoiceNumber: { startsWith: prefix }
            },
            orderBy: { invoiceNumber: 'desc' }
        });

        let nextNumber = 1;
        if (lastInvoice) {
            const lastNum = parseInt(lastInvoice.invoiceNumber.split('-').pop(), 10);
            nextNumber = (lastNum || 0) + 1;
        }

        return `${prefix}${String(nextNumber).padStart(4, '0')}`;
    }

    /**
     * Create invoice from a completed payment
     * @param {Object} params - { paymentId, userId, amount, currency, method, description, metadata }
     * @returns {Object} Created invoice
     */
    async createFromPayment(params) {
        const { paymentId, userId, amount, currency = 'USD', method, description, metadata } = params;

        // Check if invoice already exists for this payment
        if (paymentId) {
            const existing = await prisma.invoice.findUnique({
                where: { paymentId }
            });
            if (existing) {
                console.log(`[Invoice] Invoice already exists for payment ${paymentId}: ${existing.invoiceNumber}`);
                return existing;
            }
        }

        // Build line items
        const items = JSON.stringify([{
            description: description || `Credit Top-Up via ${method || 'Payment'}`,
            amount: amount,
            quantity: 1
        }]);

        // Retry loop to handle race condition on invoice number
        const MAX_RETRIES = 3;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const invoiceNumber = await this.generateInvoiceNumber();

                const invoice = await prisma.invoice.create({
                    data: {
                        invoiceNumber,
                        userId,
                        paymentId: paymentId || null,
                        amount,
                        currency,
                        items,
                        status: 'PAID',
                        method: method || 'UNKNOWN',
                        paidAt: new Date(),
                        metadata: metadata ? JSON.stringify(metadata) : null
                    }
                });

                console.log(`[Invoice] Created ${invoiceNumber} for user ${userId} — $${amount} via ${method}`);
                return invoice;
            } catch (err) {
                // P2002 = unique constraint violation (duplicate invoice number)
                if (err.code === 'P2002' && attempt < MAX_RETRIES - 1) {
                    console.warn(`[Invoice] Duplicate invoice number, retrying (attempt ${attempt + 1})...`);
                    continue;
                }
                throw err;
            }
        }
    }

    /**
     * Get invoices for a user (paginated)
     */
    async getUserInvoices(userId, { page = 1, limit = 20 } = {}) {
        const skip = (page - 1) * limit;

        const [invoices, total] = await Promise.all([
            prisma.invoice.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    payment: {
                        select: {
                            id: true,
                            reference: true,
                            transactionId: true,
                            method: true,
                            status: true
                        }
                    }
                }
            }),
            prisma.invoice.count({ where: { userId } })
        ]);

        // Parse items JSON
        const parsed = invoices.map(inv => ({
            ...inv,
            items: this.safeParseJSON(inv.items, []),
            metadata: this.safeParseJSON(inv.metadata, null)
        }));

        return { invoices: parsed, total, page, limit };
    }

    /**
     * Get all invoices (admin)
     */
    async getAllInvoices({ page = 1, limit = 20, userId, status } = {}) {
        const skip = (page - 1) * limit;
        const where = {};
        if (userId) where.userId = userId;
        if (status) where.status = status;

        const [invoices, total] = await Promise.all([
            prisma.invoice.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    user: {
                        select: { id: true, username: true, email: true, name: true }
                    },
                    payment: {
                        select: {
                            id: true,
                            reference: true,
                            transactionId: true,
                            method: true,
                            status: true
                        }
                    }
                }
            }),
            prisma.invoice.count({ where })
        ]);

        const parsed = invoices.map(inv => ({
            ...inv,
            items: this.safeParseJSON(inv.items, []),
            metadata: this.safeParseJSON(inv.metadata, null)
        }));

        return { invoices: parsed, total, page, limit };
    }

    /**
     * Get single invoice by ID (with permission check)
     */
    async getInvoice(invoiceId, userId = null) {
        const where = { id: invoiceId };
        if (userId) where.userId = userId; // Scope to user unless admin

        const invoice = await prisma.invoice.findFirst({
            where,
            include: {
                user: {
                    select: { id: true, username: true, email: true, name: true }
                },
                payment: {
                    select: {
                        id: true,
                        reference: true,
                        transactionId: true,
                        method: true,
                        status: true,
                        completedAt: true
                    }
                }
            }
        });

        if (!invoice) return null;

        return {
            ...invoice,
            items: this.safeParseJSON(invoice.items, []),
            metadata: this.safeParseJSON(invoice.metadata, null)
        };
    }

    /**
     * Generate HTML invoice for PDF conversion
     */
    generateInvoiceHTML(invoice) {
        const items = Array.isArray(invoice.items) ? invoice.items : this.safeParseJSON(invoice.items, []);
        const user = invoice.user || {};

        const itemRows = items.map(item => `
            <tr>
                <td style="padding:10px 15px; border-bottom:1px solid #eee;">${escapeHtml(item.description || 'Credit Top-Up')}</td>
                <td style="padding:10px 15px; border-bottom:1px solid #eee; text-align:center;">${parseInt(item.quantity) || 1}</td>
                <td style="padding:10px 15px; border-bottom:1px solid #eee; text-align:right;">$${(parseFloat(item.amount) || 0).toFixed(2)}</td>
            </tr>
        `).join('');

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; background: #fff; }
        .invoice { max-width: 800px; margin: 0 auto; padding: 40px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #6c5ce7; padding-bottom: 20px; }
        .brand h1 { font-size: 28px; color: #6c5ce7; margin-bottom: 5px; }
        .brand p { color: #888; font-size: 13px; }
        .invoice-info { text-align: right; }
        .invoice-info h2 { font-size: 22px; color: #333; margin-bottom: 8px; }
        .invoice-info p { color: #666; font-size: 14px; line-height: 1.6; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        .badge-paid { background: #d4edda; color: #155724; }
        .badge-void { background: #f8d7da; color: #721c24; }
        .parties { display: flex; justify-content: space-between; margin-bottom: 30px; }
        .party { width: 48%; }
        .party h3 { font-size: 12px; text-transform: uppercase; color: #888; margin-bottom: 8px; letter-spacing: 1px; }
        .party p { font-size: 14px; line-height: 1.6; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        thead th { background: #6c5ce7; color: #fff; padding: 12px 15px; text-align: left; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
        thead th:last-child { text-align: right; }
        thead th:nth-child(2) { text-align: center; }
        .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #6c5ce7; padding: 15px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; }
    </style>
</head>
<body>
    <div class="invoice">
        <div class="header">
            <div class="brand">
                <h1>DICREWA</h1>
                <p>SMM Automation Platform</p>
            </div>
            <div class="invoice-info">
                <h2>${escapeHtml(invoice.invoiceNumber)}</h2>
                <p>
                    Date: ${new Date(invoice.paidAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}<br>
                    Status: <span class="badge badge-${invoice.status === 'PAID' ? 'paid' : 'void'}">${escapeHtml(invoice.status)}</span>
                </p>
            </div>
        </div>

        <div class="parties">
            <div class="party">
                <h3>From</h3>
                <p>
                    <strong>DICREWA Platform</strong><br>
                    SMM Automation Services<br>
                    support@dicrewa.com
                </p>
            </div>
            <div class="party">
                <h3>Bill To</h3>
                <p>
                    <strong>${escapeHtml(user.name || user.username || 'Customer')}</strong><br>
                    ${escapeHtml(user.email || '')}<br>
                    @${escapeHtml(user.username || '')}
                </p>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Amount</th>
                </tr>
            </thead>
            <tbody>
                ${itemRows}
                <tr class="total-row">
                    <td colspan="2" style="text-align:right; padding-right:15px;">Total</td>
                    <td style="text-align:right; padding-right:15px;">$${(parseFloat(invoice.amount) || 0).toFixed(2)} ${escapeHtml(invoice.currency)}</td>
                </tr>
            </tbody>
        </table>

        <p style="color:#666; font-size:13px; margin-bottom:5px;"><strong>Payment Method:</strong> ${escapeHtml(invoice.method || 'N/A')}</p>
        ${invoice.notes ? `<p style="color:#666; font-size:13px;"><strong>Notes:</strong> ${escapeHtml(invoice.notes)}</p>` : ''}

        <div class="footer">
            <p>Thank you for your payment! This invoice was generated automatically.</p>
            <p style="margin-top:5px;">DICREWA — SMM Automation Platform</p>
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Generate a proper PDF invoice using pdfmake
     * @param {Object} invoice - Invoice object with items, user, etc.
     * @returns {Promise<Buffer>} PDF buffer
     */
    async generateInvoicePDF(invoice) {
        const pdfmake = require('pdfmake');
        const fs = require('fs');
        const path = require('path');
        const items = Array.isArray(invoice.items) ? invoice.items : this.safeParseJSON(invoice.items, []);
        const user = invoice.user || {};

        // Load template config from DB (cached)
        const tpl = await this._getTemplateConfig();

        // Register fonts once (pdfmake v0.3.x API)
        if (!this._fontsRegistered) {
            const pdfmakeRoot = path.join(path.dirname(require.resolve('pdfmake')), '..');
            const fontDir = path.join(pdfmakeRoot, 'fonts', 'Roboto');

            // Load font buffers into virtual filesystem
            pdfmake.virtualfs.storage['Roboto-Regular.ttf'] = fs.readFileSync(path.join(fontDir, 'Roboto-Regular.ttf'));
            pdfmake.virtualfs.storage['Roboto-Medium.ttf'] = fs.readFileSync(path.join(fontDir, 'Roboto-Medium.ttf'));
            pdfmake.virtualfs.storage['Roboto-Italic.ttf'] = fs.readFileSync(path.join(fontDir, 'Roboto-Italic.ttf'));
            pdfmake.virtualfs.storage['Roboto-MediumItalic.ttf'] = fs.readFileSync(path.join(fontDir, 'Roboto-MediumItalic.ttf'));

            pdfmake.setFonts({
                Roboto: {
                    normal: 'Roboto-Regular.ttf',
                    bold: 'Roboto-Medium.ttf',
                    italics: 'Roboto-Italic.ttf',
                    bolditalics: 'Roboto-MediumItalic.ttf'
                }
            });

            // Suppress URL access policy warning
            pdfmake.setUrlAccessPolicy(() => false);
            this._fontsRegistered = true;
        }

        const PRIMARY = tpl.accentColor || '#6c5ce7';
        const dateStr = new Date(invoice.paidAt).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        // Build item rows for table
        const tableBody = [
            // Header row
            [
                { text: 'Description', style: 'tableHeader' },
                { text: 'Qty', style: 'tableHeader', alignment: 'center' },
                { text: 'Amount', style: 'tableHeader', alignment: 'right' }
            ],
            // Item rows
            ...items.map((item, i) => [
                { text: item.description || 'Credit Top-Up', fontSize: 10, margin: [0, 6, 0, 6], fillColor: i % 2 === 0 ? '#f8f9fa' : null },
                { text: String(parseInt(item.quantity) || 1), fontSize: 10, alignment: 'center', margin: [0, 6, 0, 6], fillColor: i % 2 === 0 ? '#f8f9fa' : null },
                { text: `$${(parseFloat(item.amount) || 0).toFixed(2)}`, fontSize: 10, alignment: 'right', margin: [0, 6, 0, 6], fillColor: i % 2 === 0 ? '#f8f9fa' : null }
            ]),
            // Total row
            [
                { text: 'Total', colSpan: 2, alignment: 'right', bold: true, fontSize: 12, margin: [0, 8, 10, 8] },
                {},
                { text: `$${(parseFloat(invoice.amount) || 0).toFixed(2)} ${invoice.currency || 'USD'}`, bold: true, fontSize: 12, alignment: 'right', margin: [0, 8, 0, 8], color: PRIMARY }
            ]
        ];

        // Build FROM section details
        const fromStack = [
            { text: 'FROM', fontSize: 9, color: '#999', bold: true, margin: [0, 0, 0, 6] },
            { text: tpl.companyName || 'Company', fontSize: 11, bold: true },
        ];
        if (tpl.tagline) fromStack.push({ text: tpl.tagline, fontSize: 10, color: '#666', margin: [0, 2, 0, 0] });
        if (tpl.address) fromStack.push({ text: tpl.address, fontSize: 10, color: '#666', margin: [0, 2, 0, 0] });
        if (tpl.email) fromStack.push({ text: tpl.email, fontSize: 10, color: '#666', margin: [0, 2, 0, 0] });
        if (tpl.phone) fromStack.push({ text: tpl.phone, fontSize: 10, color: '#666', margin: [0, 2, 0, 0] });
        if (tpl.website) fromStack.push({ text: tpl.website, fontSize: 10, color: '#666', margin: [0, 2, 0, 0] });

        const docDefinition = {
            pageSize: 'A4',
            pageMargins: [50, 50, 50, 60],
            content: [
                // ─── HEADER ───
                {
                    columns: [
                        {
                            width: '*',
                            stack: [
                                { text: tpl.companyName || 'Invoice', fontSize: 26, bold: true, color: PRIMARY },
                                { text: tpl.tagline || '', fontSize: 10, color: '#999', margin: [0, 2, 0, 0] }
                            ]
                        },
                        {
                            width: 'auto',
                            stack: [
                                { text: 'INVOICE', fontSize: 22, bold: true, color: '#333', alignment: 'right' },
                                { text: invoice.invoiceNumber, fontSize: 11, color: '#666', alignment: 'right', margin: [0, 4, 0, 0] },
                                { text: dateStr, fontSize: 10, color: '#888', alignment: 'right', margin: [0, 2, 0, 0] }
                            ]
                        }
                    ]
                },
                // Divider
                {
                    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 3, lineColor: PRIMARY }],
                    margin: [0, 15, 0, 20]
                },
                // ─── STATUS BADGE ───
                {
                    columns: [
                        { width: '*', text: '' },
                        {
                            width: 'auto',
                            table: {
                                body: [[{
                                    text: ` ${invoice.status} `,
                                    fontSize: 9,
                                    bold: true,
                                    color: invoice.status === 'PAID' ? '#155724' : '#721c24',
                                    fillColor: invoice.status === 'PAID' ? '#d4edda' : '#f8d7da',
                                    margin: [8, 3, 8, 3]
                                }]]
                            },
                            layout: {
                                hLineWidth: () => 0,
                                vLineWidth: () => 0,
                                paddingLeft: () => 0, paddingRight: () => 0,
                                paddingTop: () => 0, paddingBottom: () => 0
                            }
                        }
                    ],
                    margin: [0, 0, 0, 20]
                },
                // ─── FROM / BILL TO ───
                {
                    columns: [
                        { width: '50%', stack: fromStack },
                        {
                            width: '50%',
                            stack: [
                                { text: 'BILL TO', fontSize: 9, color: '#999', bold: true, margin: [0, 0, 0, 6] },
                                { text: user.name || user.username || 'Customer', fontSize: 11, bold: true },
                                { text: user.email || '', fontSize: 10, color: '#666', margin: [0, 2, 0, 0] },
                                { text: `@${user.username || ''}`, fontSize: 10, color: '#666', margin: [0, 2, 0, 0] }
                            ]
                        }
                    ],
                    margin: [0, 0, 0, 25]
                },
                // ─── ITEMS TABLE ───
                {
                    table: {
                        headerRows: 1,
                        widths: ['*', 60, 80],
                        body: tableBody
                    },
                    layout: {
                        hLineWidth: (i, node) => {
                            if (i === 0 || i === 1) return 0;
                            if (i === node.table.body.length) return 2;
                            if (i === node.table.body.length - 1) return 2;
                            return 0.5;
                        },
                        vLineWidth: () => 0,
                        hLineColor: (i, node) => {
                            if (i === node.table.body.length || i === node.table.body.length - 1) return PRIMARY;
                            return '#eee';
                        },
                        paddingLeft: () => 10,
                        paddingRight: () => 10,
                        paddingTop: () => 0,
                        paddingBottom: () => 0
                    }
                },
                // ─── PAYMENT METHOD ───
                {
                    text: [
                        { text: 'Payment Method: ', bold: true, fontSize: 10, color: '#666' },
                        { text: invoice.method || 'N/A', fontSize: 10, color: '#333' }
                    ],
                    margin: [0, 20, 0, 0]
                },
                // Notes (if any)
                ...(invoice.notes ? [{
                    text: [
                        { text: 'Notes: ', bold: true, fontSize: 10, color: '#666' },
                        { text: invoice.notes, fontSize: 10, color: '#333' }
                    ],
                    margin: [0, 5, 0, 0]
                }] : []),
                // ─── FOOTER ───
                {
                    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.5, lineColor: '#ddd' }],
                    margin: [0, 35, 0, 10]
                },
                {
                    text: tpl.footerText || 'Thank you for your payment!',
                    alignment: 'center', fontSize: 11, color: '#888', margin: [0, 0, 0, 4]
                },
                {
                    text: tpl.footerSubtext || `This invoice was generated automatically by ${tpl.companyName || 'the platform'}.`,
                    alignment: 'center', fontSize: 9, color: '#aaa'
                }
            ],
            styles: {
                tableHeader: {
                    fontSize: 10,
                    bold: true,
                    color: '#ffffff',
                    fillColor: PRIMARY,
                    margin: [0, 8, 0, 8]
                }
            },
            defaultStyle: {
                font: 'Roboto'
            }
        };

        // Generate PDF as buffer (pdfmake v0.3.x async API)
        const doc = pdfmake.createPdf(docDefinition);
        const arrayBuffer = await doc.getBuffer();
        return Buffer.from(arrayBuffer);
    }

    /**
     * Get invoice stats for admin dashboard
     */
    async getStats() {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [totalInvoices, monthlyInvoices, totalRevenue, monthlyRevenue] = await Promise.all([
            prisma.invoice.count(),
            prisma.invoice.count({ where: { createdAt: { gte: startOfMonth } } }),
            prisma.invoice.aggregate({ _sum: { amount: true }, where: { status: 'PAID' } }),
            prisma.invoice.aggregate({ _sum: { amount: true }, where: { status: 'PAID', createdAt: { gte: startOfMonth } } })
        ]);

        return {
            totalInvoices,
            monthlyInvoices,
            totalRevenue: totalRevenue._sum.amount || 0,
            monthlyRevenue: monthlyRevenue._sum.amount || 0
        };
    }

    /**
     * Safely parse JSON
     */
    safeParseJSON(str, fallback = null) {
        if (!str) return fallback;
        try { return JSON.parse(str); } catch { return fallback; }
    }

    /**
     * Get invoice template config from DB (cached for 5 minutes)
     * @returns {Promise<Object>} Template config
     */
    async _getTemplateConfig() {
        const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

        // Return cached if valid
        if (this._templateConfig && this._templateCacheTime && (Date.now() - this._templateCacheTime < CACHE_TTL)) {
            return this._templateConfig;
        }

        const defaults = {
            companyName: 'DICREWA',
            tagline: 'SMM Automation Platform',
            address: '',
            phone: '',
            email: 'support@dicrewa.com',
            website: '',
            logoUrl: '',
            accentColor: '#6c5ce7',
            footerText: 'Thank you for your payment!',
            footerSubtext: 'This invoice was generated automatically.',
        };

        try {
            const config = await prisma.systemConfig.findUnique({
                where: { key: 'invoice_template' }
            });

            if (config) {
                this._templateConfig = { ...defaults, ...JSON.parse(config.value) };
            } else {
                this._templateConfig = defaults;
            }
        } catch {
            this._templateConfig = defaults;
        }

        this._templateCacheTime = Date.now();
        return this._templateConfig;
    }
}

module.exports = new InvoiceService();
