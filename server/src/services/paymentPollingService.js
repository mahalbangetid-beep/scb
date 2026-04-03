/**
 * Payment Polling Service
 * 
 * Periodically checks SMM panel admin APIs for recent payment transactions.
 * When a new payment is detected for a mapped user, sends a WhatsApp notification.
 * 
 * This is a STANDALONE service — it does NOT modify any existing services.
 * All errors are caught and logged; the server will never crash from this service.
 * 
 * Storage: Uses the existing Setting table (key: `paymentPoll_lastCheck_<panelId>`)
 * to track the last poll timestamp per panel. No DB migration required.
 */

const prisma = require('../utils/prisma');

// Poll every 5 minutes
const POLL_INTERVAL_MS = 5 * 60 * 1000;

// Setting key prefix for tracking last poll time
const SETTING_KEY_PREFIX = 'paymentPoll_lastCheck_';

class PaymentPollingService {
    constructor() {
        this._intervalId = null;
        this._running = false;
    }

    /**
     * Start the polling service.
     * Safe to call multiple times — will not create duplicate intervals.
     */
    start() {
        if (this._intervalId) {
            console.log('[PaymentPoll] Already running, skipping start');
            return;
        }

        console.log('[PaymentPoll] Starting payment polling service (interval: 5 min)');

        // Run first check after 60 seconds (let server finish startup)
        setTimeout(() => {
            this._pollAllPanels().catch(e =>
                console.error('[PaymentPoll] Initial poll error:', e.message)
            );
        }, 60 * 1000);

        // Then run every 5 minutes
        this._intervalId = setInterval(() => {
            this._pollAllPanels().catch(e =>
                console.error('[PaymentPoll] Poll cycle error:', e.message)
            );
        }, POLL_INTERVAL_MS);
    }

    /**
     * Stop the polling service.
     */
    stop() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
            console.log('[PaymentPoll] Stopped');
        }
    }

    /**
     * Poll all active panels for recent payments.
     */
    async _pollAllPanels() {
        if (this._running) {
            console.log('[PaymentPoll] Previous poll still running, skipping');
            return;
        }

        this._running = true;

        try {
            // Find all active panels with admin API configured
            const panels = await prisma.smmPanel.findMany({
                where: {
                    isActive: true,
                    adminApiKey: { not: null }
                },
                include: {
                    user: {
                        select: { id: true, role: true }
                    }
                }
            });

            if (panels.length === 0) {
                return; // No panels to poll — silent return
            }

            for (const panel of panels) {
                try {
                    await this._pollPanel(panel);
                } catch (panelErr) {
                    console.error(`[PaymentPoll] Error polling panel "${panel.alias}":`, panelErr.message);
                    // Continue to next panel — don't stop entire cycle
                }
            }
        } catch (error) {
            console.error('[PaymentPoll] Error in poll cycle:', error.message);
        } finally {
            this._running = false;
        }
    }

    /**
     * Poll a single panel for recent payments.
     */
    async _pollPanel(panel) {
        const userId = panel.userId;

        // Check if panel has a detected payments endpoint
        const paymentsEndpoint = this._getPaymentsEndpoint(panel);
        if (!paymentsEndpoint) {
            return; // Panel doesn't support payment listing — skip silently
        }

        // Get last check timestamp
        const lastCheckStr = await this._getLastCheckTime(panel.id, userId);
        const lastCheckTime = lastCheckStr ? new Date(lastCheckStr) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: 24h ago

        // Fetch recent payments from panel admin API
        const payments = await this._fetchPayments(panel, paymentsEndpoint);
        if (!payments || payments.length === 0) {
            // Update last check time even if no payments
            await this._setLastCheckTime(panel.id, userId, new Date().toISOString());
            return;
        }

        // Filter only NEW payments (after last check)
        const newPayments = payments.filter(p => {
            const paymentDate = new Date(p.date || p.created_at || p.created || p.timestamp || 0);
            return paymentDate > lastCheckTime;
        });

        if (newPayments.length === 0) {
            await this._setLastCheckTime(panel.id, userId, new Date().toISOString());
            return;
        }

        console.log(`[PaymentPoll] Found ${newPayments.length} new payments on panel "${panel.alias}"`);

        // Process each new payment
        for (const payment of newPayments) {
            try {
                await this._notifyPayment(userId, panel, payment);
            } catch (notifErr) {
                console.error(`[PaymentPoll] Notification error for payment:`, notifErr.message);
                // Continue to next payment
            }
        }

        // Update last check time
        await this._setLastCheckTime(panel.id, userId, new Date().toISOString());
    }

    /**
     * Get the detected payments endpoint from panel scan results.
     * Returns the endpoint path or null if not available.
     */
    _getPaymentsEndpoint(panel) {
        if (!panel.endpointScanResults) return null;

        try {
            const scanResults = JSON.parse(panel.endpointScanResults);
            // Check if payments endpoint was detected
            if (scanResults.payments && scanResults.payments.detected) {
                return scanResults.payments.detected;
            }
        } catch (e) {
            // Invalid JSON — skip
        }

        return null;
    }

    /**
     * Fetch recent payments from panel admin API.
     */
    async _fetchPayments(panel, paymentsEndpoint) {
        try {
            const adminApiService = require('./adminApiService');

            // Determine if this is a V1 (Rental) or V2 (Perfect) panel
            const isRental = adminApiService.isRentalPanel(panel);

            let response;
            if (isRental) {
                // V1/Rental: action-based API
                response = await adminApiService.makeAdminRequest(panel, 'GET', '', {
                    action: 'getPayments',
                    limit: 20
                });
            } else {
                // V2/Perfect: RESTful API — strip admin API base prefix for makeAdminRequest
                const endpoint = paymentsEndpoint.replace(/^\/adminapi\/v[12]/, '');
                response = await adminApiService.makeAdminRequest(panel, 'GET', endpoint, {
                    limit: 20,
                    sort: 'desc'
                });
            }

            if (!response || !response.success) {
                return [];
            }

            // Parse payments from response
            return this._parsePayments(response.data || response);
        } catch (error) {
            console.error(`[PaymentPoll] fetchPayments error for "${panel.alias}":`, error.message);
            return [];
        }
    }

    /**
     * Parse payments from various API response formats.
     */
    _parsePayments(data) {
        // Format 1: { data: { list: [...] } } (PerfectPanel)
        if (data?.data?.list && Array.isArray(data.data.list)) {
            return data.data.list;
        }

        // Format 2: { data: [...] }
        if (data?.data && Array.isArray(data.data)) {
            return data.data;
        }

        // Format 3: Direct array
        if (Array.isArray(data)) {
            return data;
        }

        // Format 4: { payments: [...] }
        if (data?.payments && Array.isArray(data.payments)) {
            return data.payments;
        }

        // Format 5: Keyed object { "1": {...}, "2": {...} } (V1 panels)
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            const keys = Object.keys(data).filter(k =>
                !['success', 'error', 'status', 'data', 'payments'].includes(k)
            );
            if (keys.length > 0 && typeof data[keys[0]] === 'object') {
                return keys.map(k => ({ ...data[k], _key: k }));
            }
        }

        return [];
    }

    /**
     * Send WhatsApp notification for a payment.
     */
    async _notifyPayment(userId, panel, payment) {
        const username = payment.user || payment.username || payment.customer || null;
        if (!username) {
            return; // No username in payment data — can't notify
        }

        const amount = parseFloat(payment.amount || payment.sum || 0);
        if (amount <= 0) {
            return; // Not a credit payment
        }

        // Only notify for credit (not debit/deduction)
        const type = (payment.type || payment.status || '').toLowerCase();
        if (type === 'deduction' || type === 'debit' || type === 'charge') {
            return; // Skip deductions
        }

        const userNotificationService = require('./userNotificationService');
        const result = await userNotificationService.sendPaymentNotification(userId, username, {
            amount: amount,
            type: 'credit',
            method: payment.method || payment.gateway || panel.alias || 'Panel Payment',
            newBalance: parseFloat(payment.new_balance || payment.balance || 0),
            currency: payment.currency || 'USD'
        });

        if (result.sent) {
            console.log(`[PaymentPoll] ✅ Notified ${username} about $${amount.toFixed(2)} payment on "${panel.alias}"`);
        } else {
            console.log(`[PaymentPoll] ⚠️ Could not notify ${username}: ${result.reason || result.error || 'unknown'}`);
        }
    }

    /**
     * Get the last check timestamp from Setting table.
     */
    async _getLastCheckTime(panelId, userId) {
        try {
            const setting = await prisma.setting.findUnique({
                where: {
                    key_userId: {
                        key: `${SETTING_KEY_PREFIX}${panelId}`,
                        userId
                    }
                }
            });
            return setting?.value || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Set the last check timestamp in Setting table.
     */
    async _setLastCheckTime(panelId, userId, isoString) {
        try {
            await prisma.setting.upsert({
                where: {
                    key_userId: {
                        key: `${SETTING_KEY_PREFIX}${panelId}`,
                        userId
                    }
                },
                update: { value: isoString },
                create: {
                    key: `${SETTING_KEY_PREFIX}${panelId}`,
                    userId,
                    value: isoString
                }
            });
        } catch (e) {
            console.error('[PaymentPoll] Error saving last check time:', e.message);
        }
    }
}

module.exports = new PaymentPollingService();
