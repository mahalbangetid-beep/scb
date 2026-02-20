/**
 * Diagnostic: Test what the V1 panel API actually returns
 * Run on VPS: node test-panel-api.js
 */
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { decrypt } = require('./src/utils/encryption');

const p = new PrismaClient();

(async () => {
    // Get all panels
    const panels = await p.smmPanel.findMany();

    if (panels.length === 0) {
        console.log('No panels found in database');
        await p.$disconnect();
        return;
    }

    for (const panel of panels) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Panel: ${panel.name} (${panel.alias})`);
        console.log(`URL: ${panel.url}`);
        console.log(`Type: ${panel.panelType}`);
        console.log(`Admin API Base: ${panel.adminApiBaseUrl}`);
        console.log(`${'='.repeat(60)}`);

        let apiKey;
        try {
            apiKey = decrypt(panel.adminApiKey);
        } catch (e) {
            console.log('ERROR: Cannot decrypt admin API key:', e.message);
            continue;
        }

        const baseUrl = (panel.adminApiBaseUrl || panel.url + '/adminapi/v1').replace(/\/+$/, '');
        const isV1 = panel.panelType === 'RENTAL' || panel.panelType === 'V1' || baseUrl.includes('/v1');

        if (isV1) {
            // Test various V1 actions
            const tests = [
                { name: 'getOrders (limit=5)', params: { key: apiKey, action: 'getOrders', limit: 5 } },
                { name: 'getOrders+provider (limit=5)', params: { key: apiKey, action: 'getOrders', provider: 1, limit: 5 } },
                { name: 'getMassProviderData (orders=1)', params: { key: apiKey, action: 'getMassProviderData', orders: '1' } },
                { name: 'getUser', params: { key: apiKey, action: 'getUser', username: 'admin' } },
            ];

            for (const test of tests) {
                try {
                    console.log(`\n--- Test: ${test.name} ---`);
                    const res = await axios.get(baseUrl, { params: test.params, timeout: 15000 });
                    console.log('Status:', res.status);
                    console.log('Response:', JSON.stringify(res.data, null, 2).substring(0, 500));
                } catch (e) {
                    console.log('Error:', e.message);
                    if (e.response) {
                        console.log('Response Status:', e.response.status);
                        console.log('Response Data:', JSON.stringify(e.response.data, null, 2).substring(0, 300));
                    }
                }
            }
        } else {
            // V2 tests
            const tests = [
                { name: '/orders (limit=5)', url: `${baseUrl}/orders`, params: { limit: 5 } },
                { name: '/orders/1 (single)', url: `${baseUrl}/orders/1`, params: {} },
            ];

            for (const test of tests) {
                try {
                    console.log(`\n--- Test: ${test.name} ---`);
                    const res = await axios.get(test.url, {
                        params: test.params,
                        headers: { 'X-Api-Key': apiKey },
                        timeout: 15000
                    });
                    console.log('Status:', res.status);
                    console.log('Response:', JSON.stringify(res.data, null, 2).substring(0, 500));
                } catch (e) {
                    console.log('Error:', e.message);
                    if (e.response) {
                        console.log('Response Status:', e.response.status);
                        console.log('Response Data:', JSON.stringify(e.response.data, null, 2).substring(0, 300));
                    }
                }
            }
        }
    }

    await p.$disconnect();
    console.log('\n\nDone!');
})().catch(e => { console.error(e); process.exit(1); });
