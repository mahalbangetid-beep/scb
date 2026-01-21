/**
 * Seed script to create Master Admin user
 * Run: node seed-admin.js
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...\n');

    // Check if admin exists
    const existingAdmin = await prisma.user.findFirst({
        where: { role: 'MASTER_ADMIN' }
    });

    if (existingAdmin) {
        console.log('✅ Master Admin already exists:', existingAdmin.username);
        return;
    }

    // Create Master Admin
    const hashedPassword = await bcrypt.hash('admin123', 12);

    const admin = await prisma.user.create({
        data: {
            username: 'admin',
            email: 'admin@dicrewa.com',
            password: hashedPassword,
            name: 'Master Admin',
            role: 'MASTER_ADMIN',
            status: 'ACTIVE',
            creditBalance: 1000,
            isActive: true
        }
    });

    console.log('✅ Master Admin created:');
    console.log('   Username: admin');
    console.log('   Email: admin@dicrewa.com');
    console.log('   Password: admin123');
    console.log('   Role: MASTER_ADMIN');
    console.log('   Credit: 1000\n');

    // Create API Key for admin
    const apiKeyPrefix = process.env.API_KEY_PREFIX || 'dk_';
    const apiKey = `${apiKeyPrefix}${crypto.randomBytes(32).toString('hex')}`;

    await prisma.apiKey.create({
        data: {
            key: apiKey,
            name: 'Default Admin API Key',
            userId: admin.id
        }
    });

    console.log('🔑 API Key created:', apiKey.substring(0, 20) + '...\n');

    // Create a demo user
    const userPassword = await bcrypt.hash('user123', 12);

    const demoUser = await prisma.user.create({
        data: {
            username: 'demo',
            email: 'demo@example.com',
            password: userPassword,
            name: 'Demo User',
            role: 'USER',
            status: 'ACTIVE',
            creditBalance: 50,
            isActive: true
        }
    });

    console.log('✅ Demo User created:');
    console.log('   Username: demo');
    console.log('   Email: demo@example.com');
    console.log('   Password: user123');
    console.log('   Role: USER');
    console.log('   Credit: 50\n');

    // Create System Config defaults
    const configs = [
        { key: 'wa_message_rate', value: '0.01', category: 'pricing' },
        { key: 'tg_message_rate', value: '0.01', category: 'pricing' },
        { key: 'group_message_rate', value: '0.02', category: 'pricing' },
        { key: 'default_user_credit', value: '10', category: 'pricing' },
        { key: 'wa_login_fee', value: '5', category: 'pricing' },
        { key: 'tg_login_fee', value: '5', category: 'pricing' },
        { key: 'first_wa_login_free', value: 'true', category: 'pricing' },
        { key: 'first_tg_login_free', value: 'true', category: 'pricing' },
        { key: 'app_name', value: '"DICREWA"', category: 'general' },
        { key: 'maintenance_mode', value: 'false', category: 'general' }
    ];

    for (const config of configs) {
        await prisma.systemConfig.upsert({
            where: { key: config.key },
            update: { value: config.value },
            create: config
        });
    }

    console.log('⚙️  System configs created\n');
    console.log('🎉 Seeding complete!\n');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
