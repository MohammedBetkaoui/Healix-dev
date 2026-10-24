import 'dotenv/config';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { SUBSCRIPTION_PLAN_CATALOG } from '../src/subscriptions/plans/plan-catalog';

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

const demoMedications = [
  {
    id: 'demo-paracetamol-500-tablet',
    dci: 'Paracétamol',
    brandName: null,
    strength: '500 mg',
    pharmaceuticalForm: 'TABLET',
    route: 'ORAL',
    manufacturer: null,
    regulatoryCategory: 'STANDARD',
  },
  {
    id: 'demo-amoxicillin-1g-tablet',
    dci: 'Amoxicilline',
    brandName: null,
    strength: '1 g',
    pharmaceuticalForm: 'TABLET',
    route: 'ORAL',
    manufacturer: null,
    regulatoryCategory: 'STANDARD',
  },
  {
    id: 'demo-metformin-850-tablet',
    dci: 'Metformine',
    brandName: null,
    strength: '850 mg',
    pharmaceuticalForm: 'TABLET',
    route: 'ORAL',
    manufacturer: null,
    regulatoryCategory: 'STANDARD',
  },
  {
    id: 'demo-amlodipine-5-tablet',
    dci: 'Amlodipine',
    brandName: null,
    strength: '5 mg',
    pharmaceuticalForm: 'TABLET',
    route: 'ORAL',
    manufacturer: null,
    regulatoryCategory: 'STANDARD',
  },
] as const;

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
    await seedSubscriptionPlans();
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
    await seedSubscriptionPlans();
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
  await seedSubscriptionPlans();
}

async function seedSubscriptionPlans(): Promise<void> {
  for (const plan of SUBSCRIPTION_PLAN_CATALOG) {
    await prisma.subscriptionPlan.upsert({
      create: {
        accountType: plan.accountType,
        annualPrice: plan.annualPrice,
        code: plan.code,
        currency: 'DZD',
        custom: plan.custom,
        description: plan.description,
        features: [...plan.features],
        limits: [...plan.limits],
        monthlyPrice: plan.monthlyPrice,
        name: plan.name,
        quotas: { ...plan.quotas },
        recommended: plan.recommended,
      },
      update: {
        accountType: plan.accountType,
        annualPrice: plan.annualPrice,
        currency: 'DZD',
        custom: plan.custom,
        description: plan.description,
        features: [...plan.features],
        limits: [...plan.limits],
        monthlyPrice: plan.monthlyPrice,
        name: plan.name,
        quotas: { ...plan.quotas },
        recommended: plan.recommended,
        active: true,
      },
      where: {
        code: plan.code,
      },
    });
  }

  console.log('Subscription plans seed ready.');

  for (const medication of demoMedications) {
    await prisma.medicationReference.upsert({
      where: { id: medication.id },
      create: {
        ...medication,
        source: 'DEMO',
        reimbursable: 'UNKNOWN',
        requiresPriorApproval: 'UNKNOWN',
      },
      update: {
        ...medication,
        active: true,
        source: 'DEMO',
        reimbursable: 'UNKNOWN',
        requiresPriorApproval: 'UNKNOWN',
      },
    });
  }

  console.log('Demo medication references ready.');
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Admin seed failed.',
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
