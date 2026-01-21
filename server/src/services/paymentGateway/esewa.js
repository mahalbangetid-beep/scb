/**
 * Esewa Payment Gateway Service
 * Full implementation with sandbox/production toggle from admin settings
 * 
 * Sandbox Environment:
 * - Gateway URL: https://rc-epay.esewa.com.np
 * - Test eSewa IDs: 9806800001 - 9806800005
 * - Test Password: Nepal@123
 * - Test MPIN: 1122
 * - Merchant ID: EPAYTEST
 * 
 * Production Environment:
 * - Gateway URL: https://epay.esewa.com.np
 */

const crypto = require('crypto');
const axios = require('axios');
const prisma = require('../../utils/prisma');

class EsewaService {
    constructor() {
        // Default URLs (will be overridden by getConfig)
        this.sandboxGatewayUrl = 'https://rc-epay.esewa.com.np';
        this.productionGatewayUrl = 'https://epay.esewa.com.np';
        this.sandboxVerifyUrl = 'https://rc-epay.esewa.com.np/api/epay/transaction/status/';
        this.productionVerifyUrl = 'https://epay.esewa.com.np/api/epay/transaction/status/';

        // Default sandbox credentials
        this.defaultMerchantCode = 'EPAYTEST';
        this.defaultSecretKey = '8gBm/:&EnhH.1/q';

        console.log('[Esewa] Service initialized');
    }

    /**
     * Get eSewa configuration from admin settings
     * @returns {Object} eSewa configuration
     */
    async getConfig() {
        try {
            // Fetch config from admin settings (SystemConfig table)
            const configs = await prisma.systemConfig.findMany({
                where: {
                    key: {
                        in: ['esewa_enabled', 'esewa_merchant_code', 'esewa_secret_key', 'esewa_sandbox']
                    }
                }
            });

            // Convert to object
            const configMap = {};
            configs.forEach(c => {
                configMap[c.key] = c.value;
            });

            const isSandbox = configMap.esewa_sandbox === 'true' || configMap.esewa_sandbox === true;
            const isEnabled = configMap.esewa_enabled === 'true' || configMap.esewa_enabled === true;

            return {
                enabled: isEnabled,
                isSandbox,
                merchantCode: configMap.esewa_merchant_code || this.defaultMerchantCode,
                secretKey: configMap.esewa_secret_key || this.defaultSecretKey,
                gatewayUrl: isSandbox ? this.sandboxGatewayUrl : this.productionGatewayUrl,
                verifyUrl: isSandbox ? this.sandboxVerifyUrl : this.productionVerifyUrl
            };
        } catch (error) {
            console.error('[Esewa] Failed to get config:', error.message);
            // Return defaults (sandbox mode)
            return {
                enabled: false,
                isSandbox: true,
                merchantCode: this.defaultMerchantCode,
                secretKey: this.defaultSecretKey,
                gatewayUrl: this.sandboxGatewayUrl,
                verifyUrl: this.sandboxVerifyUrl
            };
        }
    }

    /**
     * Generate HMAC SHA256 signature for eSewa v2 API
     * @param {string} message - Message to sign
     * @param {string} secretKey - Secret key for signing
     * @returns {string} Base64 encoded signature
     */
    generateSignature(message, secretKey) {
        return crypto
            .createHmac('sha256', secretKey)
            .update(message)
            .digest('base64');
    }

    /**
     * Create a payment request
     * @param {Object} params - Payment parameters
     * @returns {Object} Payment form data for redirect
     */
    async createPayment(params) {
        const { userId, amount, orderId, description } = params;

        // Get current config from database
        const config = await this.getConfig();

        if (!config.enabled) {
            throw new Error('eSewa payment is not enabled');
        }

        console.log(`[Esewa] Creating payment in ${config.isSandbox ? 'SANDBOX' : 'PRODUCTION'} mode`);

        // Generate unique transaction UUID
        const transactionUuid = `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Prepare signature message
        const signatureMessage = `total_amount=${amount},transaction_uuid=${transactionUuid},product_code=${config.merchantCode}`;
        const signature = this.generateSignature(signatureMessage, config.secretKey);

        // Store pending transaction in database
        const transaction = await prisma.walletTransaction.create({
            data: {
                userId,
                type: 'TOPUP',
                amount: parseFloat(amount),
                status: 'PENDING',
                gateway: 'ESEWA',
                gatewayRef: transactionUuid,
                description: description || 'Wallet Top-up via eSewa',
                metadata: JSON.stringify({
                    orderId,
                    signature,
                    isSandbox: config.isSandbox,
                    createdAt: new Date().toISOString()
                })
            }
        });

        // Return form data for client-side redirect
        const formData = {
            amount: amount.toString(),
            tax_amount: '0',
            total_amount: amount.toString(),
            transaction_uuid: transactionUuid,
            product_code: config.merchantCode,
            product_service_charge: '0',
            product_delivery_charge: '0',
            success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/wallet?payment=success`,
            failure_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/wallet?payment=failed`,
            signed_field_names: 'total_amount,transaction_uuid,product_code',
            signature
        };

        return {
            success: true,
            gatewayUrl: `${config.gatewayUrl}/api/epay/main/v2/form`,
            formData,
            transactionId: transaction.id,
            transactionUuid,
            isSandbox: config.isSandbox
        };
    }

    /**
     * Verify payment status from eSewa
     * @param {string} transactionUuid - Transaction UUID
     * @param {number} totalAmount - Expected amount
     * @returns {Object} Verification result
     */
    async verifyPayment(transactionUuid, totalAmount) {
        const config = await this.getConfig();

        try {
            const response = await axios.get(config.verifyUrl, {
                params: {
                    product_code: config.merchantCode,
                    total_amount: totalAmount,
                    transaction_uuid: transactionUuid
                },
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            const data = response.data;

            // eSewa returns status in response
            if (data.status === 'COMPLETE') {
                return {
                    success: true,
                    verified: true,
                    status: 'COMPLETE',
                    refId: data.ref_id,
                    data
                };
            }

            return {
                success: true,
                verified: false,
                status: data.status,
                data
            };
        } catch (error) {
            console.error('[Esewa] Verification error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Process payment callback/return
     * @param {Object} params - Callback parameters from eSewa
     * @returns {Object} Processing result
     */
    async processCallback(params) {
        const { data } = params; // Base64 encoded response from eSewa
        const config = await this.getConfig();

        try {
            // Decode the base64 data
            const decodedData = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
            const { transaction_uuid, status, total_amount, transaction_code, signed_field_names, signature } = decodedData;

            console.log('[Esewa] Processing callback for:', transaction_uuid);

            // Find the transaction
            const transaction = await prisma.walletTransaction.findFirst({
                where: {
                    gatewayRef: transaction_uuid,
                    gateway: 'ESEWA'
                },
                include: {
                    user: true
                }
            });

            if (!transaction) {
                console.error('[Esewa] Transaction not found:', transaction_uuid);
                return { success: false, error: 'Transaction not found' };
            }

            // Verify signature
            const signatureMessage = signed_field_names.split(',')
                .map(field => `${field}=${decodedData[field]}`)
                .join(',');
            const expectedSignature = this.generateSignature(signatureMessage, config.secretKey);

            if (signature !== expectedSignature) {
                console.error('[Esewa] Signature mismatch');
                await this.updateTransactionStatus(transaction.id, 'FAILED', { error: 'Signature mismatch' });
                return { success: false, error: 'Invalid signature' };
            }

            // Verify payment with eSewa API
            const verification = await this.verifyPayment(transaction_uuid, total_amount);

            if (!verification.success || !verification.verified) {
                await this.updateTransactionStatus(transaction.id, 'FAILED', {
                    error: 'Verification failed',
                    verification
                });
                return { success: false, error: 'Payment verification failed' };
            }

            // Use atomic transaction to prevent race condition (double credit)
            const result = await prisma.$transaction(async (tx) => {
                // Re-fetch transaction inside transaction to get latest status
                const currentTx = await tx.walletTransaction.findUnique({
                    where: { id: transaction.id }
                });

                // Double-check: if already completed, skip crediting
                if (currentTx.status === 'COMPLETED') {
                    return { credited: false, alreadyCompleted: true };
                }

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
                        status: 'COMPLETED',
                        metadata: JSON.stringify({
                            ...existingMetadata,
                            refId: transaction_code,
                            verificationData: verification.data,
                            updatedAt: new Date().toISOString()
                        })
                    }
                });

                // Credit user wallet
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
                        description: `eSewa payment +NPR ${transaction.amount.toFixed(2)}`,
                        reference: transaction.gatewayRef
                    }
                });

                return { credited: true };
            });

            if (result.credited) {
                console.log(`[Esewa] Successfully credited ${transaction.amount} to user ${transaction.userId}`);
            } else {
                console.log(`[Esewa] Transaction already completed, skipping credit for ${transaction.id}`);
            }

            return {
                success: true,
                transactionId: transaction.id,
                amount: transaction.amount,
                userId: transaction.userId,
                credited: result.credited
            };
        } catch (error) {
            console.error('[Esewa] Callback processing error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update transaction status
     */
    async updateTransactionStatus(transactionId, status, additionalData = {}) {
        const transaction = await prisma.walletTransaction.findUnique({
            where: { id: transactionId }
        });

        // Parse metadata safely
        let existingMetadata = {};
        try {
            existingMetadata = JSON.parse(transaction.metadata || '{}');
        } catch (e) {
            existingMetadata = {};
        }
        const updatedMetadata = { ...existingMetadata, ...additionalData, updatedAt: new Date().toISOString() };

        return prisma.walletTransaction.update({
            where: { id: transactionId },
            data: {
                status,
                metadata: JSON.stringify(updatedMetadata)
            }
        });
    }

    /**
     * Get gateway info for frontend
     */
    async getGatewayInfo() {
        const config = await this.getConfig();

        return {
            id: 'esewa',
            name: 'eSewa',
            description: 'Pay with eSewa (Nepal)',
            icon: '📱',
            currency: 'NPR',
            minAmount: 10,
            maxAmount: 100000,
            isAvailable: config.enabled,
            isSandbox: config.isSandbox,
            countries: ['NP'],
            testCredentials: config.isSandbox ? {
                esewaIds: '9806800001 - 9806800005',
                password: 'Nepal@123',
                mpin: '1122'
            } : null
        };
    }
}

module.exports = new EsewaService();
