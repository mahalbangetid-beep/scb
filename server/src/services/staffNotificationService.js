/**
 * Staff Notification Service — Section 11.2
 * 
 * Sends notifications to a dedicated staff/admin WhatsApp group for:
 * - Error orders requiring manual intervention
 * - Cancellation/refund requests needing approval
 * - Fund not available at provider side
 * - New tickets created
 * 
 * Configuration is per-user via Setting table:
 *   - staff_notification_device_id: WhatsApp device to send from
 *   - staff_notification_group_jid: Staff WhatsApp group JID
 */

const prisma = require('../utils/prisma');

class StaffNotificationService {

    /**
     * Get staff notification config for a user
     * @param {string} userId
     * @returns {Object|null} { deviceId, groupJid } or null if not configured
     */
    async getConfig(userId) {
        const settings = await prisma.setting.findMany({
            where: {
                userId,
                key: { in: ['staff_notification_device_id', 'staff_notification_group_jid'] }
            },
            select: { key: true, value: true }
        });

        const config = {};
        for (const s of settings) {
            if (s.key === 'staff_notification_device_id') config.deviceId = s.value;
            if (s.key === 'staff_notification_group_jid') config.groupJid = s.value;
        }

        if (!config.deviceId || !config.groupJid) return null;

        // Normalize group JID
        if (config.groupJid && !config.groupJid.includes('@')) {
            config.groupJid = `${config.groupJid}@g.us`;
        }

        return config;
    }

    /**
     * Send a notification message to the staff group
     * @param {string} userId - Owner user ID
     * @param {string} message - Message to send
     */
    async sendToStaffGroup(userId, message) {
        const config = await this.getConfig(userId);
        if (!config) {
            console.log('[StaffNotify] No staff group configured for user', userId);
            return false;
        }

        try {
            const wa = global.whatsappService;
            if (!wa) {
                console.warn('[StaffNotify] WhatsApp service not available');
                return false;
            }

            await wa.sendMessage(config.deviceId, config.groupJid, message);
            console.log(`[StaffNotify] Sent to staff group ${config.groupJid}`);
            return true;
        } catch (error) {
            console.error(`[StaffNotify] Failed to send:`, error.message);
            return false;
        }
    }

    // ==================== NOTIFICATION TYPES ====================

    /**
     * 11.2a: Error order notification
     */
    async notifyErrorOrder(userId, order, errorMessage) {
        const msg = [
            `🚨 *Error Order Alert*`,
            ``,
            `🆔 Order: *#${order.externalOrderId || order.id}*`,
            `📋 Service: ${order.serviceName || 'N/A'}`,
            order.customerUsername ? `👤 Customer: ${order.customerUsername}` : null,
            order.claimedByPhone ? `📱 Phone: ${order.claimedByPhone}` : null,
            `📊 Status: ${order.status}`,
            ``,
            `❌ Error: ${errorMessage}`,
            ``,
            `⚡ _Action required: Please review manually._`
        ].filter(Boolean).join('\n');

        return this.sendToStaffGroup(userId, msg);
    }

    /**
     * 11.2b: Cancellation/refund request notification
     */
    async notifyCancelRequest(userId, order, customerPhone) {
        const msg = [
            `⚠️ *Cancellation Request*`,
            ``,
            `🆔 Order: *#${order.externalOrderId || order.id}*`,
            `📋 Service: ${order.serviceName || 'N/A'}`,
            `💰 Charge: $${order.charge || '0.00'}`,
            order.customerUsername ? `👤 Customer: ${order.customerUsername}` : null,
            customerPhone ? `📱 Phone: ${customerPhone}` : null,
            `📊 Status: ${order.status}`,
            `📉 Remaining: ${order.remains || 'N/A'}`,
            ``,
            `⚡ _Manual approval may be required._`
        ].filter(Boolean).join('\n');

        return this.sendToStaffGroup(userId, msg);
    }

    /**
     * 11.2c: Fund not available notification
     */
    async notifyFundUnavailable(userId, panelName, amount) {
        const msg = [
            `💰 *Insufficient Provider Funds*`,
            ``,
            `🏪 Panel: *${panelName}*`,
            `💸 Balance needed: $${amount || 'N/A'}`,
            ``,
            `⚡ _Please top up provider panel balance._`
        ].join('\n');

        return this.sendToStaffGroup(userId, msg);
    }

    /**
     * 11.2d: New ticket notification
     */
    async notifyNewTicket(userId, ticket) {
        const msg = [
            `📋 *New Ticket Created*`,
            ``,
            `🎫 Ticket: *#${ticket.ticketNumber}*`,
            `📝 Subject: ${ticket.subject || 'Support Request'}`,
            `📁 Category: ${ticket.category || 'GENERAL'}`,
            `⭐ Priority: ${ticket.priority || 'NORMAL'}`,
            ticket.customerPhone ? `📱 Customer: ${ticket.customerPhone}` : null,
            ticket.customerUsername ? `👤 Username: ${ticket.customerUsername}` : null,
            ticket.orderExternalId ? `🆔 Related Order: #${ticket.orderExternalId}` : null,
            ``,
            `🕐 Created: ${new Date(ticket.createdAt).toLocaleString()}`,
            ``,
            `⚡ _Please respond promptly._`
        ].filter(Boolean).join('\n');

        return this.sendToStaffGroup(userId, msg);
    }

    /**
     * Generic notification
     */
    async notifyGeneric(userId, title, details) {
        const msg = [
            `📢 *${title}*`,
            ``,
            ...Object.entries(details).map(([k, v]) => `${k}: ${v}`),
            ``,
            `🕐 ${new Date().toLocaleString()}`
        ].join('\n');

        return this.sendToStaffGroup(userId, msg);
    }
}

module.exports = new StaffNotificationService();
