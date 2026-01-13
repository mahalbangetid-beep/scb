/**
 * DICREWA WhatsApp Service
 * 
 * Menggunakan @whiskeysockets/baileys untuk koneksi ke WhatsApp
 * Support multi-device dan session management
 * 
 * Note: Menggunakan dynamic import karena Baileys adalah ESM module
 */

const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const prisma = require('../utils/prisma');
const botMessageHandler = require('./botMessageHandler');

// Store untuk menyimpan WhatsApp instances
const sessions = new Map();
const sessionStores = new Map();

// Path untuk menyimpan sessions
const SESSIONS_DIR = path.join(__dirname, '../../sessions');

// Pastikan folder sessions ada
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Baileys modules (akan di-load secara dynamic)
let makeWASocket, DisconnectReason, useMultiFileAuthState, makeInMemoryStore, fetchLatestBaileysVersion, delay;

// Load ESM modules
async function loadBaileys() {
    if (makeWASocket) return; // Sudah loaded

    const baileys = await import('@whiskeysockets/baileys');
    makeWASocket = baileys.default;
    DisconnectReason = baileys.DisconnectReason;
    useMultiFileAuthState = baileys.useMultiFileAuthState;
    makeInMemoryStore = baileys.makeInMemoryStore;
    fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
    delay = baileys.delay;

    console.log('[WA] Baileys module loaded successfully');
}

// Load saat module di-require
loadBaileys().catch(err => {
    console.error('[WA] Failed to load Baileys:', err.message);
});

/**
 * WhatsApp Service Class
 */
class WhatsAppService {
    constructor(io) {
        this.io = io; // Socket.IO instance untuk realtime updates
        this.initialized = false;
    }

    /**
     * Ensure Baileys is loaded
     */
    async ensureLoaded() {
        if (!makeWASocket) {
            await loadBaileys();
        }
    }

    /**
     * Get session path untuk device tertentu
     */
    getSessionPath(deviceId) {
        return path.join(SESSIONS_DIR, `session_${deviceId}`);
    }

    /**
     * Check apakah session sudah ada
     */
    hasSession(deviceId) {
        return sessions.has(deviceId);
    }

    /**
     * Get active session
     */
    getSession(deviceId) {
        return sessions.get(deviceId);
    }

    /**
     * Get all active sessions
     */
    getAllSessions() {
        const result = [];
        sessions.forEach((socket, deviceId) => {
            result.push({
                deviceId,
                status: socket.user ? 'connected' : 'connecting',
                user: socket.user || null
            });
        });
        return result;
    }

    /**
     * Initialize dan connect WhatsApp session
     */
    async createSession(deviceId, callbacks = {}) {
        await this.ensureLoaded();

        const sessionPath = this.getSessionPath(deviceId);

        // Cleanup existing session jika ada
        if (sessions.has(deviceId)) {
            try {
                const oldSocket = sessions.get(deviceId);
                oldSocket.ev.removeAllListeners();
                await oldSocket.end();
            } catch (e) {
                // Ignore cleanup errors
            }
            sessions.delete(deviceId);
        }

        // Setup auth state (multi-file untuk persistence)
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

        // Create in-memory store untuk messages
        const store = makeInMemoryStore({
            logger: {
                level: 'silent',
                child: () => ({ level: 'silent' })
            }
        });
        sessionStores.set(deviceId, store);

        // Fetch versi terbaru
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`[WA:${deviceId}] Using WA version ${version.join('.')}, isLatest: ${isLatest}`);

        // Buat socket connection
        const socket = makeWASocket({
            version,
            logger: {
                level: 'silent',
                child: () => ({ level: 'silent' })
            },
            printQRInTerminal: true,
            auth: state,
            browser: ['DICREWA', 'Chrome', '120.0.0'],
            getMessage: async (key) => {
                // Untuk retry message yang gagal
                const msg = await store.loadMessage(key.remoteJid, key.id);
                return msg?.message;
            }
        });

        // Bind store ke socket
        store.bind(socket.ev);

        // Store socket reference
        sessions.set(deviceId, socket);

        // Handle connection update
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // Emit QR code jika ada
            if (qr) {
                try {
                    const qrImage = await QRCode.toDataURL(qr);
                    console.log(`[WA:${deviceId}] QR Code generated`);

                    // Emit via Socket.IO
                    if (this.io) {
                        this.io.to(`device:${deviceId}`).emit('qr', { deviceId, qr: qrImage });
                    }

                    // Callback
                    if (callbacks.onQR) {
                        callbacks.onQR(qrImage);
                    }
                } catch (err) {
                    console.error(`[WA:${deviceId}] Error generating QR:`, err);
                }
            }

            // Connection established
            if (connection === 'open') {
                const phone = socket.user.id?.split(':')[0] || socket.user.id?.split('@')[0];
                console.log(`[WA:${deviceId}] Connected as ${phone}!`);

                // Update database
                await prisma.device.update({
                    where: { id: deviceId },
                    data: {
                        status: 'connected',
                        phone: phone,
                        lastActive: new Date()
                    }
                }).catch(err => console.error(`[WA:${deviceId}] Error updating device status:`, err));

                if (this.io) {
                    this.io.to(`device:${deviceId}`).emit('connected', {
                        deviceId,
                        user: { ...socket.user, phone }
                    });
                }

                if (callbacks.onConnected) {
                    callbacks.onConnected(socket.user);
                }
            }

            // Connection closed
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`[WA:${deviceId}] Connection closed. StatusCode: ${statusCode}`);

                // Check if should reconnect
                const shouldReconnect = statusCode !== 401 && statusCode !== 403;

                if (shouldReconnect && statusCode !== undefined) {
                    console.log(`[WA:${deviceId}] Reconnecting in 5s...`);

                    // Update DB to connecting
                    await prisma.device.update({
                        where: { id: deviceId },
                        data: { status: 'connecting' }
                    }).catch(() => { });

                    await delay(5000);
                    await this.createSession(deviceId, callbacks);
                } else if (statusCode === 401) {
                    // Logged out - remove session
                    console.log(`[WA:${deviceId}] Session logged out`);

                    // Update DB to disconnected
                    await prisma.device.update({
                        where: { id: deviceId },
                        data: { status: 'disconnected' }
                    }).catch(() => { });

                    await this.deleteSession(deviceId);

                    if (this.io) {
                        this.io.to(`device:${deviceId}`).emit('disconnected', {
                            deviceId,
                            reason: 'logged_out'
                        });
                    }

                    if (callbacks.onDisconnected) {
                        callbacks.onDisconnected('logged_out');
                    }
                }
            }
        });

        // Handle credentials update (save ke file)
        socket.ev.on('creds.update', saveCreds);

        // Handle incoming messages
        socket.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            for (const msg of messages) {
                // Skip status messages
                if (msg.key.remoteJid === 'status@broadcast') continue;

                // Skip messages from self if it's a reaction/edit
                if (msg.message?.protocolMessage) continue;

                const content = this.extractMessageContent(msg.message);
                const msgType = this.getMessageType(msg.message);

                // Detect if message is from a group
                const isGroup = msg.key.remoteJid?.endsWith('@g.us') || false;
                const senderNumber = isGroup
                    ? msg.key.participant?.split('@')[0]
                    : msg.key.remoteJid?.split('@')[0];

                const messageData = {
                    deviceId,
                    messageId: msg.key.id,
                    from: senderNumber,
                    fromJid: msg.key.remoteJid,
                    fromMe: msg.key.fromMe || false,
                    pushName: msg.pushName || '',
                    timestamp: new Date((msg.messageTimestamp || Date.now() / 1000) * 1000),
                    content: content || '',
                    type: msgType,
                    status: 'received',
                    isGroup
                };

                console.log(`[WA:${deviceId}] Message received from ${messageData.from}${isGroup ? ' (group)' : ''}`);

                // Save to database
                const savedMessage = await prisma.message.create({
                    data: {
                        id: messageData.messageId,
                        deviceId: deviceId,
                        from: messageData.from,
                        to: socket.user.id?.split(':')[0] || socket.user.id?.split('@')[0],
                        content: messageData.content,
                        type: messageData.type,
                        status: messageData.status,
                        direction: messageData.fromMe ? 'outgoing' : 'incoming',
                        createdAt: messageData.timestamp
                    }
                }).catch(err => console.error(`[WA:${deviceId}] Error saving message:`, err));

                // Process incoming message through botMessageHandler
                // This handles: SMM commands, auto-reply, and other workflows
                if (!messageData.fromMe && content) {
                    // Get device userId
                    const device = await prisma.device.findUnique({
                        where: { id: deviceId },
                        select: { userId: true }
                    });

                    if (device?.userId) {
                        try {
                            const handlerResult = await botMessageHandler.handleMessage({
                                deviceId,
                                userId: device.userId,
                                message: content,
                                senderNumber: messageData.from,
                                senderName: messageData.pushName,
                                isGroup,
                                platform: 'WHATSAPP'
                            });

                            // If handled, send response back
                            if (handlerResult.handled && handlerResult.response) {
                                // Send reply to the correct JID (group or private)
                                const replyJid = msg.key.remoteJid;
                                await socket.sendMessage(replyJid, { text: handlerResult.response });
                                console.log(`[WA:${deviceId}] Response sent: ${handlerResult.type}`);
                            }
                        } catch (err) {
                            console.error(`[WA:${deviceId}] BotMessageHandler error:`, err.message);
                        }
                    }
                }

                if (this.io) {
                    this.io.to(`device:${deviceId}`).emit('message', { ...messageData, id: messageData.messageId });
                }

                if (callbacks.onMessage) {
                    callbacks.onMessage(messageData);
                }
            }
        });

        // Handle message status update
        socket.ev.on('messages.update', async (updates) => {
            for (const update of updates) {
                const statusMap = {
                    1: 'sent',
                    2: 'delivered',
                    3: 'read',
                    4: 'played'
                };

                const newStatus = statusMap[update.update.status] || 'unknown';

                if (newStatus !== 'unknown') {
                    await prisma.message.update({
                        where: { id: update.key.id },
                        data: { status: newStatus }
                    }).catch(() => { }); // Message might not exist in our DB if it was sent by other device
                }

                if (this.io) {
                    this.io.to(`device:${deviceId}`).emit('message.update', {
                        deviceId,
                        messageId: update.key.id,
                        status: newStatus,
                        rawStatus: update.update.status
                    });
                }

                if (callbacks.onMessageUpdate) {
                    callbacks.onMessageUpdate(update);
                }
            }
        });

        return socket;
    }

    /**
     * Extract text content dari message
     */
    extractMessageContent(message) {
        if (!message) return null;

        // Text message
        if (message.conversation) {
            return message.conversation;
        }

        // Extended text message
        if (message.extendedTextMessage?.text) {
            return message.extendedTextMessage.text;
        }

        // Image with caption
        if (message.imageMessage?.caption) {
            return message.imageMessage.caption;
        }

        // Video with caption
        if (message.videoMessage?.caption) {
            return message.videoMessage.caption;
        }

        // Document with caption
        if (message.documentMessage?.caption) {
            return message.documentMessage.caption;
        }

        return null;
    }

    /**
     * Get message type
     */
    getMessageType(message) {
        if (!message) return 'unknown';

        if (message.conversation || message.extendedTextMessage) return 'text';
        if (message.imageMessage) return 'image';
        if (message.videoMessage) return 'video';
        if (message.audioMessage) return 'audio';
        if (message.documentMessage) return 'document';
        if (message.stickerMessage) return 'sticker';
        if (message.contactMessage) return 'contact';
        if (message.locationMessage) return 'location';

        return 'unknown';
    }

    /**
     * Send text message
     */
    async sendMessage(deviceId, to, text) {
        await this.ensureLoaded();

        const socket = sessions.get(deviceId);
        if (!socket) {
            throw new Error('Device not connected');
        }

        // Format nomor (tambah @s.whatsapp.net jika belum ada)
        const jid = this.formatJid(to);

        const result = await socket.sendMessage(jid, { text });

        return {
            messageId: result.key.id,
            to: jid,
            status: 'sent',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Send image message
     */
    async sendImage(deviceId, to, imageUrl, caption = '') {
        await this.ensureLoaded();

        const socket = sessions.get(deviceId);
        if (!socket) {
            throw new Error('Device not connected');
        }

        const jid = this.formatJid(to);

        const result = await socket.sendMessage(jid, {
            image: { url: imageUrl },
            caption
        });

        return {
            messageId: result.key.id,
            to: jid,
            status: 'sent',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Send document
     */
    async sendDocument(deviceId, to, documentUrl, filename, caption = '') {
        await this.ensureLoaded();

        const socket = sessions.get(deviceId);
        if (!socket) {
            throw new Error('Device not connected');
        }

        const jid = this.formatJid(to);

        const result = await socket.sendMessage(jid, {
            document: { url: documentUrl },
            fileName: filename,
            caption
        });

        return {
            messageId: result.key.id,
            to: jid,
            status: 'sent',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Format nomor telepon ke JID WhatsApp
     */
    formatJid(number) {
        // Hapus karakter non-digit
        let cleaned = number.replace(/\D/g, '');

        // Hapus leading 0 dan ganti dengan 62 (Indonesia)
        if (cleaned.startsWith('0')) {
            cleaned = '62' + cleaned.substring(1);
        }

        // Tambah @s.whatsapp.net jika belum ada
        if (!cleaned.includes('@')) {
            cleaned = cleaned + '@s.whatsapp.net';
        }

        return cleaned;
    }

    /**
     * Check if number is on WhatsApp
     */
    async isOnWhatsApp(deviceId, number) {
        await this.ensureLoaded();

        const socket = sessions.get(deviceId);
        if (!socket) {
            throw new Error('Device not connected');
        }

        const jid = this.formatJid(number);
        const [result] = await socket.onWhatsApp(jid.replace('@s.whatsapp.net', ''));

        return result?.exists || false;
    }

    /**
     * Close session (keep session files)
     */
    async closeSession(deviceId) {
        const socket = sessions.get(deviceId);
        if (socket) {
            try {
                socket.ev.removeAllListeners();
                await socket.end();
            } catch (e) {
                // Ignore cleanup errors
            }
            sessions.delete(deviceId);
            sessionStores.delete(deviceId);
        }
    }

    /**
     * Logout and delete session files
     */
    async deleteSession(deviceId) {
        const socket = sessions.get(deviceId);
        if (socket) {
            try {
                await socket.logout();
            } catch (e) {
                // Ignore if already logged out
            }
            try {
                socket.ev.removeAllListeners();
                await socket.end();
            } catch (e) {
                // Ignore cleanup errors
            }
            sessions.delete(deviceId);
            sessionStores.delete(deviceId);
        }

        // Delete session files
        const sessionPath = this.getSessionPath(deviceId);
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }
    }

    /**
     * Restart session
     */
    async restartSession(deviceId, callbacks = {}) {
        await this.closeSession(deviceId);
        await delay(2000);
        return await this.createSession(deviceId, callbacks);
    }

    /**
     * Get session status
     */
    getSessionStatus(deviceId) {
        const socket = sessions.get(deviceId);
        if (!socket) {
            return { status: 'disconnected', user: null };
        }

        return {
            status: socket.user ? 'connected' : 'connecting',
            user: socket.user ? {
                id: socket.user.id,
                name: socket.user.name,
                phone: socket.user.id?.split(':')[0] || socket.user.id?.split('@')[0]
            } : null
        };
    }

    /**
     * Load semua existing sessions saat startup
     */
    async loadExistingSessions() {
        await this.ensureLoaded();

        if (!fs.existsSync(SESSIONS_DIR)) return;

        const sessionFolders = fs.readdirSync(SESSIONS_DIR)
            .filter(f => f.startsWith('session_'));

        console.log(`[WA] Found ${sessionFolders.length} existing session(s)`);

        for (const folder of sessionFolders) {
            const deviceId = folder.replace('session_', '');
            try {
                console.log(`[WA] Loading session for device: ${deviceId}`);
                await this.createSession(deviceId);
            } catch (err) {
                console.error(`[WA] Failed to load session ${deviceId}:`, err.message);
            }
        }
    }

    /**
     * Process Auto Reply
     */
    async processAutoReply(deviceId, from, content) {
        try {
            // Find triggered rules
            const device = await prisma.device.findUnique({
                where: { id: deviceId },
                select: { userId: true }
            });

            if (!device) return;

            const rules = await prisma.autoReplyRule.findMany({
                where: {
                    userId: device.userId,
                    isActive: true,
                    OR: [
                        { deviceId: null },
                        { deviceId: deviceId }
                    ]
                },
                orderBy: { priority: 'desc' }
            });

            const lowerContent = content.toLowerCase();

            for (const rule of rules) {
                let triggered = false;
                const keywords = rule.keywords.split(',').map(k => k.trim().toLowerCase());

                if (rule.triggerType === 'exact') {
                    triggered = keywords.includes(lowerContent);
                } else if (rule.triggerType === 'contains') {
                    triggered = keywords.some(k => lowerContent.includes(k));
                } else if (rule.triggerType === 'startswith') {
                    triggered = keywords.some(k => lowerContent.startsWith(k));
                } else if (rule.triggerType === 'regex') {
                    try {
                        const regex = new RegExp(rule.keywords, 'i');
                        triggered = regex.test(content);
                    } catch (e) {
                        console.error('Invalid regex in rule:', rule.id);
                    }
                }

                if (triggered) {
                    console.log(`[WA:${deviceId}] Auto-reply triggered: ${rule.name}`);

                    // Send response
                    await this.sendMessage(deviceId, from, rule.response);

                    // Update count
                    await prisma.autoReplyRule.update({
                        where: { id: rule.id },
                        data: { triggerCount: { increment: 1 } }
                    });

                    // Only process one rule (highest priority)
                    break;
                }
            }
        } catch (err) {
            console.error('[AutoReply] Error:', err);
        }
    }
}

module.exports = WhatsAppService;
