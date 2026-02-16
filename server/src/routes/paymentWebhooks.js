/**
 * Payment Webhook Routes
 * Handles IPN/callbacks from payment gateways
 * These are public endpoints (no auth) for gateway notifications
 * 
 * SECURITY: Each gateway handler MUST verify the webhook signature
 * before processing any payment data. Without verification, an attacker
 * can forge fake payment completions and get free credits.
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
// NOTE: BinancePayService is a P2P manual verification service (user submits
// Transaction ID, system verifies via Binance Exchange API). It does NOT use
// Binance Pay Merchant API webhooks. This endpoint is disabled to prevent:
// 1. Server crash (processWebhook method does not exist on BinancePayService)
// 2. Fake payment forgery by attackers POSTing arbitrary data
router.post('/binance', (req, res) => {
    console.warn('[PaymentWebhook] Binance endpoint hit but disabled - Binance uses manual P2P verification, not webhooks');
    res.status(404).json({
        success: false,
        error: 'Binance payment uses manual verification, not webhooks'
    });
});

// eSewa IPN webhook
// Signature verification is handled inside esewaService.processCallback()
// using HMAC-SHA256. This route adds upfront data validation.
router.post('/esewa', async (req, res) => {
    try {
        const { data } = req.body;

        // Validate that we received base64-encoded data
        if (!data || typeof data !== 'string') {
            console.warn('[PaymentWebhook] eSewa received invalid payload - missing data field');
            return res.status(400).json({ success: false, error: 'Missing data field' });
        }

        // Validate base64 format and decode to check structure
        let decodedData;
        try {
            decodedData = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
        } catch (parseError) {
            console.warn('[PaymentWebhook] eSewa received malformed base64 data');
            return res.status(400).json({ success: false, error: 'Malformed data' });
        }

        // Validate required fields exist before passing to service
        const requiredFields = ['transaction_uuid', 'status', 'total_amount', 'signed_field_names', 'signature'];
        const missingFields = requiredFields.filter(f => !decodedData[f]);
        if (missingFields.length > 0) {
            console.warn('[PaymentWebhook] eSewa missing required fields:', missingFields);
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        console.log('[PaymentWebhook] eSewa received - uuid:', decodedData.transaction_uuid, 'status:', decodedData.status);

        // processCallback handles HMAC-SHA256 signature verification internally
        const esewaService = paymentGatewayService.getGateway('esewa');
        const result = await esewaService.processCallback({ data });

        res.json(result);
    } catch (error) {
        console.error('[PaymentWebhook] eSewa error:', error.message);
        res.status(500).json({ success: false, error: 'Internal error' });
    }
});

module.exports = router;

