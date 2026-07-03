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

const subscriptionPlans = [
  {
    accountType: 'INDEPENDENT_DOCTOR',
    annualPrice: 29000,
    code: 'DOCTOR_STARTER',
    custom: false,
    description:
      'Pour medecin independant ou petit cabinet avec besoins simples.',
    features: [
      'Tableau de bord medecin',
      'Gestion des patients',
      'Historique des consultations',
      'Rapports simples',
      'Analyses IA limitees',
      'Support standard',
    ],
    limits: [
      '100 patients',
      '20 analyses IA / mois',
      '1 utilisateur',
      'Rapports PDF simples',
    ],
    monthlyPrice: 2900,
    name: 'Starter',
    recommended: false,
  },
  {
    accountType: 'INDEPENDENT_DOCTOR',
    annualPrice: 59000,
    code: 'DOCTOR_PRO',
    custom: false,
    description: 'Pour medecin actif avec un volume moyen de patients.',
    features: [
      'Toutes les fonctionnalites Starter',
      'Patients illimites',
      'Analyses IA avancees',
      'Rapports detailles',
      'Historique longitudinal',
      'Support prioritaire',
    ],
    limits: [
      'Patients illimites',
      '100 analyses IA / mois',
      '1 utilisateur',
      'Rapports detailles',
    ],
    monthlyPrice: 5900,
    name: 'Pro',
    recommended: true,
  },
  {
    accountType: 'INDEPENDENT_DOCTOR',
    annualPrice: 99000,
    code: 'DOCTOR_PREMIUM_AI',
    custom: false,
    description:
      "Pour medecin utilisant regulierement les modules d'intelligence artificielle.",
    features: [
      'Toutes les fonctionnalites Pro',
      'Analyses IA premium',
      'Segmentation medicale',
      'Comparaison longitudinale',
      'Priorite de traitement IA',
      'Support premium',
    ],
    limits: [
      'Patients illimites',
      '300 analyses IA / mois',
      'Modules IA avances',
      'Support premium',
    ],
    monthlyPrice: 9900,
    name: 'Premium AI',
    recommended: false,
  },
  {
    accountType: 'ESTABLISHMENT',
    annualPrice: 149000,
    code: 'EST_BASIC_CLINIC',
    custom: false,
    description:
      'Pour petite clinique, cabinet de groupe ou centre medical debutant.',
    features: [
      'Dashboard etablissement',
      'Gestion des patients',
      'Gestion des medecins affilies',
      'Rapports medicaux',
      'Analyses IA limitees',
      'Support standard',
    ],
    limits: [
      '5 medecins',
      '500 patients',
      '100 analyses IA / mois',
      '1 etablissement',
    ],
    monthlyPrice: 14900,
    name: 'Basic Clinic',
    recommended: false,
  },
  {
    accountType: 'ESTABLISHMENT',
    annualPrice: 299000,
    code: 'EST_PRO_CENTER',
    custom: false,
    description:
      "Pour centre medical, laboratoire ou centre d'imagerie avec activite reguliere.",
    features: [
      'Toutes les fonctionnalites Basic Clinic',
      'Medecins affilies etendus',
      'Patients illimites',
      'Analyses IA avancees',
      'Rapports detailles',
      'Support prioritaire',
    ],
    limits: [
      '20 medecins',
      'Patients illimites',
      '500 analyses IA / mois',
      '3 services medicaux',
    ],
    monthlyPrice: 29900,
    name: 'Pro Center',
    recommended: true,
  },
  {
    accountType: 'ESTABLISHMENT',
    annualPrice: 599000,
    code: 'EST_ENTERPRISE',
    custom: false,
    description:
      'Pour grand etablissement avec plusieurs medecins, services ou volumes eleves.',
    features: [
      'Toutes les fonctionnalites Pro Center',
      'IA premium',
      'Gestion avancee des roles',
      'Audit logs avances',
      'Support premium',
      'Preparation HL7/FHIR',
    ],
    limits: [
      '100 medecins',
      'Patients illimites',
      '2 000 analyses IA / mois',
      'Multi-services',
    ],
    monthlyPrice: 59900,
    name: 'Enterprise',
    recommended: false,
  },
  {
    accountType: 'ESTABLISHMENT',
    annualPrice: null,
    code: 'EST_CUSTOM',
    custom: true,
    description:
      'Pour hopital, reseau multi-sites ou integration specifique.',
    features: [
      'Offre personnalisee',
      'Multi-sites',
      'Integration HL7/FHIR',
      'Support dedie',
      'SLA personnalise',
      'Accompagnement technique',
    ],
    limits: ['Sur devis'],
    monthlyPrice: null,
    name: 'Custom',
    recommended: false,
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
  for (const plan of subscriptionPlans) {
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
        recommended: plan.recommended,
        active: true,
      },
      where: {
        code: plan.code,
      },
    });
  }

  console.log('Subscription plans seed ready.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Admin seed failed.');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
