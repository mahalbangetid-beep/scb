/**
 * Complaint Queue Service
 * Section 16.1 — Automatic Order Logging & Complaint Zero-Miss System
 * 
 * Queues complaints/order requests that cannot be processed immediately.
 * Auto-processes the queue periodically, with admin visibility.
 * 
 * Uses the existing Ticket table with a 'QUEUED' status to track queue items,
 * avoiding schema changes.
 */

const prisma = require('../utils/prisma');

class ComplaintQueueService {
    constructor() {
        // Queue processing interval (every 60 seconds)
        this.processInterval = null;
        this.isProcessing = false;

        // Reason codes for queueing
        this.QUEUE_REASONS = {
            NO_PROVIDER: 'no_provider_config',
            DEVICE_OFFLINE: 'device_offline',
            API_ERROR: 'api_error',
            RATE_LIMITED: 'rate_limited',
            PANEL_UNREACHABLE: 'panel_unreachable',
            UNKNOWN: 'unknown'
        };
    }

    /**
     * Start the auto-processing interval
     */
    startAutoProcessing(intervalMs = 60000) {
        if (this.processInterval) return;
        this.processInterval = setInterval(() => this.processQueue(), intervalMs);
        console.log(`[ComplaintQueue] Auto-processing started (every ${intervalMs / 1000}s)`);
    }

    /**
     * Stop the auto-processing interval
     */
    stopAutoProcessing() {
        if (this.processInterval) {
            clearInterval(this.processInterval);
            this.processInterval = null;
            console.log('[ComplaintQueue] Auto-processing stopped');
        }
    }

    /**
     * Add a complaint to the queue when immediate processing fails
     * 
     * @param {string} userId - Owner user ID
     * @param {Object} data - Complaint data
     * @param {string} data.orderId - External order ID
     * @param {string} data.command - Command type (REFILL, CANCEL, etc.)
     * @param {string} data.senderPhone - Customer phone
     * @param {string} data.senderName - Customer name
     * @param {string} data.message - Original message
     * @param {string} data.reason - Queue reason code
     * @param {string} data.panelId - Panel ID
     * @param {string} data.deviceId - Device ID
     * @returns {Object} Queue entry (ticket)
     */
    async addToQueue(userId, data) {
        try {
            const {
                orderId,
                command = 'GENERAL',
                senderPhone,
                senderName,
                message,
                reason = this.QUEUE_REASONS.UNKNOWN,
                panelId,
                deviceId
            } = data;

            // Check for duplicate (same order + command within 1 hour)
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const existing = await prisma.ticket.findFirst({
                where: {
                    userId,
                    orderExternalId: orderId || undefined,
                    category: command,
                    status: 'QUEUED',
                    createdAt: { gte: oneHourAgo }
                }
            });

            if (existing) {
                console.log(`[ComplaintQueue] Duplicate queued item for order ${orderId} / ${command} — skipping`);
                return existing;
            }

            // Generate ticket number
            const count = await prisma.ticket.count({ where: { userId } });
            const ticketNumber = `Q${String(count + 1).padStart(5, '0')}`;

            const queueEntry = await prisma.ticket.create({
                data: {
                    userId,
                    ticketNumber,
                    subject: `[Queue] ${command} — Order #${orderId || 'N/A'}`,
                    category: command,
                    priority: 'NORMAL',
                    status: 'QUEUED',
                    orderExternalId: orderId || null,
                    panelId: panelId || null,
                    customerPhone: senderPhone || null,
                    customerUsername: senderName || null,
                    messages: JSON.stringify([
                        {
                            type: 'SYSTEM',
                            content: `📋 Queued: ${reason}`,
                            timestamp: new Date().toISOString()
                        },
                        {
                            type: 'CUSTOMER',
                            content: message || `${command} request for order ${orderId}`,
                            timestamp: new Date().toISOString()
                        }
                    ]),
                    metadata: JSON.stringify({
                        queueReason: reason,
                        deviceId,
                        retryCount: 0,
                        maxRetries: 3,
                        lastRetryAt: null
                    })
                }
            });

            console.log(`[ComplaintQueue] ✅ Queued #${ticketNumber}: ${command} order ${orderId} (reason: ${reason})`);
            return queueEntry;
        } catch (err) {
            console.error('[ComplaintQueue] Failed to queue complaint:', err.message);
            return null;
        }
    }

    /**
     * Process the queue — retry failed complaints
     */
    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const queuedItems = await prisma.ticket.findMany({
                where: { status: 'QUEUED' },
                orderBy: { createdAt: 'asc' },
                take: 20
            });

            if (queuedItems.length === 0) {
                this.isProcessing = false;
                return;
            }

            console.log(`[ComplaintQueue] Processing ${queuedItems.length} queued items...`);

            for (const item of queuedItems) {
                await this._processQueueItem(item);
            }
        } catch (err) {
            console.error('[ComplaintQueue] Queue processing error:', err.message);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Process a single queued item
     */
    async _processQueueItem(item) {
        try {
            const metadata = JSON.parse(item.metadata || '{}');
            const retryCount = (metadata.retryCount || 0) + 1;
            const maxRetries = metadata.maxRetries || 3;

            // If max retries exceeded, move to OPEN status for manual handling
            if (retryCount > maxRetries) {
                const messages = JSON.parse(item.messages || '[]');
                messages.push({
                    type: 'SYSTEM',
                    content: `⚠️ Max retries (${maxRetries}) exceeded. Moved to manual queue.`,
                    timestamp: new Date().toISOString()
                });

                await prisma.ticket.update({
                    where: { id: item.id },
                    data: {
                        status: 'OPEN',
                        priority: 'HIGH',
                        messages: JSON.stringify(messages),
                        metadata: JSON.stringify({ ...metadata, retryCount, movedToManual: true })
                    }
                });

                console.log(`[ComplaintQueue] ⚠️ #${item.ticketNumber} moved to manual queue (max retries exceeded)`);
                return;
            }

            // Try to process based on category/command
            let processed = false;
            const queueReason = metadata.queueReason;

            if (queueReason === this.QUEUE_REASONS.DEVICE_OFFLINE) {
                // Check if device is now online
                if (metadata.deviceId) {
                    const device = await prisma.device.findUnique({
                        where: { id: metadata.deviceId },
                        select: { status: true }
                    });
                    if (device?.status === 'connected') {
                        processed = true; // Device is online, can now forward
                    }
                }
            } else if (queueReason === this.QUEUE_REASONS.NO_PROVIDER) {
                // Check if provider config now exists
                const providerConfig = await prisma.providerConfig.findFirst({
                    where: { userId: item.userId, isActive: true }
                });
                if (providerConfig) {
                    processed = true;
                }
            } else if (queueReason === this.QUEUE_REASONS.API_ERROR || queueReason === this.QUEUE_REASONS.PANEL_UNREACHABLE) {
                // Just retry — API might be back
                processed = true;
            }

            if (processed) {
                // Try to forward via ticketAutomationService
                try {
                    const ticketAutomationService = require('./ticketAutomationService');
                    const result = await ticketAutomationService.forwardTicketToProvider(item.userId, item, {});
                    
                    if (result?.success) {
                        const messages = JSON.parse(item.messages || '[]');
                        messages.push({
                            type: 'SYSTEM',
                            content: `✅ Successfully forwarded on retry #${retryCount}`,
                            timestamp: new Date().toISOString()
                        });

                        await prisma.ticket.update({
                            where: { id: item.id },
                            data: {
                                status: 'PENDING',
                                messages: JSON.stringify(messages),
                                metadata: JSON.stringify({ ...metadata, retryCount, processedAt: new Date().toISOString() })
                            }
                        });

                        console.log(`[ComplaintQueue] ✅ #${item.ticketNumber} processed successfully on retry #${retryCount}`);
                        return;
                    }
                } catch (fwdErr) {
                    console.warn(`[ComplaintQueue] Forward failed for #${item.ticketNumber}:`, fwdErr.message);
                }
            }

            // Update retry count
            await prisma.ticket.update({
                where: { id: item.id },
                data: {
                    metadata: JSON.stringify({ ...metadata, retryCount, lastRetryAt: new Date().toISOString() })
                }
            });

            console.log(`[ComplaintQueue] #${item.ticketNumber} retry #${retryCount}/${maxRetries} — still queued`);
        } catch (err) {
            console.error(`[ComplaintQueue] Error processing #${item.ticketNumber}:`, err.message);
        }
    }

    /**
     * Get queue stats for admin view
     */
    async getQueueStats(userId = null) {
        const where = userId ? { userId } : {};

        const [queued, processing, manual, total] = await Promise.all([
            prisma.ticket.count({ where: { ...where, status: 'QUEUED' } }),
            prisma.ticket.count({ where: { ...where, status: 'PENDING', subject: { startsWith: '[Queue]' } } }),
            prisma.ticket.count({ where: { ...where, status: 'OPEN', subject: { startsWith: '[Queue]' } } }),
            prisma.ticket.count({ where: { ...where, subject: { startsWith: '[Queue]' } } })
        ]);

        return { queued, processing, manual, total };
    }

    /**
     * Get queue items for admin view
     */
    async getQueueItems(userId = null, options = {}) {
        const { status = 'QUEUED', limit = 50, skip = 0 } = options;
        const where = { status };
        if (userId) where.userId = userId;

        // Only queue items (identified by subject prefix)
        if (status !== 'QUEUED') {
            where.subject = { startsWith: '[Queue]' };
        }

        const [items, total] = await Promise.all([
            prisma.ticket.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip,
                include: { panel: { select: { name: true, alias: true } } }
            }),
            prisma.ticket.count({ where })
        ]);

        return { items, total };
    }

    /**
     * Manually retry a queued item
     */
    async retryItem(ticketId, userId) {
        const item = await prisma.ticket.findFirst({
            where: { id: ticketId, userId, status: { in: ['QUEUED', 'OPEN'] } }
        });

        if (!item) return { success: false, message: 'Queue item not found' };

        // Reset retry count and re-queue
        const metadata = JSON.parse(item.metadata || '{}');
        metadata.retryCount = 0;
        metadata.manualRetry = true;

        await prisma.ticket.update({
            where: { id: ticketId },
            data: {
                status: 'QUEUED',
                metadata: JSON.stringify(metadata)
            }
        });

        // Process immediately
        const refreshed = await prisma.ticket.findUnique({ where: { id: ticketId } });
        await this._processQueueItem(refreshed);

        return { success: true, message: 'Item re-queued for processing' };
    }

    /**
     * Dismiss/close a queued item
     */
    async dismissItem(ticketId, userId) {
        const item = await prisma.ticket.findFirst({
            where: { id: ticketId, userId }
        });

        if (!item) return { success: false, message: 'Queue item not found' };

        const messages = JSON.parse(item.messages || '[]');
        messages.push({
            type: 'SYSTEM',
            content: '🗑️ Dismissed by admin',
            timestamp: new Date().toISOString()
        });

        await prisma.ticket.update({
            where: { id: ticketId },
            data: {
                status: 'CLOSED',
                messages: JSON.stringify(messages)
            }
        });

        return { success: true, message: 'Item dismissed' };
    }
}

module.exports = new ComplaintQueueService();
