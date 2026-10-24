import {
  CLASSIFICATION_PIPELINES,
  type PlanQuotas,
  UNLIMITED_QUOTAS,
} from './plan-quotas';

// The subscription plans the seed registers. `limits` are the texts shown to
// the customer; `quotas` are the numbers the platform enforces, and a test
// checks that the two say the same thing (and that the SQL migration which
// filled the quotas of the existing rows used these values).
export type PlanCatalogEntry = {
  accountType: 'ESTABLISHMENT' | 'INDEPENDENT_DOCTOR';
  annualPrice: number | null;
  code: string;
  custom: boolean;
  description: string;
  features: string[];
  limits: string[];
  monthlyPrice: number | null;
  name: string;
  quotas: PlanQuotas;
  recommended: boolean;
};

export const SUBSCRIPTION_PLAN_CATALOG: readonly PlanCatalogEntry[] = [
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
    quotas: {
      aiAnalysesPerMonth: 20,
      aiPipelines: [...CLASSIFICATION_PIPELINES],
      maxDoctors: 1,
      maxPatients: 100,
    },
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
    quotas: {
      aiAnalysesPerMonth: 100,
      aiPipelines: [...CLASSIFICATION_PIPELINES],
      maxDoctors: 1,
      maxPatients: null,
    },
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
    quotas: {
      aiAnalysesPerMonth: 300,
      aiPipelines: null,
      maxDoctors: 1,
      maxPatients: null,
    },
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
    quotas: {
      aiAnalysesPerMonth: 100,
      aiPipelines: null,
      maxDoctors: 5,
      maxPatients: 500,
    },
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
    quotas: {
      aiAnalysesPerMonth: 500,
      aiPipelines: null,
      maxDoctors: 20,
      maxPatients: null,
    },
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
    quotas: {
      aiAnalysesPerMonth: 2000,
      aiPipelines: null,
      maxDoctors: 100,
      maxPatients: null,
    },
    recommended: false,
  },
  {
    accountType: 'ESTABLISHMENT',
    annualPrice: null,
    code: 'EST_CUSTOM',
    custom: true,
    description: 'Pour hopital, reseau multi-sites ou integration specifique.',
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
    // Sur devis: the contract fixes the numbers, an administrator enters them
    // as the custom quotas of the subscription.
    quotas: { ...UNLIMITED_QUOTAS },
    recommended: false,
  },
];
