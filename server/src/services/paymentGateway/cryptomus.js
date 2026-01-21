/**
 * Cryptomus Payment Gateway Service
 * Cryptocurrency payment integration
 * 
 * Testing:
 * - Test Webhook: https://api.cryptomus.com/v1/test-webhook/payment
 * - Recommended: Create trial invoice, pay with LTC for faster confirmation
 * 
 * API Docs: https://doc.cryptomus.com/
 */

const crypto = require('crypto');
const axios = require('axios');
const prisma = require('../../utils/prisma');

class CryptomusService {
    constructor() {
        this.baseUrl = 'https://api.cryptomus.com/v1';
        console.log('[Cryptomus] Service initialized');
    }

    /**
     * Get Cryptomus configuration from admin settings
     * @returns {Object} Cryptomus configuration
     */
    async getConfig() {
        try {
            // Fetch config from admin settings (SystemConfig table)
            const configs = await prisma.systemConfig.findMany({
                where: {
                    key: {
                        in: ['cryptomus_enabled', 'cryptomus_merchant_id', 'cryptomus_api_key']
                    }
                }
            });

            // Convert to object
            const configMap = {};
            configs.forEach(c => {
                configMap[c.key] = c.value;
            });

            const isEnabled = configMap.cryptomus_enabled === 'true' || configMap.cryptomus_enabled === true;
            const merchantId = configMap.cryptomus_merchant_id || process.env.CRYPTOMUS_MERCHANT_ID || '';
            const apiKey = configMap.cryptomus_api_key || process.env.CRYPTOMUS_API_KEY || '';

            return {
                enabled: isEnabled,
                merchantId,
                apiKey,
                isConfigured: !!(merchantId && apiKey)
            };
        } catch (error) {
            console.error('[Cryptomus] Failed to get config:', error.message);
            // Fallback to environment variables
            const merchantId = process.env.CRYPTOMUS_MERCHANT_ID || '';
            const apiKey = process.env.CRYPTOMUS_API_KEY || '';
            return {
                enabled: false,
                merchantId,
                apiKey,
                isConfigured: !!(merchantId && apiKey)
            };
        }
    }

    /**
     * Generate MD5 signature for Cryptomus API
     * @param {Object} payload - Request payload
     * @param {string} apiKey - API Key
     * @returns {string} MD5 signature
     */
    generateSignature(payload, apiKey) {
        const base64Data = Buffer.from(JSON.stringify(payload)).toString('base64');
        return crypto
            .createHash('md5')
            .update(base64Data + apiKey)
            .digest('hex');
    }

    /**
     * Verify webhook signature
     * @param {Object} data - Webhook data
     * @param {string} receivedSign - Signature from webhook
     * @param {string} apiKey - API Key
     * @returns {boolean} Is valid
     */
    verifyWebhookSignature(data, receivedSign, apiKey) {
        // Remove sign from data for verification
        const { sign, ...dataWithoutSign } = data;
        const expectedSign = this.generateSignature(dataWithoutSign, apiKey);
        return expectedSign === receivedSign;
    }

    /**
     * Create a payment invoice
     * @param {Object} params - Payment parameters
     * @returns {Object} Invoice data
     */
    async createPayment(params) {
        const { userId, amount, currency = 'USD', orderId, description } = params;

        // Get current config from database
        const config = await this.getConfig();

        if (!config.enabled) {
            return {
                success: false,
                error: 'Cryptomus payment is not enabled'
            };
        }

        if (!config.isConfigured) {
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
                url_callback: `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/payment-webhooks/cryptomus`,
                is_payment_multiple: false,
                lifetime: 3600, // 1 hour
                to_currency: 'USDT' // Accept as USDT by default
            };

            const response = await axios.post(`${this.baseUrl}/payment`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'merchant': config.merchantId,
                    'sign': this.generateSignature(payload, config.apiKey)
                },
                timeout: 15000
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
        const config = await this.getConfig();

        if (!config.isConfigured) {
            return { success: false, error: 'Gateway not configured' };
        }

        try {
            const payload = { uuid };

            const response = await axios.post(`${this.baseUrl}/payment/info`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'merchant': config.merchantId,
                    'sign': this.generateSignature(payload, config.apiKey)
                },
                timeout: 10000
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

        console.log('[Cryptomus] Processing webhook for:', uuid, 'status:', status);

        // Get config for signature verification
        const config = await this.getConfig();

        // Verify signature
        if (!this.verifyWebhookSignature(data, sign, config.apiKey)) {
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

                // Create credit transaction record
                await tx.creditTransaction.create({
                    data: {
                        userId: transaction.userId,
                        type: 'CREDIT',
                        amount: transaction.amount,
                        balanceBefore: transaction.user.creditBalance,
                        balanceAfter: transaction.user.creditBalance + transaction.amount,
                        description: `Cryptomus payment +$${transaction.amount.toFixed(2)}`,
                        reference: transaction.gatewayRef
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
        const config = await this.getConfig();

        if (!config.isConfigured) {
            return { success: false, error: 'Gateway not configured' };
        }

        try {
            const payload = { uuid: paymentUuid };

            const response = await axios.post(`${this.baseUrl}/test-webhook/payment`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'merchant': config.merchantId,
                    'sign': this.generateSignature(payload, config.apiKey)
                },
                timeout: 10000
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
    async getGatewayInfo() {
        const config = await this.getConfig();

        return {
            id: 'cryptomus',
            name: 'Cryptomus',
            description: 'Pay with Cryptocurrency (BTC, ETH, USDT, LTC)',
            icon: '💎',
            currency: 'USD',
            minAmount: 1,
            maxAmount: 100000,
            isAvailable: config.enabled && config.isConfigured,
            isSandbox: false,
            supportedCrypto: ['BTC', 'ETH', 'USDT', 'LTC', 'TRX', 'BNB', 'DOGE', 'SOL']
        };
    }
}

module.exports = new CryptomusService();
