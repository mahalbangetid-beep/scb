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
}

module.exports = new InvoiceService();
