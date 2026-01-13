/**
 * Cryptomus Payment Gateway Service
 * Cryptocurrency payment integration
 * 
 * Testing:
 * - Test Webhook: https://api.cryptomus.com/v1/test-webhook/payment
 * - Recommended: Create trial invoice, pay with LTC for faster confirmation
 */

const crypto = require('crypto');
const axios = require('axios');
const prisma = require('../../utils/prisma');

class CryptomusService {
    constructor() {
        this.baseUrl = 'https://api.cryptomus.com/v1';

        // Credentials from environment
        this.merchantId = process.env.CRYPTOMUS_MERCHANT_ID || '';
        this.apiKey = process.env.CRYPTOMUS_API_KEY || '';

        this.isConfigured = !!(this.merchantId && this.apiKey);

        if (!this.isConfigured) {
            console.warn('[Cryptomus] Not configured - CRYPTOMUS_MERCHANT_ID and CRYPTOMUS_API_KEY required');
        } else {
            console.log('[Cryptomus] Initialized successfully');
        }
    }

    /**
     * Generate MD5 signature for Cryptomus API
     * @param {Object} payload - Request payload
     * @returns {string} MD5 signature
     */
    generateSignature(payload) {
        const base64Data = Buffer.from(JSON.stringify(payload)).toString('base64');
        return crypto
            .createHash('md5')
            .update(base64Data + this.apiKey)
            .digest('hex');
    }

    /**
     * Verify webhook signature
     * @param {Object} data - Webhook data
     * @param {string} receivedSign - Signature from webhook
     * @returns {boolean} Is valid
     */
    verifyWebhookSignature(data, receivedSign) {
        // Remove sign from data for verification
        const { sign, ...dataWithoutSign } = data;
        const expectedSign = this.generateSignature(dataWithoutSign);
        return expectedSign === receivedSign;
    }

    /**
     * Create a payment invoice
     * @param {Object} params - Payment parameters
     * @returns {Object} Invoice data
     */
    async createPayment(params) {
        const { userId, amount, currency = 'USD', orderId, description } = params;

        if (!this.isConfigured) {
            return {
                success: false,
                error: 'Cryptomus gateway not configured'
            };
        }

        // Generate unique order ID
        const orderUuid = `SMMC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        try {
            const payload = {
                amount: amount.toString(),
                currency,
                order_id: orderUuid,
                url_return: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/wallet?payment=processing`,
                url_success: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/wallet?payment=success`,
                url_callback: `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/webhooks/cryptomus`,
                is_payment_multiple: false,
                lifetime: 3600, // 1 hour
                to_currency: 'USDT' // Accept as USDT by default
            };

            const response = await axios.post(`${this.baseUrl}/payment`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'merchant': this.merchantId,
                    'sign': this.generateSignature(payload)
                }
            });

            if (response.data.state !== 0) {
                throw new Error(response.data.message || 'Failed to create payment');
            }

            const paymentData = response.data.result;

            // Store pending transaction
            const transaction = await prisma.walletTransaction.create({
                data: {
                    userId,
                    type: 'TOPUP',
                    amount: parseFloat(amount),
                    status: 'PENDING',
                    gateway: 'CRYPTOMUS',
                    gatewayRef: paymentData.uuid,
                    description: description || 'Wallet Top-up via Cryptomus',
                    metadata: JSON.stringify({
                        orderId: orderUuid,
                        paymentUrl: paymentData.url,
                        currency,
                        createdAt: new Date().toISOString()
                    })
                }
            });

            return {
                success: true,
                paymentUrl: paymentData.url,
                uuid: paymentData.uuid,
                transactionId: transaction.id,
                expiredAt: paymentData.expired_at
            };
        } catch (error) {
            console.error('[Cryptomus] Create payment error:', error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    /**
     * Check payment status
     * @param {string} uuid - Payment UUID
     * @returns {Object} Payment status
     */
    async checkPaymentStatus(uuid) {
        if (!this.isConfigured) {
            return { success: false, error: 'Gateway not configured' };
        }

        try {
            const payload = { uuid };

            const response = await axios.post(`${this.baseUrl}/payment/info`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'merchant': this.merchantId,
                    'sign': this.generateSignature(payload)
                }
            });

            return {
                success: true,
                data: response.data.result
            };
        } catch (error) {
            console.error('[Cryptomus] Status check error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Process webhook callback from Cryptomus
     * @param {Object} data - Webhook payload
     * @returns {Object} Processing result
     */
    async processWebhook(data) {
        const { uuid, order_id, status, amount, currency, sign } = data;

        console.log('[Cryptomus] Processing webhook for:', uuid);

        // Verify signature
        if (!this.verifyWebhookSignature(data, sign)) {
            console.error('[Cryptomus] Invalid webhook signature');
            return { success: false, error: 'Invalid signature' };
        }

        // Find transaction
        const transaction = await prisma.walletTransaction.findFirst({
            where: {
                gatewayRef: uuid,
                gateway: 'CRYPTOMUS'
            },
            include: { user: true }
        });

        if (!transaction) {
            console.error('[Cryptomus] Transaction not found:', uuid);
            return { success: false, error: 'Transaction not found' };
        }

        // Map Cryptomus status to our status
        const statusMap = {
            'paid': 'COMPLETED',
            'paid_over': 'COMPLETED',
            'confirm_check': 'PENDING',
            'wrong_amount': 'FAILED',
            'cancel': 'CANCELLED',
            'fail': 'FAILED',
            'system_fail': 'FAILED',
            'refund_process': 'REFUNDING',
            'refund_fail': 'FAILED',
            'refund_paid': 'REFUNDED'
        };

        const mappedStatus = statusMap[status] || 'PENDING';

        // Use atomic transaction to prevent race condition (double credit)
        const result = await prisma.$transaction(async (tx) => {
            // Re-fetch transaction inside transaction to get latest status
            const currentTx = await tx.walletTransaction.findUnique({
                where: { id: transaction.id }
            });

            // Double-check: if already completed, skip crediting
            const shouldCredit = mappedStatus === 'COMPLETED' && currentTx.status !== 'COMPLETED';

            // Parse metadata safely
            let existingMetadata = {};
            try {
                existingMetadata = JSON.parse(currentTx.metadata || '{}');
            } catch (e) {
                existingMetadata = {};
            }

            // Update transaction status
            await tx.walletTransaction.update({
                where: { id: transaction.id },
                data: {
                    status: mappedStatus,
                    metadata: JSON.stringify({
                        ...existingMetadata,
                        webhookStatus: status,
                        webhookAmount: amount,
                        webhookCurrency: currency,
                        updatedAt: new Date().toISOString()
                    })
                }
            });

            // Credit wallet only if this is the first completion
            if (shouldCredit) {
                await tx.user.update({
                    where: { id: transaction.userId },
                    data: {
                        creditBalance: {
                            increment: transaction.amount
                        }
                    }
                });
                console.log(`[Cryptomus] Credited ${transaction.amount} to user ${transaction.userId}`);
                return { credited: true };
            }

            return { credited: false };
        });

        return {
            success: true,
            status: mappedStatus,
            transactionId: transaction.id,
            credited: result.credited
        };
    }

    /**
     * Test webhook endpoint (for development)
     */
    async testWebhook(paymentUuid) {
        try {
            const payload = { uuid: paymentUuid };

            const response = await axios.post(`${this.baseUrl}/test-webhook/payment`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'merchant': this.merchantId,
                    'sign': this.generateSignature(payload)
                }
            });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('[Cryptomus] Test webhook error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get gateway info
     */
    getGatewayInfo() {
        return {
            id: 'cryptomus',
            name: 'Cryptomus',
            description: 'Pay with Cryptocurrency (BTC, ETH, USDT, LTC)',
            icon: '💎',
            currency: 'USD',
            minAmount: 1,
            maxAmount: 100000,
            isAvailable: this.isConfigured,
            isSandbox: false,
            supportedCrypto: ['BTC', 'ETH', 'USDT', 'LTC', 'TRX', 'BNB']
        };
    }
}

module.exports = new CryptomusService();
