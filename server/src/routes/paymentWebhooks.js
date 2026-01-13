/**
 * Payment Webhook Routes
 * Handles IPN/callbacks from payment gateways
 * These are public endpoints (no auth) for gateway notifications
 */

const express = require('express');
const router = express.Router();
const paymentGatewayService = require('../services/paymentGateway');

// Cryptomus IPN webhook
router.post('/cryptomus', async (req, res) => {
    try {
        console.log('[PaymentWebhook] Cryptomus received:', req.body);

        const cryptomusService = paymentGatewayService.getGateway('cryptomus');
        const result = await cryptomusService.processWebhook(req.body);

        if (result.success) {
            res.json({ success: true });
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('[PaymentWebhook] Cryptomus error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Binance Pay webhook (placeholder)
router.post('/binance', async (req, res) => {
    try {
        console.log('[PaymentWebhook] Binance Pay received:', req.body);

        const binanceService = paymentGatewayService.getGateway('binance_pay');
        const result = await binanceService.processWebhook(req.body);

        res.json(result);
    } catch (error) {
        console.error('[PaymentWebhook] Binance error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Esewa IPN webhook
router.post('/esewa', async (req, res) => {
    try {
        console.log('[PaymentWebhook] Esewa received:', req.body);

        const esewaService = paymentGatewayService.getGateway('esewa');
        const result = await esewaService.processCallback(req.body);

        res.json(result);
    } catch (error) {
        console.error('[PaymentWebhook] Esewa error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Generic webhook test endpoint
router.post('/test', (req, res) => {
    console.log('[PaymentWebhook] Test received:', {
        headers: req.headers,
        body: req.body
    });

    res.json({
        success: true,
        message: 'Payment webhook test received',
        receivedAt: new Date().toISOString()
    });
});

module.exports = router;
