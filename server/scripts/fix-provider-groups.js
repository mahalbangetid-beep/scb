// Script to fix existing ProviderGroup data without userId
// Run this in server folder: node scripts/fix-provider-groups.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Fixing ProviderGroup records without userId...\n');

    // Find all ProviderGroups without userId
    const groupsWithoutUserId = await prisma.providerGroup.findMany({
        where: { userId: null },
        include: { panel: true }
    });

    console.log(`Found ${groupsWithoutUserId.length} groups without userId\n`);

    let fixed = 0;
    let deleted = 0;

    for (const group of groupsWithoutUserId) {
        if (group.panel && group.panel.userId) {
            // Fix: Get userId from panel
            await prisma.providerGroup.update({
                where: { id: group.id },
                data: { userId: group.panel.userId }
            });
            console.log(`✅ Fixed: ${group.groupName} -> userId: ${group.panel.userId}`);
            fixed++;
        } else {
            // No panel, can't determine owner - delete orphaned record
            await prisma.providerGroup.delete({
                where: { id: group.id }
            });
            console.log(`🗑️ Deleted orphaned: ${group.groupName}`);
            deleted++;
        }
    }

    console.log(`\n========================================`);
    console.log(`Fixed: ${fixed} groups`);
    console.log(`Deleted: ${deleted} orphaned groups`);
    console.log(`========================================\n`);
}

main()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
