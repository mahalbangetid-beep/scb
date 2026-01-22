// Script to fix existing ProviderGroup data without userId
// Run this in server folder: node scripts/fix-provider-groups.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Fixing ProviderGroup records without userId...\n');

    // Use raw SQL since userId is now required in Prisma schema
    // but existing data might have NULL
    const result = await prisma.$executeRaw`
        UPDATE "ProviderGroup" 
        SET "userId" = p."userId"
        FROM "SmmPanel" p 
        WHERE "ProviderGroup"."panelId" = p."id" 
        AND "ProviderGroup"."userId" IS NULL
    `;

    console.log(`✅ Fixed ${result} ProviderGroup records`);

    // Delete orphaned records (no panel, no userId)
    const deleted = await prisma.$executeRaw`
        DELETE FROM "ProviderGroup" 
        WHERE "userId" IS NULL
    `;

    console.log(`🗑️ Deleted ${deleted} orphaned records`);

    console.log('\n✅ Done!');
}

main()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
