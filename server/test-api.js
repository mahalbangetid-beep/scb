// Test script for DICREWA API
const BASE_URL = 'http://localhost:3001';

async function testAPI() {
    console.log('🚀 Testing DICREWA API\n');

    // Test 1: Health check
    console.log('1. Testing Health Check...');
    try {
        const health = await fetch(`${BASE_URL}/health`);
        const data = await health.json();
        console.log('   ✅ Health:', data);
    } catch (e) {
        console.log('   ❌ Error:', e.message);
    }

    // Test 2: Register
    console.log('\n2. Testing Registration...');
    try {
        const register = await fetch(`${BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'admin@dicrewa.com',
                password: 'admin123',
                name: 'Admin DICREWA'
            })
        });
        const data = await register.json();
        console.log('   ✅ Register:', JSON.stringify(data, null, 2));

        if (data.data?.token) {
            global.authToken = data.data.token;
            global.apiKey = data.data.apiKey;
        }
    } catch (e) {
        console.log('   ❌ Error:', e.message);
    }

    // Test 3: Login
    console.log('\n3. Testing Login...');
    try {
        const login = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'admin@dicrewa.com',
                password: 'admin123'
            })
        });
        const data = await login.json();
        console.log('   ✅ Login:', JSON.stringify(data, null, 2));

        if (data.data?.token) {
            global.authToken = data.data.token;
        }
    } catch (e) {
        console.log('   ❌ Error:', e.message);
    }

    // Test 4: Get current user
    console.log('\n4. Testing Get Current User...');
    try {
        const me = await fetch(`${BASE_URL}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${global.authToken}` }
        });
        const data = await me.json();
        console.log('   ✅ Current User:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('   ❌ Error:', e.message);
    }

    // Test 5: Get devices
    console.log('\n5. Testing Get Devices...');
    try {
        const devices = await fetch(`${BASE_URL}/api/devices`);
        const data = await devices.json();
        console.log('   ✅ Devices:', data.data?.length, 'devices found');
    } catch (e) {
        console.log('   ❌ Error:', e.message);
    }

    // Test 6: Send message
    console.log('\n6. Testing Send Message...');
    try {
        const send = await fetch(`${BASE_URL}/api/messages/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deviceId: '1',
                to: '+628123456789',
                message: 'Test message from DICREWA'
            })
        });
        const data = await send.json();
        console.log('   ✅ Message sent:', data.message);
    } catch (e) {
        console.log('   ❌ Error:', e.message);
    }

    console.log('\n✨ API Tests Complete!');
    console.log('   Auth Token:', global.authToken?.substring(0, 30) + '...');
    console.log('   API Key:', global.apiKey);
}

testAPI();
