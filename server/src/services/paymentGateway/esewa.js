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
                        in: [
                            'esewa_enabled', 'esewa_merchant_code', 'esewa_secret_key', 'esewa_sandbox',
                            'esewa_exchange_rate', 'esewa_exchange_mode',
                            'esewa_min_amount', 'esewa_max_amount',
                            'esewa_bonus', 'esewa_tax',
                            'esewa_instructions'
                        ]
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
                verifyUrl: isSandbox ? this.sandboxVerifyUrl : this.productionVerifyUrl,
                // Exchange rate settings (NPR → USD conversion)
                exchangeRate: parseFloat(configMap.esewa_exchange_rate) || 133.50, // Default NPR/USD rate
                exchangeMode: configMap.esewa_exchange_mode || 'manual', // 'manual' or 'auto'
                // Payment limits & extras
                minAmount: parseFloat(configMap.esewa_min_amount) || 10, // Min NPR
                maxAmount: parseFloat(configMap.esewa_max_amount) || 100000, // Max NPR
                bonusPercent: parseFloat(configMap.esewa_bonus) || 0, // Bonus %
                taxPercent: parseFloat(configMap.esewa_tax) || 0, // Tax %
                instructions: configMap.esewa_instructions || '',
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
                verifyUrl: this.sandboxVerifyUrl,
                exchangeRate: 133.50,
                exchangeMode: 'manual',
                minAmount: 10,
                maxAmount: 100000,
                bonusPercent: 0,
                taxPercent: 0,
                instructions: '',
            };
        }
    }

    /**
     * Convert NPR amount to USD using configured exchange rate
     * Applies tax deduction and bonus addition.
     * @param {number} nprAmount - Amount in NPR
     * @param {Object} config - Config from getConfig()
     * @returns {Object} { usdAmount, nprAmount, exchangeRate, tax, bonus, breakdown }
     */
    convertNprToUsd(nprAmount, config) {
        const exchangeRate = config.exchangeRate;
        const rawUsd = nprAmount / exchangeRate;

        // Calculate tax (deducted)
        const taxPercent = config.taxPercent || 0;
        const taxAmount = rawUsd * (taxPercent / 100);

        // Calculate bonus (added)
        const bonusPercent = config.bonusPercent || 0;
        const bonusAmount = rawUsd * (bonusPercent / 100);

        // Final amount: raw - tax + bonus
        const finalUsd = Math.round((rawUsd - taxAmount + bonusAmount) * 100000) / 100000; // 5 decimal precision

        return {
            usdAmount: Math.max(0, finalUsd),
            nprAmount,
            exchangeRate,
            rawUsd: Math.round(rawUsd * 100000) / 100000,
            taxPercent,
            taxAmount: Math.round(taxAmount * 100000) / 100000,
            bonusPercent,
            bonusAmount: Math.round(bonusAmount * 100000) / 100000,
            breakdown: `Amount: ${nprAmount} NPR | Exchange Rate: ${exchangeRate} | Raw: $${rawUsd.toFixed(5)} | Tax: ${taxPercent}% ($${taxAmount.toFixed(5)}) | Bonus: ${bonusPercent}% ($${bonusAmount.toFixed(5)}) | Final: $${Math.max(0, finalUsd).toFixed(5)}`
        };
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

        const nprAmount = parseFloat(amount);

        // Validate min/max (amount is in NPR)
        if (nprAmount < config.minAmount) {
            throw new Error(`Minimum amount is ${config.minAmount} NPR`);
        }
        if (nprAmount > config.maxAmount) {
            throw new Error(`Maximum amount is ${config.maxAmount} NPR`);
        }

        // Pre-calculate USD conversion for display
        const conversion = this.convertNprToUsd(nprAmount, config);

        console.log(`[Esewa] Creating payment in ${config.isSandbox ? 'SANDBOX' : 'PRODUCTION'} mode | ${nprAmount} NPR → $${conversion.usdAmount.toFixed(5)} USD`);

        // Generate unique transaction UUID
        const transactionUuid = `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Prepare signature message — eSewa needs the NPR amount
        const signatureMessage = `total_amount=${nprAmount},transaction_uuid=${transactionUuid},product_code=${config.merchantCode}`;
        const signature = this.generateSignature(signatureMessage, config.secretKey);

        // Store pending transaction in database
        // CRITICAL: Store the USD amount (converted), NOT the NPR amount
        const transaction = await prisma.walletTransaction.create({
            data: {
                userId,
                type: 'TOPUP',
                amount: conversion.usdAmount, // ← FIXED: Store USD, not NPR
                status: 'PENDING',
                gateway: 'ESEWA',
                gatewayRef: transactionUuid,
                description: description || 'Wallet Top-up via eSewa',
                metadata: JSON.stringify({
                    orderId,
                    signature,
                    isSandbox: config.isSandbox,
                    nprAmount,
                    exchangeRate: config.exchangeRate,
                    usdAmount: conversion.usdAmount,
                    taxPercent: conversion.taxPercent,
                    taxAmount: conversion.taxAmount,
                    bonusPercent: conversion.bonusPercent,
                    bonusAmount: conversion.bonusAmount,
                    breakdown: conversion.breakdown,
                    createdAt: new Date().toISOString()
                })
            }
        });

        // Return form data for client-side redirect
        // eSewa form uses NPR amount (checkout currency)
        const formData = {
            amount: nprAmount.toString(),
            tax_amount: '0',
            total_amount: nprAmount.toString(),
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
            isSandbox: config.isSandbox,
            conversion // Include conversion info for frontend display
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

            // Parse transaction metadata to get conversion info
            let txMetadata = {};
            try {
                txMetadata = JSON.parse(transaction.metadata || '{}');
            } catch (e) { txMetadata = {}; }

            // The USD amount is already stored in transaction.amount (fixed in createPayment)
            // For legacy transactions without conversion, re-convert now
            // Note: config already fetched at function start (line 297)
            const nprAmount = parseFloat(total_amount) || txMetadata.nprAmount || transaction.amount;
            let usdAmount = transaction.amount;

            // Safety check: if transaction.amount looks like NPR (> exchange rate),
            // it's a legacy transaction — re-convert
            if (transaction.amount >= config.exchangeRate && !txMetadata.usdAmount) {
                const conversion = this.convertNprToUsd(nprAmount, config);
                usdAmount = conversion.usdAmount;
                console.log(`[Esewa] Legacy NPR transaction detected — converting ${nprAmount} NPR → $${usdAmount.toFixed(5)} USD`);
            }

            // Build detailed memo for admin
            const memo = [
                `eSewa Token: ${transaction_code || 'N/A'}`,
                `Paid Amount via TransactionId: ${transaction_uuid}`,
                `Amount: ${nprAmount} NPR`,
                `Default Currency: USD | Exchange Rate: ${config.exchangeRate}`,
                `Amount to Add: ${usdAmount.toFixed(5)} USD`,
                `Tax Percentage: ${config.taxPercent}% | Calculated Tax: ${(usdAmount * config.taxPercent / 100).toFixed(5)} USD`,
                `Bonus: ${config.bonusPercent}% | Final Amount: ${usdAmount.toFixed(5)} USD`,
                `Payment Status: ${status}`
            ].join('\n');

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

                // Update transaction with USD amount and full memo
                await tx.walletTransaction.update({
                    where: { id: transaction.id },
                    data: {
                        status: 'COMPLETED',
                        amount: usdAmount, // Ensure USD amount is stored
                        metadata: JSON.stringify({
                            ...existingMetadata,
                            refId: transaction_code,
                            nprAmount,
                            exchangeRate: config.exchangeRate,
                            usdAmount,
                            taxPercent: config.taxPercent,
                            bonusPercent: config.bonusPercent,
                            memo,
                            verificationData: verification.data,
                            updatedAt: new Date().toISOString()
                        })
                    }
                });

                // Credit user wallet with USD amount (NOT NPR!)
                await tx.user.update({
                    where: { id: transaction.userId },
                    data: {
                        creditBalance: {
                            increment: usdAmount  // ← FIXED: credit USD, not NPR
                        }
                    }
                });

                // Create credit transaction record
                await tx.creditTransaction.create({
                    data: {
                        userId: transaction.userId,
                        type: 'CREDIT',
                        amount: usdAmount,
                        balanceBefore: transaction.user.creditBalance,
                        balanceAfter: transaction.user.creditBalance + usdAmount,
                        description: `eSewa payment: ${nprAmount} NPR → $${usdAmount.toFixed(5)} USD (rate: ${config.exchangeRate})`,
                        reference: transaction.gatewayRef
                    }
                });

                return { credited: true, usdAmount, nprAmount };
            });

            if (result.credited) {
                console.log(`[Esewa] Successfully credited $${usdAmount.toFixed(5)} USD (${nprAmount} NPR) to user ${transaction.userId}`);

                // Auto-generate invoice
                try {
                    const invoiceService = require('../invoiceService');
                    await invoiceService.createFromPayment({
                        userId: transaction.userId,
                        amount: usdAmount,
                        currency: 'USD',
                        method: 'ESEWA',
                        description: `Credit Top-Up via eSewa (${nprAmount} NPR)`,
                        metadata: { gateway: 'esewa', refId: transaction_code, nprAmount, exchangeRate: config.exchangeRate }
                    });
                } catch (invoiceError) {
                    console.error('[Esewa] Invoice generation failed:', invoiceError.message);
                }
            } else {
                console.log(`[Esewa] Transaction already completed, skipping credit for ${transaction.id}`);
            }

            return {
                success: true,
                transactionId: transaction.id,
                amount: usdAmount,
                nprAmount,
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

        // Read allowed countries from config (default: Nepal only)
        let countries = ['NP'];
        try {
            const countriesConfig = await prisma.systemConfig.findFirst({
                where: { key: 'esewa_countries' }
            });
            if (countriesConfig && countriesConfig.value && countriesConfig.value.trim()) {
                countries = countriesConfig.value.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
            }
        } catch (e) { /* use default */ }

        // Read disallowed countries from config
        let disallowedCountries = [];
        try {
            const dcConfig = await prisma.systemConfig.findFirst({
                where: { key: 'esewa_disallowed_countries' }
            });
            if (dcConfig && dcConfig.value && dcConfig.value.trim()) {
                disallowedCountries = dcConfig.value.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
            }
        } catch (e) { /* use default */ }

        return {
            id: 'esewa',
            name: 'eSewa',
            description: 'Pay with eSewa (Nepal)',
            icon: '📱',
            currency: 'NPR',
            walletCurrency: 'USD',
            exchangeRate: config.exchangeRate,
            exchangeMode: config.exchangeMode,
            minAmount: config.minAmount,
            maxAmount: config.maxAmount,
            bonusPercent: config.bonusPercent,
            taxPercent: config.taxPercent,
            isAvailable: config.enabled,
            isSandbox: config.isSandbox,
            countries,
            disallowedCountries,
            instructions: config.instructions || '',
            testCredentials: config.isSandbox ? {
                esewaIds: '9806800001 - 9806800005',
                password: 'Nepal@123',
                mpin: '1122'
            } : null
        };
    }
}

module.exports = new EsewaService();
