/**
 * Script untuk membuat akun Admin
 * Jalankan: node scripts/create-admin.js
 */

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createAdmin() {
    // Konfigurasi akun admin
    const adminData = {
        username: 'admin',
        email: 'admin@wabar.local',
        password: 'Admin123!',  // Ganti dengan password yang lebih kuat
        name: 'Administrator',
        role: 'MASTER_ADMIN',  // MASTER_ADMIN memiliki akses penuh
        status: 'ACTIVE'
    };

    try {
        // Cek apakah user sudah ada
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { username: adminData.username },
                    { email: adminData.email }
                ]
            }
        });

        if (existingUser) {
            console.log('⚠️  Admin user sudah ada!');
            console.log(`   Username: ${existingUser.username}`);
            console.log(`   Email: ${existingUser.email}`);
            console.log(`   Role: ${existingUser.role}`);
            return existingUser;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(adminData.password, 10);

        // Create user
        const admin = await prisma.user.create({
            data: {
                username: adminData.username,
                email: adminData.email,
                password: hashedPassword,
                name: adminData.name,
                role: adminData.role,
                status: adminData.status,
                isActive: true
            }
        });

        console.log('✅ Admin user berhasil dibuat!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`   Username : ${admin.username}`);
        console.log(`   Email    : ${admin.email}`);
        console.log(`   Password : ${adminData.password}`);
        console.log(`   Role     : ${admin.role}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('⚠️  Simpan kredensial ini dengan aman!');
        console.log('⚠️  Ganti password setelah login pertama kali.');

        return admin;
    } catch (error) {
        console.error('❌ Error membuat admin:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run
createAdmin()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
