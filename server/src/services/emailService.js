const nodemailer = require('nodemailer');
const prisma = require('../utils/prisma');

// ── SMTP Transporter (lazy init) ──
let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        return null; // SMTP not configured
    }

    transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
    });

    return transporter;
}

// ── Template variable replacement ──
function renderTemplate(template, variables = {}) {
    let subject = template.subject;
    let body = template.body;

    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        subject = subject.replace(regex, value ?? '');
        body = body.replace(regex, value ?? '');
    }

    return { subject, body };
}

// ── Wrap body in a styled HTML layout ──
function wrapHtml(bodyContent) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #e2e8f0; }
        .container { max-width: 600px; margin: 0 auto; padding: 0; }
        .header { background: linear-gradient(135deg, #10b981, #059669); padding: 30px 40px; text-align: center; }
        .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
        .body { background: #1e293b; padding: 35px 40px; line-height: 1.7; font-size: 15px; }
        .body h2 { color: #10b981; margin-top: 0; font-size: 18px; }
        .body p { margin: 0 0 15px 0; color: #cbd5e1; }
        .body strong { color: #f1f5f9; }
        .info-box { background: #0f172a; border-left: 4px solid #10b981; padding: 16px 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .info-box .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
        .info-box .value { font-size: 18px; font-weight: 700; color: #10b981; }
        .btn { display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff !important; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 10px 0; }
        .footer { background: #0f172a; padding: 25px 40px; text-align: center; font-size: 12px; color: #475569; border-top: 1px solid #334155; }
        .footer a { color: #10b981; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${process.env.SMTP_FROM_NAME || 'SMMChatBot'}</h1>
        </div>
        <div class="body">
            ${bodyContent}
        </div>
        <div class="footer">
            <p>This is an automated message from ${process.env.SMTP_FROM_NAME || 'SMMChatBot'}.</p>
            <p>If you didn't expect this email, you can safely ignore it.</p>
        </div>
    </div>
</body>
</html>`;
}

// ── Send email using a template slug ──
async function sendTemplateEmail(slug, to, variables = {}, userId = null) {
    try {
        const mailer = getTransporter();
        if (!mailer) {
            console.log(`[Email] SMTP not configured, skipping email: ${slug} → ${to}`);
            return { success: false, reason: 'SMTP not configured' };
        }

        // Fetch template
        const template = await prisma.emailTemplate.findUnique({ where: { slug } });
        if (!template) {
            console.log(`[Email] Template not found: ${slug}`);
            return { success: false, reason: `Template "${slug}" not found` };
        }

        if (!template.isActive) {
            console.log(`[Email] Template disabled: ${slug}`);
            return { success: false, reason: 'Template disabled' };
        }

        // Render
        const { subject, body } = renderTemplate(template, variables);
        const html = wrapHtml(body);

        // Send
        const fromName = process.env.SMTP_FROM_NAME || 'SMMChatBot';
        const fromEmail = process.env.SMTP_FROM_EMAIL || 'noreply@example.com';

        await mailer.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to,
            subject,
            html
        });

        // Log success
        await prisma.emailLog.create({
            data: {
                userId,
                to,
                subject,
                template: slug,
                status: 'sent',
                metadata: variables
            }
        });

        console.log(`[Email] ✅ Sent "${slug}" to ${to}`);
        return { success: true };
    } catch (err) {
        console.error(`[Email] ❌ Failed "${slug}" to ${to}:`, err.message);

        // Log failure
        try {
            await prisma.emailLog.create({
                data: {
                    userId,
                    to,
                    subject: slug,
                    template: slug,
                    status: 'failed',
                    error: err.message,
                    metadata: variables
                }
            });
        } catch (logErr) {
            // Silently fail logging
        }

        return { success: false, reason: err.message };
    }
}

// ── Direct send (no template) ──
async function sendDirectEmail(to, subject, htmlBody, userId = null) {
    try {
        const mailer = getTransporter();
        if (!mailer) return { success: false, reason: 'SMTP not configured' };

        const fromName = process.env.SMTP_FROM_NAME || 'SMMChatBot';
        const fromEmail = process.env.SMTP_FROM_EMAIL || 'noreply@example.com';

        await mailer.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to,
            subject,
            html: wrapHtml(htmlBody)
        });

        await prisma.emailLog.create({
            data: { userId, to, subject, status: 'sent' }
        });

        return { success: true };
    } catch (err) {
        return { success: false, reason: err.message };
    }
}

// ── Test SMTP connection ──
async function testConnection() {
    try {
        const mailer = getTransporter();
        if (!mailer) return { success: false, reason: 'SMTP not configured — fill in SMTP_HOST, SMTP_USER, SMTP_PASS in .env' };
        await mailer.verify();
        return { success: true };
    } catch (err) {
        return { success: false, reason: err.message };
    }
}

// ── Seed default templates ──
async function seedDefaultTemplates() {
    const defaults = [
        {
            slug: 'payment_completed',
            name: 'Payment Completed',
            description: 'Sent when a user\'s payment is successfully processed',
            subject: 'Payment Confirmed — ${{amount}}',
            body: `<h2>Payment Received! 🎉</h2>
<p>Hi <strong>{{username}}</strong>,</p>
<p>Your payment has been successfully processed.</p>
<div class="info-box">
    <div class="label">Amount</div>
    <div class="value">\${{amount}}</div>
</div>
<div class="info-box">
    <div class="label">Method</div>
    <div class="value">{{method}}</div>
</div>
<div class="info-box">
    <div class="label">New Balance</div>
    <div class="value">\${{balance}}</div>
</div>
<p>Your funds are now available in your wallet.</p>`,
            variables: ['username', 'amount', 'method', 'balance', 'date']
        },
        {
            slug: 'ticket_reply',
            name: 'Ticket Reply',
            description: 'Sent when admin replies to a user\'s support ticket',
            subject: 'Reply to your ticket: {{ticketSubject}}',
            body: `<h2>New Reply on Your Ticket</h2>
<p>Hi <strong>{{username}}</strong>,</p>
<p>There's a new reply to your support ticket.</p>
<div class="info-box">
    <div class="label">Ticket</div>
    <div class="value">{{ticketSubject}}</div>
</div>
<p><strong>Reply:</strong></p>
<p style="background: #0f172a; padding: 16px; border-radius: 8px; border-left: 3px solid #3b82f6;">{{replyContent}}</p>
<p><a href="{{ticketUrl}}" class="btn">View Ticket</a></p>`,
            variables: ['username', 'ticketSubject', 'replyContent', 'ticketUrl']
        },
        {
            slug: 'low_credit',
            name: 'Low Credit Alert',
            description: 'Sent when user\'s balance drops below a threshold',
            subject: '⚠️ Low Balance Alert — ${{balance}} remaining',
            body: `<h2>Low Credit Warning ⚠️</h2>
<p>Hi <strong>{{username}}</strong>,</p>
<p>Your wallet balance is running low.</p>
<div class="info-box">
    <div class="label">Current Balance</div>
    <div class="value">\${{balance}}</div>
</div>
<p>To avoid service interruptions, please top up your balance soon.</p>
<p><a href="{{topupUrl}}" class="btn">Top Up Now</a></p>`,
            variables: ['username', 'balance', 'topupUrl']
        },
        {
            slug: 'welcome',
            name: 'Welcome Email',
            description: 'Sent when a new user registers',
            subject: 'Welcome to {{platformName}}! 🚀',
            body: `<h2>Welcome Aboard! 🚀</h2>
<p>Hi <strong>{{username}}</strong>,</p>
<p>Your account has been created successfully.</p>
<div class="info-box">
    <div class="label">Username</div>
    <div class="value">{{username}}</div>
</div>
<p>Get started by connecting your first WhatsApp device or SMM panel.</p>
<p><a href="{{dashboardUrl}}" class="btn">Go to Dashboard</a></p>`,
            variables: ['username', 'platformName', 'dashboardUrl']
        },
        {
            slug: 'subscription_renewed',
            name: 'Subscription Renewed',
            description: 'Sent when a monthly subscription is auto-renewed',
            subject: 'Subscription Renewed — {{serviceName}}',
            body: `<h2>Subscription Renewed ✅</h2>
<p>Hi <strong>{{username}}</strong>,</p>
<p>Your subscription has been automatically renewed.</p>
<div class="info-box">
    <div class="label">Service</div>
    <div class="value">{{serviceName}}</div>
</div>
<div class="info-box">
    <div class="label">Amount Charged</div>
    <div class="value">\${{amount}}</div>
</div>
<div class="info-box">
    <div class="label">Next Billing</div>
    <div class="value">{{nextBilling}}</div>
</div>
<p>Thank you for your continued use of our services!</p>`,
            variables: ['username', 'serviceName', 'amount', 'nextBilling']
        }
    ];

    for (const tpl of defaults) {
        await prisma.emailTemplate.upsert({
            where: { slug: tpl.slug },
            create: tpl,
            update: { variables: tpl.variables } // Always fix variables if they were stored wrong
        });
    }

    console.log(`[Email] Seeded ${defaults.length} default email templates`);
}

module.exports = {
    sendTemplateEmail,
    sendDirectEmail,
    testConnection,
    seedDefaultTemplates,
    renderTemplate,
    getTransporter
};
