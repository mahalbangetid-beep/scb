require('dotenv').config();

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

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { authLimiter, apiLimiter } = require('./middleware/rateLimiter');
const { requestLogger, performanceMonitor } = require('./middleware/logger');
const { securityHeaders, configureCors } = require('./middleware/security');
const { sanitizeRequest, securityCheck } = require('./middleware/validation');

// Import WhatsApp Service
const WhatsAppService = require('./services/whatsapp');
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
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

// Security Middleware
app.use(helmet());
app.use(securityHeaders());
app.use(cors(configureCors()));
app.use(morgan('dev'));

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
            activeSessions: sessions.length,
            sessions: sessions.map(s => ({
                deviceId: s.deviceId,
                status: s.status
            }))
        }
    });
});

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


// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });

    // Join room for device updates
    socket.on('join:device', (deviceId) => {
        socket.join(`device:${deviceId}`);
        console.log(`Socket ${socket.id} joined device:${deviceId}`);

        // Send current status
        const status = whatsappService.getSessionStatus(deviceId);
        socket.emit('device.status', { deviceId, ...status });
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
});

module.exports = { app, io, whatsappService, telegramService };
