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

// Get all available payment gateways
router.get('/gateways', authenticate, async (req, res, next) => {
    try {
        const gateways = await paymentGatewayService.getAvailableGateways();
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
