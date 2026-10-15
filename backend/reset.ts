import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('demo1234', 10);
  const result = await prisma.user.updateMany({
    where: { email: { in: ['doctor@healthlens.demo', 'patient@healthlens.demo'] } },
    data: { password: hash },
  });
  console.log(`Updated ${result.count} user(s)`);
}

main().finally(() => prisma.$disconnect());