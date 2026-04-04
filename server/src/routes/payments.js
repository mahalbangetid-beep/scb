/**
 * Payment Gateway Routes
 * API endpoints for payment processing
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sensitiveLimiter } = require('../middleware/rateLimiter');
const paymentGatewayService = require('../services/paymentGateway');

// Apply rate limiting to all payment routes
router.use(sensitiveLimiter);

// Get available payment gateways (optionally filtered by country)
router.get('/gateways', authenticate, async (req, res, next) => {
    try {
        let gateways = await paymentGatewayService.getAvailableGateways();

        // Country-based filtering
        // Priority: 1) explicit query param, 2) user's profile countryCode
        let countryCode = null;
        const { country } = req.query;
        if (country && country.trim()) {
            countryCode = country.trim().toUpperCase();
        }
        // Note: countryCode is not stored on User model, so auto-detect is only via query param

        if (countryCode) {
            gateways = gateways.filter(g => {
                // Disallowed countries check (higher priority)
                if (g.disallowedCountries && g.disallowedCountries.length > 0) {
                    if (g.disallowedCountries.includes(countryCode)) return false;
                }
                // Allowed countries check
                if (!g.countries || g.countries.length === 0) return true; // no restriction
                return g.countries.includes('*') || g.countries.includes(countryCode);
            });
        }

        res.json({
            success: true,
            gateways
        });
    } catch (error) {
        console.error('[Payments] Get gateways error:', error);
        next(error);
    }
});

// Create payment via specified gateway
router.post('/create/:gatewayId', authenticate, async (req, res, next) => {
    try {
        const { gatewayId } = req.params;
        const { amount, currency, description, ...additionalParams } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: { message: 'Valid amount is required' }
            });
        }

        const result = await paymentGatewayService.createPayment(gatewayId, {
            userId: req.user.id,
            amount,
            currency,
            description,
            ...additionalParams
        });

        res.json(result);
    } catch (error) {
        console.error('[Payments] Create payment error:', error);
        next(error);
    }
});

// Get gateway info
router.get('/gateway/:gatewayId', authenticate, async (req, res, next) => {
    try {
        const { gatewayId } = req.params;
        const info = await paymentGatewayService.getGatewayInfo(gatewayId);

        if (!info) {
            return res.status(404).json({
                success: false,
                error: { message: 'Gateway not found' }
            });
        }

        res.json({ success: true, gateway: info });
    } catch (error) {
        console.error('[Payments] Get gateway info error:', error);
        next(error);
    }
});

// ============ CRYPTOMUS SPECIFIC ROUTES ============

// Create Cryptomus payment
router.post('/cryptomus/create', authenticate, async (req, res, next) => {
    try {
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: { message: 'Valid amount is required' }
            });
        }

        const cryptomusService = paymentGatewayService.getGateway('cryptomus');

        // Check if Cryptomus is enabled
        const config = await cryptomusService.getConfig();
        if (!config.enabled) {
            return res.status(400).json({
                success: false,
                error: { message: 'Cryptomus payment is not enabled' }
            });
        }

        if (!config.isConfigured) {
            return res.status(400).json({
                success: false,
                error: { message: 'Cryptomus is not configured. Please add API credentials in Payment Settings.' }
            });
        }

        const result = await cryptomusService.createPayment({
            userId: req.user.id,
            amount,
            description: 'Wallet Top-up'
        });

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('[Cryptomus] Create payment error:', error);
        next(error);
    }
});

// Verify Cryptomus payment status (fallback when webhook doesn't arrive)
// Frontend can poll this to check if a pending payment has been completed
router.post('/cryptomus/verify', authenticate, async (req, res, next) => {
    try {
        const { transactionId } = req.body;

        const prisma = require('../utils/prisma');

        // Find the pending transaction - by ID if provided, or most recent
        const whereClause = {
            userId: req.user.id,
            gateway: 'CRYPTOMUS',
            status: 'PENDING'
        };
        if (transactionId) {
            whereClause.id = transactionId;
        }

        const transaction = await prisma.walletTransaction.findFirst({
            where: whereClause,
            orderBy: { createdAt: 'desc' }
        });

        if (!transaction) {
            return res.json({
                success: true,
                data: { status: 'NOT_FOUND', message: 'No pending Cryptomus transaction found' }
            });
        }

        const cryptomusService = paymentGatewayService.getGateway('cryptomus');

        // Check status from Cryptomus API
        const statusResult = await cryptomusService.checkPaymentStatus(transaction.gatewayRef);
        console.log(`[Cryptomus Verify] UUID=${transaction.gatewayRef} API status:`, statusResult.data?.payment_status || statusResult.data?.status);

        if (!statusResult.success) {
            return res.json({
                success: true,
                data: { status: 'CHECK_FAILED', message: statusResult.error }
            });
        }

        const cryptomusStatus = statusResult.data?.payment_status || statusResult.data?.status;

        // If Cryptomus says paid, simulate the webhook processing
        if (['paid', 'paid_over'].includes(cryptomusStatus)) {
            console.log(`[Cryptomus Verify] Payment ${transaction.gatewayRef} is PAID — applying credit via processWebhook`);

            // Build webhook-like data and process it
            const webhookData = {
                uuid: transaction.gatewayRef,
                order_id: statusResult.data?.order_id,
                status: cryptomusStatus,
                amount: statusResult.data?.amount || transaction.amount.toString(),
                currency: statusResult.data?.currency || 'USD'
            };

            // Generate valid signature for our own verification
            const config = await cryptomusService.getConfig();
            webhookData.sign = cryptomusService.generateSignature(webhookData, config.apiKey);

            const processResult = await cryptomusService.processWebhook(webhookData);

            return res.json({
                success: true,
                data: {
                    status: 'COMPLETED',
                    credited: processResult.credited,
                    message: processResult.credited
                        ? 'Payment verified and credit applied!'
                        : 'Payment already processed'
                }
            });
        }

        // Return current status
        return res.json({
            success: true,
            data: {
                status: cryptomusStatus === 'cancel' ? 'CANCELLED' : 'PENDING',
                cryptomusStatus,
                message: `Payment status: ${cryptomusStatus}`
            }
        });
    } catch (error) {
        console.error('[Cryptomus Verify] Error:', error.message);
        next(error);
    }
});

// ============ ESEWA SPECIFIC ROUTES ============

// Create eSewa payment
router.post('/esewa/create', authenticate, async (req, res, next) => {
    try {
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: { message: 'Valid amount is required' }
            });
        }

        const esewaService = paymentGatewayService.getGateway('esewa');

        // Check if eSewa is enabled
        const config = await esewaService.getConfig();
        if (!config.enabled) {
            return res.status(400).json({
                success: false,
                error: { message: 'eSewa payment is not enabled' }
            });
        }

        const result = await esewaService.createPayment({
            userId: req.user.id,
            amount,
            description: 'Wallet Top-up'
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('[Esewa] Create payment error:', error);
        next(error);
    }
});

// Esewa payment return (user redirected back)
router.get('/esewa/return', async (req, res) => {
    try {
        const { data } = req.query;

        if (!data) {
            return res.redirect(`${process.env.FRONTEND_URL}/wallet?payment=failed&error=no_data`);
        }

        const esewaService = paymentGatewayService.getGateway('esewa');
        const result = await esewaService.processCallback({ data });

        if (result.success) {
            res.redirect(`${process.env.FRONTEND_URL}/wallet?payment=success&amount=${result.amount}`);
        } else {
            res.redirect(`${process.env.FRONTEND_URL}/wallet?payment=failed&error=${result.error}`);
        }
    } catch (error) {
        console.error('[Esewa] Return processing error:', error);
        res.redirect(`${process.env.FRONTEND_URL}/wallet?payment=failed&error=processing_error`);
    }
});

// ============ MANUAL PAYMENT ROUTES ============

// Get manual payment methods
router.get('/manual/methods', authenticate, (req, res, next) => {
    try {
        const manualService = paymentGatewayService.getGateway('manual');
        const methods = manualService.getPaymentMethods();
        res.json({ success: true, methods });
    } catch (error) {
        console.error('[Manual] Get methods error:', error);
        next(error);
    }
});

// Submit manual payment request
router.post('/manual/submit', authenticate, async (req, res, next) => {
    try {
        const { amount, paymentMethod, proofUrl, notes } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: { message: 'Valid amount is required' }
            });
        }

        if (!paymentMethod) {
            return res.status(400).json({
                success: false,
                error: { message: 'Payment method is required' }
            });
        }

        const manualService = paymentGatewayService.getGateway('manual');
        const result = await manualService.createPaymentRequest({
            userId: req.user.id,
            amount,
            paymentMethod,
            proofUrl,
            notes
        });

        res.json(result);
    } catch (error) {
        console.error('[Manual] Submit payment error:', error);
        next(error);
    }
});

// Get pending payments (Admin only)
router.get('/manual/pending', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const manualService = paymentGatewayService.getGateway('manual');
        const payments = await manualService.getPendingPayments();
        res.json({ success: true, payments });
    } catch (error) {
        console.error('[Manual] Get pending error:', error);
        next(error);
    }
});

// Approve manual payment (Admin only)
router.post('/manual/approve/:transactionId', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const { transactionId } = req.params;
        const { notes } = req.body;

        const manualService = paymentGatewayService.getGateway('manual');
        const result = await manualService.approvePayment(transactionId, req.user.id, notes);

        res.json(result);
    } catch (error) {
        console.error('[Manual] Approve error:', error);
        next(error);
    }
});

// Reject manual payment (Admin only)
router.post('/manual/reject/:transactionId', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const { transactionId } = req.params;
        const { reason } = req.body;

        if (!reason) {
            return res.status(400).json({
                success: false,
                error: { message: 'Rejection reason is required' }
            });
        }

        const manualService = paymentGatewayService.getGateway('manual');
        const result = await manualService.rejectPayment(transactionId, req.user.id, reason);

        res.json(result);
    } catch (error) {
        console.error('[Manual] Reject error:', error);
        next(error);
    }
});

module.exports = router;
