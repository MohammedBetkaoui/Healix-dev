import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SUBSCRIPTION_PLAN_CATALOG } from './plan-catalog';
import {
  AI_PIPELINES,
  CLASSIFICATION_PIPELINES,
  isPipelineAllowed,
  normalizeQuotas,
  TRIAL_AI_ANALYSES,
  TRIAL_DURATION_DAYS,
  TRIAL_REFERENCE_PLAN_CODES,
  trialQuotas,
  type PlanQuotas,
} from './plan-quotas';

const plan = (code: string) => {
  const found = SUBSCRIPTION_PLAN_CATALOG.find((entry) => entry.code === code);
  if (!found) throw new Error(`Unknown plan ${code}`);
  return found;
};

// "2 000 analyses IA / mois" -> 2000 ; "Patients illimites" -> null.
function readLimits(limits: string[]) {
  const read: Partial<Record<keyof PlanQuotas, number | null>> = {};

  for (const text of limits) {
    const number = (match: RegExpMatchArray) =>
      Number(match[1].replace(/\s/g, ''));
    let match: RegExpMatchArray | null;

    if ((match = text.match(/^([\d\s]+)\s*patients$/i))) {
      read.maxPatients = number(match);
    } else if (/^patients illimites$/i.test(text)) {
      read.maxPatients = null;
    } else if ((match = text.match(/^([\d\s]+)\s*analyses IA \/ mois$/i))) {
      read.aiAnalysesPerMonth = number(match);
    } else if (
      (match = text.match(/^([\d\s]+)\s*(medecins?|utilisateurs?)$/i))
    ) {
      read.maxDoctors = number(match);
    }
  }

  return read;
}

describe('the plan catalog', () => {
  it('registers the seven plans', () => {
    expect(SUBSCRIPTION_PLAN_CATALOG.map((entry) => entry.code)).toEqual([
      'DOCTOR_STARTER',
      'DOCTOR_PRO',
      'DOCTOR_PREMIUM_AI',
      'EST_BASIC_CLINIC',
      'EST_PRO_CENTER',
      'EST_ENTERPRISE',
      'EST_CUSTOM',
    ]);
  });

  it.each(SUBSCRIPTION_PLAN_CATALOG.filter((entry) => !entry.custom))(
    '$code: the texts of limits say what quotas enforce',
    (entry) => {
      const read = readLimits(entry.limits);

      // What the text announces, the platform enforces.
      for (const [key, value] of Object.entries(read)) {
        expect(entry.quotas[key as keyof PlanQuotas]).toBe(value);
      }
      // Patients and AI analyses are always announced.
      expect(read).toHaveProperty('maxPatients');
      expect(read).toHaveProperty('aiAnalysesPerMonth');
    },
  );

  it.each(
    SUBSCRIPTION_PLAN_CATALOG.filter(
      (entry) => entry.accountType === 'INDEPENDENT_DOCTOR',
    ),
  )('$code is for one doctor', (entry) => {
    expect(entry.quotas.maxDoctors).toBe(1);
  });

  it('gives each plan the numbers of the offer', () => {
    const numbers = Object.fromEntries(
      SUBSCRIPTION_PLAN_CATALOG.map((entry) => [
        entry.code,
        [
          entry.quotas.maxDoctors,
          entry.quotas.maxPatients,
          entry.quotas.aiAnalysesPerMonth,
        ],
      ]),
    );

    expect(numbers).toEqual({
      DOCTOR_STARTER: [1, 100, 20],
      DOCTOR_PRO: [1, null, 100],
      DOCTOR_PREMIUM_AI: [1, null, 300],
      EST_BASIC_CLINIC: [5, 500, 100],
      EST_PRO_CENTER: [20, null, 500],
      EST_ENTERPRISE: [100, null, 2000],
      EST_CUSTOM: [null, null, null],
    });
  });

  it('reserves segmentation to the premium doctor plan: Starter and Pro classify only', () => {
    expect(plan('DOCTOR_STARTER').quotas.aiPipelines).toEqual([
      'brain',
      'pathology-breast',
      'cardio-ecg',
    ]);
    expect(plan('DOCTOR_PRO').quotas.aiPipelines).toEqual(
      plan('DOCTOR_STARTER').quotas.aiPipelines,
    );
    expect(plan('DOCTOR_PREMIUM_AI').quotas.aiPipelines).toBeNull();
    for (const segmentation of [
      'pathology-nuclei',
      'cardio-seg-mri',
      // The volumes of a cine stack come from the same segmentation model.
      'cardio-volume-mri',
    ]) {
      expect(isPipelineAllowed(plan('DOCTOR_PRO').quotas, segmentation)).toBe(
        false,
      );
      expect(
        isPipelineAllowed(plan('DOCTOR_PREMIUM_AI').quotas, segmentation),
      ).toBe(true);
    }
  });

  it('opens every pipeline to the establishment plans', () => {
    for (const code of [
      'EST_BASIC_CLINIC',
      'EST_PRO_CENTER',
      'EST_ENTERPRISE',
    ]) {
      for (const pipeline of AI_PIPELINES) {
        expect(isPipelineAllowed(plan(code).quotas, pipeline)).toBe(true);
      }
    }
  });

  it('lists only known pipelines, and the classification ones are a part of them', () => {
    for (const entry of SUBSCRIPTION_PLAN_CATALOG) {
      for (const pipeline of entry.quotas.aiPipelines ?? []) {
        expect(AI_PIPELINES).toContain(pipeline);
      }
    }
    for (const pipeline of CLASSIFICATION_PIPELINES) {
      expect(AI_PIPELINES).toContain(pipeline);
    }
  });

  it('puts the custom plan on quote: no online price, quotas fixed by an administrator', () => {
    expect(plan('EST_CUSTOM')).toMatchObject({
      annualPrice: null,
      custom: true,
      limits: ['Sur devis'],
      monthlyPrice: null,
    });
  });

  // The migration filled the quotas of the existing rows with SQL: it must
  // say what the catalog says.
  it('is the same as the quotas written by the migration', () => {
    const sql = readFileSync(
      join(
        __dirname,
        '../../../prisma/migrations/20261024120000_subscription_trial_quotas_events/migration.sql',
      ),
      'utf8',
    );
    const fromSql = new Map<string, unknown>(
      [
        ...sql.matchAll(
          /SET `quotas` = '(\{[^']*\})' WHERE `code` = '([A-Z_]+)'/g,
        ),
      ].map((match) => [match[2], JSON.parse(match[1])]),
    );

    expect([...fromSql.keys()].sort()).toEqual(
      SUBSCRIPTION_PLAN_CATALOG.map((entry) => entry.code).sort(),
    );
    for (const entry of SUBSCRIPTION_PLAN_CATALOG) {
      expect(fromSql.get(entry.code)).toEqual(entry.quotas);
    }
  });
});

describe('the trial', () => {
  it('lasts 14 days and allows 10 AI analyses for all of it', () => {
    expect(TRIAL_DURATION_DAYS).toBe(14);
    expect(TRIAL_AI_ANALYSES).toBe(10);
  });

  it('uses DOCTOR_PRO for a doctor and EST_BASIC_CLINIC for an establishment', () => {
    expect(TRIAL_REFERENCE_PLAN_CODES).toEqual({
      ESTABLISHMENT: 'EST_BASIC_CLINIC',
      INDEPENDENT_DOCTOR: 'DOCTOR_PRO',
    });
  });

  it.each(['DOCTOR_PRO', 'EST_BASIC_CLINIC'])(
    'keeps the other limits of %s and opens every pipeline',
    (code) => {
      expect(trialQuotas(plan(code).quotas)).toEqual({
        ...plan(code).quotas,
        aiAnalysesPerMonth: 10,
        aiPipelines: null,
      });
    },
  );
});

describe('normalizeQuotas', () => {
  it('keeps valid quotas', () => {
    const quotas = {
      aiAnalysesPerMonth: 5,
      aiPipelines: ['brain'],
      maxDoctors: 2,
      maxPatients: 10,
    };

    expect(normalizeQuotas(quotas)).toEqual(quotas);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'x'],
    ['an empty object', {}],
  ])('reads %s as no limit', (_case, value) => {
    expect(normalizeQuotas(value)).toEqual({
      aiAnalysesPerMonth: null,
      aiPipelines: null,
      maxDoctors: null,
      maxPatients: null,
    });
  });

  it('drops invalid numbers and unknown pipelines', () => {
    expect(
      normalizeQuotas({
        aiAnalysesPerMonth: -1,
        aiPipelines: ['brain', 'mystery'],
        maxDoctors: 1.5,
        maxPatients: '10',
      }),
    ).toEqual({
      aiAnalysesPerMonth: null,
      aiPipelines: ['brain'],
      maxDoctors: null,
      maxPatients: null,
    });
  });

  it('keeps an empty pipeline list: no pipeline allowed', () => {
    expect(normalizeQuotas({ aiPipelines: [] }).aiPipelines).toEqual([]);
  });
});
