require('dotenv').config();

// ===== Security: Validate critical secrets at startup =====
(function validateSecrets() {
    const weakSecrets = [
        'your_jwt_secret_here', 'changeme', 'secret', 'password',
        'jwt_secret', 'my_secret', 'test', 'default', '123456',
        'your_encryption_key_here', 'encryption_key'
    ];

    const { JWT_SECRET, ENCRYPTION_KEY, NODE_ENV } = process.env;

    if (NODE_ENV === 'production') {
        if (!JWT_SECRET || JWT_SECRET.length < 32 || weakSecrets.includes(JWT_SECRET.toLowerCase())) {
            console.error('🔴 FATAL: JWT_SECRET is missing, too short (<32 chars), or a known weak placeholder.');
            console.error('   Generate a strong secret: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
            process.exit(1);
        }

        if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32 || weakSecrets.includes(ENCRYPTION_KEY.toLowerCase())) {
            console.error('🔴 FATAL: ENCRYPTION_KEY is missing, too short (<32 chars), or a known weak placeholder.');
            console.error('   Generate a strong key: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
            process.exit(1);
        }
    } else {
        // Development warnings
        if (!JWT_SECRET || JWT_SECRET.length < 16 || weakSecrets.includes(JWT_SECRET.toLowerCase())) {
            console.warn('⚠️  WARNING: JWT_SECRET is weak or a placeholder. Do NOT use in production.');
        }
        if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 16 || weakSecrets.includes(ENCRYPTION_KEY.toLowerCase())) {
            console.warn('⚠️  WARNING: ENCRYPTION_KEY is weak or a placeholder. Do NOT use in production.');
        }
    }
})();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Import routes
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const messageRoutes = require('./routes/messages');
const contactRoutes = require('./routes/contacts');
const webhookRoutes = require('./routes/webhooks');
const broadcastRoutes = require('./routes/broadcast');
const autoReplyRoutes = require('./routes/autoReply');
const settingsRoutes = require('./routes/settings');
const adminRoutes = require('./routes/admin');
const panelRoutes = require('./routes/panels');
const orderRoutes = require('./routes/orders');
const botRoutes = require('./routes/bot');
const providerGroupRoutes = require('./routes/providerGroups');
const walletRoutes = require('./routes/wallet');
const reportsRoutes = require('./routes/reports');
const telegramRoutes = require('./routes/telegram');
const commandTemplateRoutes = require('./routes/commandTemplates');
const paymentRoutes = require('./routes/payments');
const paymentWebhookRoutes = require('./routes/paymentWebhooks');
const botFeaturesRoutes = require('./routes/botFeatures');
const guaranteeRoutes = require('./routes/guarantee');
const keywordResponsesRoutes = require('./routes/keywordResponses');
const creditPackagesRoutes = require('./routes/creditPackages');
const subscriptionsRoutes = require('./routes/subscriptions');
const userMappingsRoutes = require('./routes/userMappings');
const providerDomainsRoutes = require('./routes/providerDomains');
const ticketsRoutes = require('./routes/tickets');
const highRiskRoutes = require('./routes/highRisk');
const contactBackupRoutes = require('./routes/contactBackup');
const messageCreditsRoutes = require('./routes/messageCredits');
const billingModeRoutes = require('./routes/billingMode');
const systemBotRoutes = require('./routes/systemBots');
const emailRoutes = require('./routes/email');

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { authLimiter, apiLimiter } = require('./middleware/rateLimiter');
const { requestLogger, performanceMonitor } = require('./middleware/logger');
const { configureCors } = require('./middleware/security');
const { sanitizeRequest, securityCheck } = require('./middleware/validation');

// Import WhatsApp Service
const WhatsAppService = require('./services/whatsapp');
const prisma = require('./utils/prisma');
const botMessageHandler = require('./services/botMessageHandler');
const commandHandler = require('./services/commandHandler');
const groupForwardingService = require('./services/groupForwarding');
const telegramService = require('./services/telegram');
const contactBackupService = require('./services/contactBackupService');

const app = express();
const httpServer = createServer(app);

// Socket.IO setup
const io = new Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL?.split(',').map(u => u.trim()) || ['http://localhost:5173'],
        methods: ['GET', 'POST']
    }
});

// Initialize WhatsApp Service
const whatsappService = new WhatsAppService(io);

// Make io and whatsappService accessible to routes
app.set('io', io);
app.set('whatsapp', whatsappService);

// Initialize Bot Message Handler with dependencies
botMessageHandler.setDependencies(io, whatsappService);
commandHandler.setDependencies(io, whatsappService);
groupForwardingService.setDependencies(io, whatsappService);

// Initialize ProviderForwardingService
const providerForwardingService = require('./services/providerForwardingService');
providerForwardingService.setWhatsAppService(whatsappService);

// Security Middleware — Consolidated (Bug #23: was helmet() + securityHeaders() conflict)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            frameAncestors: ["'none'"]
        }
    },
    frameguard: { action: 'deny' },               // X-Frame-Options: DENY (was SAMEORIGIN in helmet default)
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true
    },
    referrerPolicy: {
        policy: 'strict-origin-when-cross-origin'  // Was 'no-referrer' in helmet default
    },
    xContentTypeOptions: true                      // X-Content-Type-Options: nosniff
    // xXssProtection — intentionally NOT set. Helmet defaults to X-XSS-Protection: 0
    // which is correct: the browser XSS auditor is deprecated and can introduce vulnerabilities.
}));
// Permissions-Policy (not covered by helmet)
app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
});
app.use(cors(configureCors()));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Request parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging and monitoring
app.use(requestLogger({ skipPaths: ['/health', '/favicon.ico'] }));
app.use(performanceMonitor(2000)); // Log requests > 2s

// Sanitization and security checks
app.use(sanitizeRequest());
app.use(securityCheck);

// Health check
app.get('/health', (req, res) => {
    const sessions = whatsappService.getAllSessions();
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'SMMChatBot API',
        version: '1.0.0',
        whatsapp: {
            activeSessions: sessions.length
        }
    });
});

// Apply API rate limiting to all /api routes
app.use('/api', apiLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/broadcast', broadcastRoutes);
app.use('/api/auto-reply', autoReplyRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/panels', panelRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/provider-groups', providerGroupRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/command-templates', commandTemplateRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/payment-webhooks', paymentWebhookRoutes);
app.use('/api/bot-features', botFeaturesRoutes);
app.use('/api/guarantee', guaranteeRoutes);
app.use('/api/keyword-responses', keywordResponsesRoutes);
app.use('/api/credit-packages', creditPackagesRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/user-mappings', userMappingsRoutes);
app.use('/api/provider-domains', providerDomainsRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/high-risk', highRiskRoutes);
app.use('/api/templates', require('./routes/templates'));
app.use('/api/provider-config', require('./routes/providerConfig'));
app.use('/api/admin/master-backup', require('./routes/masterBackup'));
app.use('/api/contact-backup', contactBackupRoutes);
app.use('/api/message-credits', messageCreditsRoutes);
app.use('/api/billing-mode', billingModeRoutes);
app.use('/api/system-bots', systemBotRoutes);
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/admin/email', emailRoutes);
app.use('/api/activity-logs', require('./routes/activityLogs'));
app.use('/api/watermarks', require('./routes/watermarks'));
app.use('/api/fonepay', require('./routes/fonepay'));
app.use('/api/marketing-intervals', require('./routes/marketingIntervals'));


// Socket.IO authentication middleware
const jwt = require('jsonwebtoken');
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token
            || socket.handshake.headers?.authorization?.replace('Bearer ', '');

        if (!token) {
            return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

        if (!user || !user.isActive) {
            return next(new Error('Invalid or inactive user'));
        }

        socket.user = { id: user.id, role: user.role };
        next();
    } catch (err) {
        next(new Error('Invalid token'));
    }
});

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id, '- User:', socket.user?.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });

    // Join room for device updates — with ownership check
    socket.on('join:device', async (deviceId) => {
        try {
            // Admin/master_admin can join any device room
            const isAdmin = ['ADMIN', 'MASTER_ADMIN'].includes(socket.user.role);

            if (!isAdmin) {
                // Regular users must own the device
                const device = await prisma.device.findFirst({
                    where: { id: deviceId, userId: socket.user.id }
                });

                if (!device) {
                    socket.emit('error', { message: 'Not authorized for this device' });
                    return;
                }
            }

            socket.join(`device:${deviceId}`);
            console.log(`Socket ${socket.id} joined device:${deviceId}`);

            // Send current status
            const status = whatsappService.getSessionStatus(deviceId);
            socket.emit('device.status', { deviceId, ...status });
        } catch (err) {
            socket.emit('error', { message: 'Failed to join device room' });
        }
    });

    // Leave device room
    socket.on('leave:device', (deviceId) => {
        socket.leave(`device:${deviceId}`);
    });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, async () => {
    console.log(`
  ╔═══════════════════════════════════════════════════╗
  ║                                                   ║
  ║   🚀 DICREWA API Server                           ║
  ║                                                   ║
  ║   Server running on: http://localhost:${PORT}        ║
  ║   Environment: ${process.env.NODE_ENV || 'development'}                     ║
  ║                                                   ║
  ╚═══════════════════════════════════════════════════╝
  `);

    // Load existing WhatsApp sessions
    console.log('[Server] Loading existing WhatsApp sessions...');
    await whatsappService.loadExistingSessions();
    console.log('[Server] WhatsApp session loading complete');

    // Initialize Telegram bots
    console.log('[Server] Initializing Telegram bots...');
    await telegramService.initialize();
    console.log('[Server] Telegram bot initialization complete');

    // Initialize Contact Backup Service
    console.log('[Server] Initializing Contact Backup Service...');
    contactBackupService.setWhatsAppService(whatsappService);
    contactBackupService.startAutoBackup();
    console.log('[Server] Contact Backup Service initialized');

    // Start Broadcast Scheduler
    const { startScheduler } = require('./services/broadcastScheduler');
    startScheduler(whatsappService);
    console.log('[Server] Broadcast Scheduler initialized');

    // Seed default email templates
    try {
        const emailService = require('./services/emailService');
        await emailService.seedDefaultTemplates();
    } catch (e) {
        console.log('[Server] Email template seeding skipped:', e.message);
    }
});

module.exports = { app, io, whatsappService, telegramService };
