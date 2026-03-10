/**
 * Binance Manual Payment Verification Service
 * 
 * P2P-style payment where:
 * - Panel owner configures their Binance QR code and API credentials
 * - Customer pays via QR and submits Transaction ID
 * - System verifies via Binance API and credits balance
 * 
 * Uses Binance Exchange API (not Binance Pay Merchant API)
 * API Reference: https://binance-docs.github.io/apidocs/spot/en/#pay-endpoints
 */

const crypto = require('crypto');
const axios = require('axios');
const prisma = require('../../utils/prisma');

class BinancePayService {
    constructor() {
        this.baseUrl = 'https://api.binance.com';
        console.log('[BinancePay] Manual verification service initialized');
    }

    /**
     * Generate HMAC-SHA256 signature for Binance API
     */
    generateSignature(queryString, apiSecret) {
        return crypto
            .createHmac('sha256', apiSecret)
            .update(queryString)
            .digest('hex');
    }

    /**
     * Get Binance configuration from admin settings (SystemConfig)
     * This is the main config used for ALL customers
     */
    async getConfig() {
        try {
            const configs = await prisma.systemConfig.findMany({
                where: {
                    key: {
                        in: [
                            'binance_enabled', 'binance_id', 'binance_api_key', 'binance_secret',
                            'binance_qr_url', 'binance_min_amount', 'binance_bonus',
                            'binance_name', 'binance_currency'
                        ]
                    }
                }
            });

            const configMap = {};
            configs.forEach(c => {
                configMap[c.key] = c.value;
            });

            // Parse values
            const isEnabled = configMap.binance_enabled === 'true' || configMap.binance_enabled === true;

            return {
                enabled: isEnabled,
                binanceId: configMap.binance_id || '',
                binanceApiKey: configMap.binance_api_key || '',
                binanceSecret: configMap.binance_secret || '',
                binanceQrUrl: configMap.binance_qr_url || '',
                binanceMinAmount: parseFloat(configMap.binance_min_amount) || 1,
                binanceBonus: parseFloat(configMap.binance_bonus) || 0,
                binanceName: configMap.binance_name || 'Binance',
                binanceCurrency: configMap.binance_currency || 'USDT',
                isConfigured: !!(configMap.binance_api_key && configMap.binance_secret)
            };
        } catch (error) {
            console.error('[BinancePay] Failed to get config:', error.message);
            return {
                enabled: false,
                binanceId: '',
                binanceApiKey: '',
                binanceSecret: '',
                binanceQrUrl: '',
                binanceMinAmount: 1,
                binanceBonus: 0,
                binanceName: 'Binance',
                binanceCurrency: 'USDT',
                isConfigured: false
            };
        }
    }

    /**
     * Get user's payment configuration (LEGACY - used by settings API)
     * @deprecated Use getConfig() instead for payment flow
     */
    async getUserConfig(userId) {
        // First try to get from SystemConfig (preferred)
        const systemConfig = await this.getConfig();

        if (systemConfig.enabled && systemConfig.isConfigured) {
            return {
                binanceEnabled: systemConfig.enabled,
                binanceId: systemConfig.binanceId,
                binanceQrUrl: systemConfig.binanceQrUrl,
                binanceMinAmount: systemConfig.binanceMinAmount,
                binanceBonus: systemConfig.binanceBonus,
                binanceName: systemConfig.binanceName,
                binanceCurrency: systemConfig.binanceCurrency,
                hasApiKey: !!systemConfig.binanceApiKey,
                hasSecret: !!systemConfig.binanceSecret
            };
        }

        // Fallback to per-user config (legacy)
        let config = await prisma.userPaymentConfig.findUnique({
            where: { userId }
        });

        if (!config) {
            config = await prisma.userPaymentConfig.create({
                data: { userId }
            });
        }

        return {
            binanceEnabled: config.binanceEnabled,
            binanceId: config.binanceId,
            binanceQrUrl: config.binanceQrUrl,
            binanceMinAmount: config.binanceMinAmount,
            binanceBonus: config.binanceBonus,
            binanceName: config.binanceName,
            binanceCurrency: config.binanceCurrency,
            hasApiKey: !!config.binanceApiKey,
            hasSecret: !!config.binanceSecret
        };
    }

    /**
     * Save user's payment configuration
     */
    async saveUserConfig(userId, data) {
        const {
            binanceEnabled,
            binanceId,
            binanceApiKey,
            binanceSecret,
            binanceQrUrl,
            binanceMinAmount,
            binanceBonus,
            binanceName,
            binanceCurrency
        } = data;

        const updateData = {};

        if (binanceEnabled !== undefined) updateData.binanceEnabled = binanceEnabled;
        if (binanceId !== undefined) updateData.binanceId = binanceId;
        if (binanceQrUrl !== undefined) updateData.binanceQrUrl = binanceQrUrl;
        if (binanceMinAmount !== undefined) updateData.binanceMinAmount = parseFloat(binanceMinAmount) || 1;
        if (binanceBonus !== undefined) updateData.binanceBonus = parseFloat(binanceBonus) || 0;
        if (binanceName !== undefined) updateData.binanceName = binanceName;
        if (binanceCurrency !== undefined) updateData.binanceCurrency = binanceCurrency;

        // Only update API credentials if provided (not masked values)
        if (binanceApiKey && !binanceApiKey.includes('*') && !binanceApiKey.includes('•')) {
            updateData.binanceApiKey = binanceApiKey;
        }
        if (binanceSecret && !binanceSecret.includes('*') && !binanceSecret.includes('•')) {
            updateData.binanceSecret = binanceSecret;
        }

        const config = await prisma.userPaymentConfig.upsert({
            where: { userId },
            update: updateData,
            create: { userId, ...updateData }
        });

        return {
            success: true,
            message: 'Binance configuration saved',
            config: {
                binanceEnabled: config.binanceEnabled,
                binanceId: config.binanceId,
                binanceQrUrl: config.binanceQrUrl,
                binanceMinAmount: config.binanceMinAmount,
                binanceBonus: config.binanceBonus,
                binanceName: config.binanceName,
                binanceCurrency: config.binanceCurrency,
                hasApiKey: !!config.binanceApiKey,
                hasSecret: !!config.binanceSecret
            }
        };
    }

    /**
     * Verify a transaction using admin's API credentials from SystemConfig
     * Customer submits Transaction ID, we verify via Binance API
     */
    async verifyTransaction(userId, transactionId, expectedAmount = null) {
        // Get config from SystemConfig (admin settings)
        const config = await this.getConfig();

        if (!config.enabled) {
            return { success: false, error: 'Binance payment is not enabled' };
        }

        if (!config.isConfigured) {
            return { success: false, error: 'Binance API credentials not configured' };
        }

        const cleanTxnId = transactionId.trim();
        console.log(`[BinancePay] Verifying transaction: "${cleanTxnId}" for expected amount: ${expectedAmount}`);

        // Attempt 1: Binance Pay transaction history
        try {
            const timestamp = Date.now();
            const queryParams = `timestamp=${timestamp}&recvWindow=60000`;
            const signature = this.generateSignature(queryParams, config.binanceSecret);

            const response = await axios.get(
                `${this.baseUrl}/sapi/v1/pay/transactions?${queryParams}&signature=${signature}`,
                {
                    headers: { 'X-MBX-APIKEY': config.binanceApiKey },
                    timeout: 15000
                }
            );

            if (response.data.code && response.data.code !== 0) {
                console.error('[BinancePay] Pay API Error:', response.data);
                // Don't return immediately — try C2C fallback below
            } else {
                const transactions = response.data.data || [];
                console.log(`[BinancePay] Pay API returned ${transactions.length} transactions`);

                // Match with flexible comparison: trim, case-insensitive, partial match
                const matchedTx = transactions.find(tx => {
                    const fields = [
                        tx.transactionId, tx.orderId, tx.orderNo,
                        tx.tranId, tx.orderNumber
                    ].filter(Boolean).map(f => String(f).trim().toLowerCase());
                    return fields.includes(cleanTxnId.toLowerCase());
                });

                if (matchedTx) {
                    console.log('[BinancePay] Matched via Pay API:', JSON.stringify(matchedTx).substring(0, 200));
                    return this._validateMatchedTransaction(matchedTx, cleanTxnId, expectedAmount, config);
                }

                // Log first few transactions for debugging
                if (transactions.length > 0) {
                    console.log('[BinancePay] Sample transaction IDs:', transactions.slice(0, 3).map(tx => ({
                        transactionId: tx.transactionId, orderId: tx.orderId, orderNo: tx.orderNo, amount: tx.amount
                    })));
                }
            }
        } catch (payError) {
            console.warn('[BinancePay] Pay API failed:', payError.response?.data?.msg || payError.message);
            if (payError.response?.status === 401) {
                return { success: false, error: 'Invalid API credentials. Please check your API Key and Secret.' };
            }
        }

        // Attempt 2: C2C (P2P) trade history — some users send via P2P, not Pay
        try {
            const timestamp2 = Date.now();
            const c2cParams = `timestamp=${timestamp2}&recvWindow=60000&tradeType=BUY`;
            const c2cSignature = this.generateSignature(c2cParams, config.binanceSecret);

            const c2cResponse = await axios.get(
                `${this.baseUrl}/sapi/v1/c2c/orderMatch/listUserOrderHistory?${c2cParams}&signature=${c2cSignature}`,
                {
                    headers: { 'X-MBX-APIKEY': config.binanceApiKey },
                    timeout: 15000
                }
            );

            if (c2cResponse.data.data && Array.isArray(c2cResponse.data.data)) {
                const c2cOrders = c2cResponse.data.data;
                console.log(`[BinancePay] C2C API returned ${c2cOrders.length} orders`);

                const matchedC2C = c2cOrders.find(order => {
                    const fields = [
                        order.orderNumber, order.advNo, order.tradeId
                    ].filter(Boolean).map(f => String(f).trim().toLowerCase());
                    return fields.includes(cleanTxnId.toLowerCase());
                });

                if (matchedC2C) {
                    console.log('[BinancePay] Matched via C2C API:', JSON.stringify(matchedC2C).substring(0, 200));
                    const txAmount = parseFloat(matchedC2C.totalPrice) || parseFloat(matchedC2C.amount) || 0;

                    if (matchedC2C.orderStatus !== 'COMPLETED' && matchedC2C.orderStatus !== '4') {
                        return {
                            success: false,
                            error: `C2C order status: ${matchedC2C.orderStatus}. Not completed yet.`,
                            status: matchedC2C.orderStatus
                        };
                    }

                    if (expectedAmount && txAmount < expectedAmount) {
                        return {
                            success: false,
                            error: `Amount mismatch. Expected: ${expectedAmount}, Received: ${txAmount}`,
                            amount: txAmount
                        };
                    }

                    return {
                        success: true, verified: true,
                        transactionId: matchedC2C.orderNumber || cleanTxnId,
                        amount: txAmount,
                        currency: matchedC2C.asset || config.binanceCurrency,
                        status: 'COMPLETED',
                        timestamp: matchedC2C.createTime
                    };
                }
            }
        } catch (c2cError) {
            console.warn('[BinancePay] C2C API failed (may not have permission):', c2cError.response?.data?.msg || c2cError.message);
        }

        // Both attempts failed — provide helpful error
        console.log(`[BinancePay] Transaction "${cleanTxnId}" not found in Pay or C2C history`);
        return {
            success: false,
            error: 'Transaction not found. Please ensure:\n1. The Transaction ID is correct\n2. The payment was completed\n3. Your API Key has "Binance Pay" permission enabled\n\nIf using P2P transfer, paste the Order Number from P2P history.',
            notFound: true
        };
    }

    /**
     * Validate a matched Pay transaction (extracted to avoid code duplication)
     * This is a NEW private helper — does NOT modify any existing method.
     */
    _validateMatchedTransaction(matchedTx, transactionId, expectedAmount, config) {
        // Check if transaction status is completed
        if (matchedTx.status !== 'SUCCESS' && matchedTx.status !== 'COMPLETED') {
            return {
                success: false,
                error: `Transaction status: ${matchedTx.status}. Payment not completed yet.`,
                status: matchedTx.status
            };
        }

        // Verify amount if expected
        const txAmount = parseFloat(matchedTx.amount) || parseFloat(matchedTx.totalPayAmount) || 0;

        if (expectedAmount && txAmount < expectedAmount) {
            return {
                success: false,
                error: `Amount mismatch. Expected: ${expectedAmount}, Received: ${txAmount}`,
                amount: txAmount
            };
        }

        // Transaction verified!
        return {
            success: true,
            verified: true,
            transactionId: matchedTx.transactionId || transactionId,
            amount: txAmount,
            currency: matchedTx.currency || matchedTx.asset || config.binanceCurrency,
            status: matchedTx.status,
            timestamp: matchedTx.transactionTime || matchedTx.createTime
        };
    }

    /**
     * Create a pending payment record (before verification)
     */
    async createPendingPayment(userId, amount, currency = 'USDT') {
        const transaction = await prisma.payment.create({
            data: {
                userId,
                amount: parseFloat(amount),
                currency,
                method: 'BINANCE',
                status: 'PENDING',
                reference: `BNB-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
                metadata: JSON.stringify({
                    gateway: 'binance_manual',
                    createdAt: new Date().toISOString()
                })
            }
        });

        return {
            success: true,
            paymentId: transaction.id,
            reference: transaction.reference,
            amount: transaction.amount,
            currency: transaction.currency
        };
    }

    /**
     * Complete payment after successful verification
     */
    async completePayment(paymentId, verificationResult) {
        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: { user: true }
        });

        if (!payment) {
            return { success: false, error: 'Payment not found' };
        }

        if (payment.status === 'COMPLETED') {
            return { success: false, error: 'Payment already completed' };
        }

        // Get bonus percentage from SystemConfig (admin settings)
        const config = await this.getConfig();
        const bonusPercent = config.binanceBonus || 0;
        const bonusAmount = (verificationResult.amount * bonusPercent) / 100;
        const totalCredit = verificationResult.amount + bonusAmount;

        // Use transaction to prevent double credit
        const result = await prisma.$transaction(async (tx) => {
            // Update payment status
            await tx.payment.update({
                where: { id: paymentId },
                data: {
                    status: 'COMPLETED',
                    transactionId: verificationResult.transactionId,
                    completedAt: new Date(),
                    metadata: JSON.stringify({
                        gateway: 'binance_manual',
                        verified: true,
                        originalAmount: verificationResult.amount,
                        bonusPercent,
                        bonusAmount,
                        totalCredit,
                        verifiedAt: new Date().toISOString()
                    })
                }
            });

            // Credit user balance
            await tx.user.update({
                where: { id: payment.userId },
                data: {
                    creditBalance: {
                        increment: totalCredit
                    }
                }
            });

            // Create credit transaction record
            await tx.creditTransaction.create({
                data: {
                    userId: payment.userId,
                    type: 'CREDIT',
                    amount: totalCredit,
                    balanceBefore: payment.user.creditBalance,
                    balanceAfter: payment.user.creditBalance + totalCredit,
                    description: `Binance payment +$${verificationResult.amount.toFixed(2)}${bonusAmount > 0 ? ` (+$${bonusAmount.toFixed(2)} bonus)` : ''}`,
                    reference: payment.reference
                }
            });

            return { totalCredit, bonusAmount };
        });

        console.log(`[BinancePay] Payment completed: ${paymentId}, credited: $${result.totalCredit}`);

        // Auto-generate invoice
        try {
            const invoiceService = require('../invoiceService');
            await invoiceService.createFromPayment({
                paymentId,
                userId: payment.userId,
                amount: result.totalCredit,
                currency: payment.currency || 'USD',
                method: 'BINANCE',
                description: `Credit Top-Up via Binance${result.bonusAmount > 0 ? ` (includes $${result.bonusAmount.toFixed(2)} bonus)` : ''}`,
                metadata: { gateway: 'binance', bonusAmount: result.bonusAmount }
            });
        } catch (invoiceError) {
            console.error('[BinancePay] Invoice generation failed:', invoiceError.message);
        }

        return {
            success: true,
            message: 'Payment verified and credited successfully!',
            credited: result.totalCredit,
            bonus: result.bonusAmount
        };
    }

    /**
     * Get gateway info for display
     */
    async getGatewayInfo() {
        const config = await this.getConfig();

        // Read allowed countries from config
        let countries = ['*']; // default: all countries
        try {
            const countriesConfig = await prisma.systemConfig.findFirst({
                where: { key: 'binance_countries' }
            });
            if (countriesConfig && countriesConfig.value && countriesConfig.value.trim()) {
                countries = countriesConfig.value.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
            }
        } catch (e) { /* use default */ }

        // Read disallowed countries from config
        let disallowedCountries = [];
        try {
            const dcConfig = await prisma.systemConfig.findFirst({
                where: { key: 'binance_disallowed_countries' }
            });
            if (dcConfig && dcConfig.value && dcConfig.value.trim()) {
                disallowedCountries = dcConfig.value.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
            }
        } catch (e) { /* use default */ }

        return {
            id: 'binance',
            name: config.binanceName || 'Binance',
            description: 'Pay with Binance (USDT/USDC/BUSD)',
            icon: '💎',
            currency: config.binanceCurrency || 'USDT',
            minAmount: config.binanceMinAmount || 1,
            maxAmount: 100000,
            isAvailable: config.enabled && config.isConfigured,
            requiresVerification: true,
            supportedCrypto: ['USDT', 'USDC', 'BUSD'],
            countries,
            disallowedCountries
        };
    }
}

module.exports = new BinancePayService();
