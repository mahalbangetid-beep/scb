/**
 * Payment Webhook Routes
 * Handles IPN/callbacks from payment gateways
 * These are public endpoints (no auth) for gateway notifications
 */

const express = require('express');
const router = express.Router();
const paymentGatewayService = require('../services/paymentGateway');

// Cryptomus IPN webhook
// Signature verification is handled inside cryptomusService.processWebhook()
router.post('/cryptomus', async (req, res) => {
    try {
        console.log('[PaymentWebhook] Cryptomus received - status:', req.body?.status, 'uuid:', req.body?.uuid);

        const cryptomusService = paymentGatewayService.getGateway('cryptomus');
        const result = await cryptomusService.processWebhook(req.body);

        if (result.success) {
            res.json({ success: true });
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('[PaymentWebhook] Cryptomus error:', error.message);
        res.status(500).json({ success: false, error: 'Internal error' });
    }
});

// Binance Pay webhook
// TODO: Add signature verification using Binance Pay webhook signing key
router.post('/binance', async (req, res) => {
    try {
        console.log('[PaymentWebhook] Binance Pay received - bizType:', req.body?.bizType);

        const binanceService = paymentGatewayService.getGateway('binance_pay');
        const result = await binanceService.processWebhook(req.body);

        res.json(result);
    } catch (error) {
        console.error('[PaymentWebhook] Binance error:', error.message);
        res.status(500).json({ success: false, error: 'Internal error' });
    }
});

// Esewa IPN webhook
// TODO: Add signature verification using Esewa secret key
router.post('/esewa', async (req, res) => {
    try {
        console.log('[PaymentWebhook] Esewa received - product_code:', req.body?.product_code);

        const esewaService = paymentGatewayService.getGateway('esewa');
        const result = await esewaService.processCallback(req.body);

        res.json(result);
    } catch (error) {
        console.error('[PaymentWebhook] Esewa error:', error.message);
        res.status(500).json({ success: false, error: 'Internal error' });
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
