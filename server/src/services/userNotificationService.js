/**
 * User Notification Service
 * 
 * Sends WhatsApp/Telegram notifications to mapped users AND charges credits.
 * This is a NEW service that other services call when they need to notify a user.
 * 
 * Message types handled:
 * - wa_status_update: Order status changed (Section 3.4)
 * - wa_payment_notification: Fund added/deducted (Section 5.3)
 * - wa_ticket_reply: Ticket reply notification (Section 6.5)
 * - wa_security_text: Security/2FA messages
 * - wa_fonepay_verification: Fonepay verification messages
 */

const prisma = require('../utils/prisma');

class UserNotificationService {
    /**
     * Send a notification to a user's mapped WhatsApp number.
     * Handles: finding device, finding mapping, charging credit, sending message.
     * 
     * @param {string} userId - Bot owner's user ID
     * @param {string} messageType - e.g. 'wa_status_update', 'wa_payment_notification'
     * @param {string} recipientPhone - User's WhatsApp number (with or without @s.whatsapp.net)
     * @param {string} message - Message text to send
     * @param {Object} options - Optional: { deviceId, skipCharge, platform }
     * @returns {Object} { sent: boolean, charged: boolean, error?: string }
     */
    async sendNotification(userId, messageType, recipientPhone, message, options = {}) {
        const { deviceId = null, skipCharge = false, platform = 'WHATSAPP' } = options;

        try {
            // 1. Find a connected device to send from
            let sendDeviceId = deviceId;
            if (!sendDeviceId) {
                const connectedDevice = await prisma.device.findFirst({
                    where: { userId, status: 'connected' },
                    select: { id: true }
                });
                if (!connectedDevice) {
                    console.log(`[UserNotification] No connected device for user ${userId}`);
                    return { sent: false, charged: false, error: 'no_connected_device' };
                }
                sendDeviceId = connectedDevice.id;
            }

            // 2. Charge credit BEFORE sending (to prevent free messages)
            let chargeResult = { charged: false, amount: 0 };
            if (!skipCharge) {
                try {
                    const billingModeService = require('./billingModeService');
                    const isCreditsMode = await billingModeService.isCreditsMode();

                    // Get the user for charging
                    const user = await prisma.user.findUnique({
                        where: { id: userId },
                        select: {
                            id: true, role: true,
                            creditBalance: true,
                            supportCredits: true, messageCredits: true,
                            customCreditRate: true, customWaRate: true,
                            discountRate: true
                        }
                    });

                    // Skip charge for admins
                    if (user?.role === 'MASTER_ADMIN' || user?.role === 'ADMIN') {
                        chargeResult = { charged: false, amount: 0, reason: 'admin_exempt' };
                    } else if (isCreditsMode) {
                        const messageCreditService = require('./messageCreditService');
                        chargeResult = await messageCreditService.chargeMessageByType(
                            userId, messageType, platform, false, user
                        );
                    } else {
                        const creditService = require('./creditService');
                        chargeResult = await creditService.chargeMessageByType(
                            userId, messageType, platform, false, user
                        );
                    }

                    // If charge failed due to insufficient balance, don't send
                    if (chargeResult.reason === 'insufficient_credits' || chargeResult.reason === 'insufficient_balance') {
                        console.log(`[UserNotification] Insufficient balance for ${messageType}, skipping notification`);
                        return { sent: false, charged: false, error: 'insufficient_balance' };
                    }
                } catch (chargeErr) {
                    console.error(`[UserNotification] Charge error for ${messageType}:`, chargeErr.message);
                    // Don't block notification for charge errors — send anyway
                }
            }

            // 3. Send the message
            const whatsappService = require('./whatsapp');
            const jid = recipientPhone.includes('@')
                ? recipientPhone
                : `${recipientPhone.replace(/\D/g, '')}@s.whatsapp.net`;

            await whatsappService.sendMessage(sendDeviceId, jid, message);

            console.log(`[UserNotification] ✅ Sent ${messageType} to ${recipientPhone} (charged: ${chargeResult.amount || 0})`);
            return { sent: true, charged: chargeResult.charged || false, amount: chargeResult.amount || 0 };

        } catch (error) {
            console.error(`[UserNotification] Failed to send ${messageType}:`, error.message);
            return { sent: false, charged: false, error: error.message };
        }
    }

    /**
     * Send order status update notification to the mapped user.
     * Section 3.4: "🤖 AI Update — Order 699037 is now Canceled"
     * 
     * @param {string} userId - Bot owner's user ID
     * @param {Object} order - Order object with { externalOrderId, customerUsername, ... }
     * @param {string} oldStatus - Previous status
     * @param {string} newStatus - New status
     */
    async sendOrderStatusUpdate(userId, order, oldStatus, newStatus) {
        // Only send for meaningful status changes
        const notifyStatuses = ['COMPLETED', 'CANCELLED', 'PARTIAL', 'REFUNDED'];
        if (!notifyStatuses.includes(newStatus)) {
            return { sent: false, reason: 'status_not_notifiable' };
        }

        // Don't notify if old and new are the same
        if (oldStatus === newStatus) {
            return { sent: false, reason: 'no_change' };
        }

        // Find the user's phone from mapping
        // Try by customerUsername first, then fallback to any mapping for this user
        let recipientPhone = null;
        if (order.customerUsername) {
            recipientPhone = await this.findUserPhone(userId, order.customerUsername);
        }
        if (!recipientPhone) {
            // Fallback: find ANY mapping with a phone for this userId
            recipientPhone = await this.findPhoneByUserId(userId);
        }
        if (!recipientPhone) {
            console.log(`[UserNotification] No phone found for status update: userId=${userId}, customerUsername=${order.customerUsername || 'null'}`);
            return { sent: false, reason: 'no_mapping' };
        }

        // Try to get custom template
        const responseTemplateService = require('./responseTemplateService');
        const statusDisplay = this.formatStatus(newStatus);
        
        let message = await responseTemplateService.getResponse(userId, 'ORDER_STATUS_UPDATE', {
            order_id: order.externalOrderId,
            status: statusDisplay,
            old_status: this.formatStatus(oldStatus),
            service: order.serviceName || 'Unknown Service'
        });

        // Fallback template
        if (!message) {
            message = `🤖 AI Update — Order ${order.externalOrderId} is now ${statusDisplay}`;
        }

        return this.sendNotification(userId, 'wa_status_update', recipientPhone, message);
    }

    /**
     * Send payment notification to user.
     * Section 5.3: Notify when fund is added/deducted.
     * 
     * @param {string} userId - Bot owner's user ID
     * @param {string} customerUsername - Username to find phone mapping
     * @param {Object} paymentInfo - { amount, type ('credit'|'debit'), method, newBalance, currency }
     */
    async sendPaymentNotification(userId, customerUsername, paymentInfo) {
        console.log(`[UserNotification] 🔔 sendPaymentNotification called: userId=${userId}, customerUsername=${customerUsername}, amount=${paymentInfo?.amount}`);

        // Try by panel username first, then fallback to any mapping for this userId
        let recipientPhone = null;
        if (customerUsername) {
            recipientPhone = await this.findUserPhone(userId, customerUsername);
            console.log(`[UserNotification] findUserPhone(${userId}, ${customerUsername}) => ${recipientPhone || 'null'}`);
        }
        if (!recipientPhone) {
            // Fallback: find ANY mapping with a phone for this userId
            recipientPhone = await this.findPhoneByUserId(userId);
            console.log(`[UserNotification] findPhoneByUserId(${userId}) => ${recipientPhone || 'null'}`);
        }
        if (!recipientPhone) {
            console.log(`[UserNotification] ❌ No phone found for payment notification: userId=${userId}, username=${customerUsername || 'null'}`);
            return { sent: false, reason: 'no_mapping' };
        }

        console.log(`[UserNotification] ✅ Phone found: ${recipientPhone}, building message...`);

        const { amount, type, method, newBalance, currency = 'USD' } = paymentInfo;
        const responseTemplateService = require('./responseTemplateService');
        
        const templateKey = type === 'credit' ? 'PAYMENT_ADDED' : 'PAYMENT_DEDUCTED';
        let message = await responseTemplateService.getResponse(userId, templateKey, {
            amount: amount.toFixed(2),
            currency,
            method: method || 'Manual',
            new_balance: (newBalance || 0).toFixed(2),
            username: customerUsername
        });

        if (!message) {
            const icon = type === 'credit' ? '💰' : '💸';
            const action = type === 'credit' ? 'added to' : 'deducted from';
            message = `${icon} *Payment Notification*\n\n` +
                `${currency} ${amount.toFixed(2)} has been ${action} your account.\n` +
                `Method: ${method || 'Manual'}\n` +
                `New Balance: ${currency} ${(newBalance || 0).toFixed(2)}\n` +
                `Date: ${new Date().toLocaleString()}`;
        }

        return this.sendNotification(userId, 'wa_payment_notification', recipientPhone, message);
    }

    /**
     * Send ticket reply notification to customer.
     * Section 6.5: When admin replies to ticket, notify customer.
     */
    async sendTicketReplyNotification(userId, ticket, replyContent) {
        if (!ticket.customerPhone) {
            return { sent: false, reason: 'no_customer_phone' };
        }

        const responseTemplateService = require('./responseTemplateService');
        let message = await responseTemplateService.getResponse(userId, 'TICKET_REPLY', {
            ticket_number: ticket.ticketNumber,
            subject: ticket.subject || 'Support Request',
            reply: replyContent
        });

        if (!message) {
            message = `📋 *Ticket Update*\n\n` +
                `Ticket: #${ticket.ticketNumber}\n` +
                `Subject: ${ticket.subject || 'Support Request'}\n\n` +
                `Reply:\n${replyContent}`;
        }

        return this.sendNotification(userId, 'wa_ticket_reply', ticket.customerPhone, message);
    }

    /**
     * Send security notification to user.
     * For 2FA codes, login alerts, password resets.
     */
    async sendSecurityNotification(userId, recipientPhone, securityMessage) {
        return this.sendNotification(userId, 'wa_security_text', recipientPhone, securityMessage);
    }

    /**
     * Send Fonepay verification notification.
     * Charges wa_fonepay_verification rate.
     */
    async sendFonepayNotification(userId, recipientPhone, message) {
        return this.sendNotification(userId, 'wa_fonepay_verification', recipientPhone, message);
    }

    // ==================== HELPER METHODS ====================

    /**
     * Find a user's WhatsApp phone number from their username mapping.
     * Looks up UserMapping table to find the mapped phone number.
     */
    async findUserPhone(userId, customerUsername) {
        if (!customerUsername) return null;

        try {
            const userMappingService = require('./userMappingService');
            const mapping = await userMappingService.findByUsername(userId, customerUsername);
            
            if (mapping) {
                // Return the first available phone number
                const phones = Array.isArray(mapping.whatsappNumbers)
                    ? mapping.whatsappNumbers
                    : (mapping.whatsappNumber ? [mapping.whatsappNumber] : []);
                
                if (phones.length > 0) {
                    return phones[0];
                }
            }
        } catch (error) {
            console.error(`[UserNotification] findUserPhone error:`, error.message);
        }

        return null;
    }

    /**
     * Find ANY WhatsApp phone number for a userId from their mappings.
     * Used as fallback when customerUsername is unknown or doesn't match.
     * Searches all mappings for this bot owner and returns the first phone found.
     */
    async findPhoneByUserId(userId) {
        try {
            const mappings = await prisma.userPanelMapping.findMany({
                where: { userId },
                orderBy: { updatedAt: 'desc' },
                take: 10
            });

            for (const mapping of mappings) {
                // Parse whatsappNumbers (stored as JSON string)
                let phones = [];
                try {
                    phones = typeof mapping.whatsappNumbers === 'string'
                        ? JSON.parse(mapping.whatsappNumbers)
                        : (mapping.whatsappNumbers || []);
                } catch (e) {
                    phones = [];
                }

                if (Array.isArray(phones) && phones.length > 0) {
                    console.log(`[UserNotification] Found phone via userId fallback: ${phones[0]} (mapping: ${mapping.panelUsername})`);
                    return phones[0];
                }
            }
        } catch (error) {
            console.error(`[UserNotification] findPhoneByUserId error:`, error.message);
        }

        return null;
    }

    /**
     * Format status for display
     */
    formatStatus(status) {
        const statusMap = {
            'COMPLETED': 'Completed',
            'CANCELLED': 'Canceled',
            'PARTIAL': 'Partial',
            'REFUNDED': 'Refunded',
            'PENDING': 'Pending',
            'IN_PROGRESS': 'In Progress',
            'PROCESSING': 'Processing'
        };
        return statusMap[status] || status;
    }
}

module.exports = new UserNotificationService();
