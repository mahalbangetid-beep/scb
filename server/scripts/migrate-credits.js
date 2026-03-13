/**
 * Migration Script: Copy messageCredits → supportCredits
 * 
 * This script migrates existing credit data from the single 
 * messageCredits field to the new supportCredits field.
 * 
 * Run: node scripts/migrate-credits.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('[Migration] Starting credit separation migration...');

    // 1. Copy messageCredits → supportCredits for all users
    const result = await prisma.$executeRaw`
        UPDATE "User"
        SET 
            "supportCredits" = "messageCredits",
            "freeSupportGiven" = "freeCreditsGiven"
        WHERE "messageCredits" > 0 OR "freeCreditsGiven" = true
    `;

    console.log(`[Migration] Updated ${result} users: messageCredits → supportCredits`);

    // 2. Add creditCategory to existing MessageCreditTransaction records
    const txResult = await prisma.$executeRaw`
        UPDATE "MessageCreditTransaction"
        SET "creditCategory" = 'support'
        WHERE "creditCategory" IS NULL
    `;

    console.log(`[Migration] Updated ${txResult} transactions with creditCategory = 'support'`);

    // 3. Verify
    const users = await prisma.user.findMany({
        where: { messageCredits: { gt: 0 } },
        select: { id: true, username: true, messageCredits: true, supportCredits: true }
    });

    console.log(`\n[Migration] Verification (users with credits):`);
    for (const u of users) {
        const match = u.messageCredits === u.supportCredits ? '✅' : '❌';
        console.log(`  ${match} ${u.username}: messageCredits=${u.messageCredits}, supportCredits=${u.supportCredits}`);
    }

    console.log('\n[Migration] Credit separation migration completed successfully!');
}

main()
    .catch(e => {
        console.error('[Migration] Error:', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
