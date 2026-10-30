import { createHash } from 'node:crypto';

// The data and the pure rules of the demo cabinet seed (seed-demo-cabinet.ts):
// no database here, so that they are tested (demo-cabinet-data.spec.ts) without
// one. Everything is synthetic. The names are common Algerian names, the
// numbers are visibly fake.

// The seed writes patients, a doctor with a password and clinical records: it
// never runs against a production database by accident.
export function assertSeedAllowed(env: Record<string, string | undefined>) {
  if (env.NODE_ENV === 'production' && env.ALLOW_DEMO_SEED !== '1') {
    throw new Error(
      'Refus : la base est en production (NODE_ENV=production). Le jeu de démonstration crée un médecin, des patients fictifs et un mot de passe connu. À ne lancer que sur une base de démonstration ; ALLOW_DEMO_SEED=1 le force.',
    );
  }
}

export const DEMO_DOCTOR = {
  email: 'dr.demonstration@healix.test',
  fullName: 'Dr Démonstration',
  phone: '0550000001',
  defaultPassword: 'Demo-Healix-2026!',
  speciality: 'Médecine générale',
  wilaya: 'Bordj Bou Arréridj',
  professionalAddress: '12 rue des Frères Bouadou, Bordj Bou Arréridj',
  orderRegistrationNumber: '34/0001 (démo)',
  regionalCouncil: 'Conseil régional de Sétif',
  registrationWilaya: 'Bordj Bou Arréridj',
  cabinetName: 'Cabinet du Dr Démonstration',
  cabinetPhone: '035 00 00 01',
} as const;

type MedicalSummary = {
  allergies: string[];
  chronicDiseases: string[];
  currentMedications: string[];
  history: string[];
  notes: string;
};

export type DemoPatient = {
  id: string;
  firstName: string;
  lastName: string;
  firstNameAr: string;
  lastNameAr: string;
  gender: 'MALE' | 'FEMALE';
  birthDate: string;
  bloodGroup:
    | 'A_POS'
    | 'A_NEG'
    | 'B_POS'
    | 'B_NEG'
    | 'AB_POS'
    | 'AB_NEG'
    | 'O_POS'
    | 'O_NEG';
  commune: string;
  insurance: 'CNAS' | 'CASNOS' | 'UNINSURED' | 'PRIVATE';
  status: 'ACTIVE' | 'FOLLOW_UP' | 'NEW' | 'URGENT';
  medicalSummary: MedicalSummary;
};

const summary = (partial: Partial<MedicalSummary>): MedicalSummary => ({
  allergies: [],
  chronicDiseases: [],
  currentMedications: [],
  history: [],
  notes: '',
  ...partial,
});

// Eight patients. The first has the allergy of the scenario: "Amoxicilline" is
// an exact DCI match, so prescribing it raises the allergy alert.
export const DEMO_PATIENTS: DemoPatient[] = [
  {
    id: 'demo-patient-1',
    firstName: 'Amine',
    lastName: 'Benali',
    firstNameAr: 'أمين',
    lastNameAr: 'بن علي',
    gender: 'MALE',
    birthDate: '1988-04-12',
    bloodGroup: 'A_POS',
    commune: 'Bordj Bou Arréridj',
    insurance: 'CNAS',
    status: 'FOLLOW_UP',
    medicalSummary: summary({
      allergies: ['Pénicilline', 'Amoxicilline', 'Arachides'],
      chronicDiseases: ['Hypertension artérielle'],
      currentMedications: ['Amlodipine 5 mg'],
      history: ['Appendicectomie (2012)'],
    }),
  },
  {
    id: 'demo-patient-2',
    firstName: 'Samira',
    lastName: 'Khelifi',
    firstNameAr: 'سميرة',
    lastNameAr: 'خليفي',
    gender: 'FEMALE',
    birthDate: '1975-11-02',
    bloodGroup: 'O_NEG',
    commune: 'Ras El Oued',
    insurance: 'CNAS',
    status: 'FOLLOW_UP',
    medicalSummary: summary({
      allergies: ['Aspirine'],
      chronicDiseases: ['Diabète de type 2'],
      currentMedications: ['Metformine 850 mg'],
      history: ['Césarienne (2003)'],
    }),
  },
  {
    id: 'demo-patient-3',
    firstName: 'Yacine',
    lastName: 'Mebarki',
    firstNameAr: 'ياسين',
    lastNameAr: 'مباركي',
    gender: 'MALE',
    birthDate: '2001-07-23',
    bloodGroup: 'B_POS',
    commune: 'Mansoura',
    insurance: 'UNINSURED',
    status: 'ACTIVE',
    medicalSummary: summary({ history: ['Asthme de l’enfant, guéri'] }),
  },
  {
    id: 'demo-patient-4',
    firstName: 'Nadia',
    lastName: 'Boudiaf',
    firstNameAr: 'نادية',
    lastNameAr: 'بوضياف',
    gender: 'FEMALE',
    birthDate: '1992-02-17',
    bloodGroup: 'AB_POS',
    commune: 'Bordj Bou Arréridj',
    insurance: 'CASNOS',
    status: 'NEW',
    medicalSummary: summary({ allergies: ['Latex'] }),
  },
  {
    id: 'demo-patient-5',
    firstName: 'Karim',
    lastName: 'Haddad',
    firstNameAr: 'كريم',
    lastNameAr: 'حداد',
    gender: 'MALE',
    birthDate: '1966-09-30',
    bloodGroup: 'O_POS',
    commune: 'El Hamadia',
    insurance: 'CNAS',
    status: 'FOLLOW_UP',
    medicalSummary: summary({
      chronicDiseases: ['Hypertension artérielle', 'Dyslipidémie'],
      currentMedications: ['Amlodipine 5 mg', 'Atorvastatine 20 mg'],
      history: ['Tabagisme sevré (2018)'],
    }),
  },
  {
    id: 'demo-patient-6',
    firstName: 'Leila',
    lastName: 'Ferhat',
    firstNameAr: 'ليلى',
    lastNameAr: 'فرحات',
    gender: 'FEMALE',
    birthDate: '1984-12-05',
    bloodGroup: 'A_NEG',
    commune: 'Bordj Bou Arréridj',
    insurance: 'PRIVATE',
    status: 'ACTIVE',
    medicalSummary: summary({
      allergies: ['Iode'],
      history: ['Thyroïdectomie partielle (2019)'],
    }),
  },
  {
    id: 'demo-patient-7',
    firstName: 'Mohamed',
    lastName: 'Cherif',
    firstNameAr: 'محمد',
    lastNameAr: 'شريف',
    gender: 'MALE',
    birthDate: '1958-06-21',
    bloodGroup: 'B_NEG',
    commune: 'Ras El Oued',
    insurance: 'CNAS',
    status: 'FOLLOW_UP',
    medicalSummary: summary({
      chronicDiseases: [
        'Diabète de type 2',
        'Insuffisance rénale chronique stade 2',
      ],
      currentMedications: ['Metformine 850 mg', 'Paracétamol 1 g si douleur'],
    }),
  },
  {
    id: 'demo-patient-8',
    firstName: 'Fatima Zohra',
    lastName: 'Belkacem',
    firstNameAr: 'فاطمة الزهراء',
    lastNameAr: 'بلقاسم',
    gender: 'FEMALE',
    birthDate: '1999-01-09',
    bloodGroup: 'A_POS',
    commune: 'Mansoura',
    insurance: 'CASNOS',
    status: 'ACTIVE',
    medicalSummary: summary({}),
  },
];

// ---------------------------------------------------------------------------
// Dates: the cabinet works on Algiers time (UTC+1, no daylight saving time).
// ---------------------------------------------------------------------------

// Today's date in Algiers, "YYYY-MM-DD".
export function algiersDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers',
  }).format(now);
}

// An instant on a given Algiers day, "HH:MM" Algiers time, `dayOffset` days
// from it.
export function algiersInstant(
  day: string,
  time: string,
  dayOffset = 0,
  minutesShift = 0,
): Date {
  const base = new Date(`${day}T${time}:00+01:00`);
  return new Date(
    base.getTime() + dayOffset * 86_400_000 + minutesShift * 60_000,
  );
}

// The day the cabinet is set for: DEMO_SEED_DAY (YYYY-MM-DD, to prepare the day
// before the presentation), otherwise today in Algiers.
export function resolveSeedDay(
  env: Record<string, string | undefined>,
  now: Date = new Date(),
): string {
  const requested = env.DEMO_SEED_DAY?.trim();
  if (!requested) return algiersDay(now);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(requested) &&
    !Number.isNaN(new Date(`${requested}T00:00:00+01:00`).getTime()) &&
    new Date(`${requested}T12:00:00+01:00`).toISOString().startsWith(requested);
  if (!valid) {
    throw new Error(
      `DEMO_SEED_DAY doit être une date AAAA-MM-JJ valide (reçu : ${requested}).`,
    );
  }
  return requested;
}

export type DemoAppointment = {
  id: string;
  patientId: string;
  time: string;
  durationMinutes: number;
  reason: string;
  status: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED';
};

// Five appointments today. The 08:30 one is already done (its consultation
// exists); the 10:00 one is the scenario's: "Démarrer la consultation".
export function demoAppointmentsFor(day: string): DemoAppointment[] {
  const slot = (
    n: number,
    patientId: string,
    time: string,
    durationMinutes: number,
    reason: string,
    status: DemoAppointment['status'],
  ): DemoAppointment => ({
    id: `demo-appointment-${day}-${n}`,
    patientId,
    time,
    durationMinutes,
    reason,
    status,
  });
  return [
    slot(1, 'demo-patient-3', '08:30', 30, 'Suivi tension', 'COMPLETED'),
    slot(
      2,
      'demo-patient-4',
      '09:15',
      30,
      'Renouvellement d’ordonnance',
      'CONFIRMED',
    ),
    slot(3, 'demo-patient-1', '10:00', 30, 'Toux persistante', 'CONFIRMED'),
    slot(4, 'demo-patient-5', '11:30', 60, 'Bilan annuel', 'SCHEDULED'),
    slot(5, 'demo-patient-6', '14:00', 30, 'Résultats d’analyses', 'SCHEDULED'),
  ];
}

export type DemoConsultation = {
  id: string;
  patientId: string;
  // Algiers day offset and time.
  dayOffset: number;
  time: string;
  // Today's 08:30 appointment, when it is the one this consultation follows.
  appointmentSlot?: number;
  chiefComplaint: string;
  historyPresentIllness: string;
  clinicalExamination: string;
  assessment: string;
  carePlan: string;
  followUpPlan: string;
  vitalSigns: Record<string, number>;
  diagnoses: Array<{
    label: string;
    code?: string;
    codeSystem?: string;
    isPrimary: boolean;
  }>;
};

// Three past consultations (completed), with their vital signs and diagnoses.
export const DEMO_CONSULTATIONS: DemoConsultation[] = [
  {
    id: 'demo-consultation-1',
    patientId: 'demo-patient-3',
    dayOffset: 0,
    time: '08:35',
    appointmentSlot: 1,
    chiefComplaint: 'Suivi de la tension',
    historyPresentIllness:
      'Céphalées matinales depuis une semaine, sans autre signe.',
    clinicalExamination: 'Examen cardiovasculaire normal. Pas d’œdème.',
    assessment: 'Tension légèrement élevée au repos.',
    carePlan: 'Contrôle à une semaine, règles hygiéno-diététiques.',
    followUpPlan: 'Automesure tensionnelle matin et soir.',
    vitalSigns: {
      systolicBp: 138,
      diastolicBp: 88,
      heartRate: 74,
      temperature: 36.8,
      weightKg: 72,
      heightCm: 178,
    },
    diagnoses: [
      {
        label: 'Hypertension artérielle limite',
        code: 'I10',
        codeSystem: 'CIM-10',
        isPrimary: true,
      },
    ],
  },
  {
    id: 'demo-consultation-2',
    patientId: 'demo-patient-1',
    dayOffset: -6,
    time: '10:00',
    chiefComplaint: 'Contrôle de la tension',
    historyPresentIllness:
      'Traité par amlodipine depuis 2 ans, bonne observance.',
    clinicalExamination: 'TA 150/95 au repos. Auscultation normale.',
    assessment: 'Hypertension artérielle insuffisamment contrôlée.',
    carePlan: 'Poursuite de l’amlodipine, contrôle dans 3 semaines.',
    followUpPlan: 'Bilan rénal et ionogramme.',
    vitalSigns: {
      systolicBp: 150,
      diastolicBp: 95,
      heartRate: 80,
      oxygenSaturation: 98,
      weightKg: 82.5,
      heightCm: 178,
    },
    diagnoses: [
      {
        label: 'Hypertension artérielle',
        code: 'I10',
        codeSystem: 'CIM-10',
        isPrimary: true,
      },
      { label: 'Surpoids', isPrimary: false },
    ],
  },
  {
    id: 'demo-consultation-3',
    patientId: 'demo-patient-2',
    dayOffset: -12,
    time: '11:15',
    chiefComplaint: 'Suivi du diabète',
    historyPresentIllness:
      'Glycémies capillaires correctes, pas d’hypoglycémie.',
    clinicalExamination: 'Examen des pieds normal.',
    assessment: 'Diabète de type 2 équilibré.',
    carePlan: 'Poursuite de la metformine.',
    followUpPlan: 'HbA1c dans 3 mois.',
    vitalSigns: {
      systolicBp: 128,
      diastolicBp: 82,
      heartRate: 70,
      weightKg: 68,
      heightCm: 162,
    },
    diagnoses: [
      {
        label: 'Diabète de type 2',
        code: 'E11',
        codeSystem: 'CIM-10',
        isPrimary: true,
      },
    ],
  },
];

export const DEMO_PRESCRIPTION = {
  id: 'demo-prescription-1',
  number: 'ORD-DEMO-000001',
  patientId: 'demo-patient-1',
  dayOffset: -6,
  time: '10:20',
  items: [
    {
      medicationId: 'demo-amlodipine-5-tablet',
      dci: 'Amlodipine',
      brandName: 'Amlor',
      strength: '5 mg',
      pharmaceuticalForm: 'TABLET' as const,
      route: 'ORAL' as const,
      regulatoryCategory: 'STANDARD' as const,
      dosePerIntake: '1 comprimé',
      frequency: '1 fois par jour',
      intakeMoment: 'le matin',
      durationDays: 30,
      quantity: '1 boîte',
      patientInstructions: 'À prendre pendant les repas.',
    },
  ],
};

// The medications of the main seed (prisma/seed.ts) that the demo uses.
export const DEMO_MEDICATIONS = [
  { id: 'demo-paracetamol-500-tablet', dci: 'Paracétamol', strength: '500 mg' },
  { id: 'demo-amoxicillin-1g-tablet', dci: 'Amoxicilline', strength: '1 g' },
  { id: 'demo-amlodipine-5-tablet', dci: 'Amlodipine', strength: '5 mg' },
] as const;

// The same canonicalization and fingerprint as PrescriptionsService, so that
// the fingerprint of the seeded prescription is the one the server computes.
export const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
};

export const fingerprint = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
