import 'dotenv/config';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required for admin seed.`);
  }

  return value.trim();
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(getRequiredEnv('DATABASE_URL')),
});

function getSaltRounds(): number {
  const parsedValue = Number(process.env.BCRYPT_SALT_ROUNDS);

  if (Number.isInteger(parsedValue) && parsedValue >= 10) {
    return parsedValue;
  }

  return 12;
}

async function main(): Promise<void> {
  const email = getRequiredEnv('ADMIN_SEED_EMAIL').toLowerCase();
  const password = getRequiredEnv('ADMIN_SEED_PASSWORD');
  const fullName = getRequiredEnv('ADMIN_SEED_FULL_NAME');
  const phone = process.env.ADMIN_SEED_PHONE?.trim() || 'admin-healixdz';
  const shouldUpdatePassword =
    process.env.ADMIN_SEED_UPDATE_PASSWORD === 'true';

  const existingAdmin = await prisma.user.findUnique({
    where: { email },
  });

  if (existingAdmin && !shouldUpdatePassword) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        accountStatus: 'ACTIVE',
        fullName,
        isEmailVerified: true,
        isPhoneVerified: true,
        role: 'SUPER_ADMIN',
      },
    });
    console.log('Admin seed ready.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, getSaltRounds());

  if (existingAdmin) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        accountStatus: 'ACTIVE',
        fullName,
        isEmailVerified: true,
        isPhoneVerified: true,
        passwordHash,
        role: 'SUPER_ADMIN',
      },
    });
    console.log('Admin seed ready.');
    return;
  }

  await prisma.user.create({
    data: {
      accountStatus: 'ACTIVE',
      email,
      fullName,
      isEmailVerified: true,
      isPhoneVerified: true,
      passwordHash,
      phone,
      role: 'SUPER_ADMIN',
    },
  });

  console.log('Admin seed ready.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Admin seed failed.');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
