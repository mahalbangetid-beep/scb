const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({
        select: { email: true, name: true }
    });
    console.log('Users in database:', users);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
