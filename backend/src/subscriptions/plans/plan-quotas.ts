// What a plan allows, in numbers. The platform enforces these; the texts of
// SubscriptionPlan.limits only display them (a test keeps both in agreement).

// Six independent chains, never run one after the other.
export const AI_PIPELINES = [
  'brain',
  'pathology-breast',
  'pathology-nuclei',
  'cardio-ecg',
  'cardio-seg-mri',
  'cardio-volume-mri',
] as const;
export type AiPipeline = (typeof AI_PIPELINES)[number];

// The chains that classify. Segmentation (nuclei, cardiac MRI) and the cardiac
// volumetry of a cine stack are reserved to the premium plans, and count for one
// AI analysis each.
export const CLASSIFICATION_PIPELINES: AiPipeline[] = [
  'brain',
  'pathology-breast',
  'cardio-ecg',
];

export const QUOTA_KEYS = [
  'maxPatients',
  'aiAnalysesPerMonth',
  'maxDoctors',
] as const;
export type QuotaKey = (typeof QUOTA_KEYS)[number];

// null is unlimited; aiPipelines null is every pipeline.
export type PlanQuotas = {
  maxPatients: number | null;
  aiAnalysesPerMonth: number | null;
  maxDoctors: number | null;
  aiPipelines: AiPipeline[] | null;
};

export const UNLIMITED_QUOTAS: PlanQuotas = {
  aiAnalysesPerMonth: null,
  aiPipelines: null,
  maxDoctors: null,
  maxPatients: null,
};

// The free trial: 14 days, 10 AI analyses for the whole trial, every
// pipeline. The other limits are those of a reference plan per account type.
export const TRIAL_DURATION_DAYS = 14;
export const TRIAL_AI_ANALYSES = 10;
export const TRIAL_REFERENCE_PLAN_CODES = {
  ESTABLISHMENT: 'EST_BASIC_CLINIC',
  INDEPENDENT_DOCTOR: 'DOCTOR_PRO',
} as const;

export function trialQuotas(reference: PlanQuotas): PlanQuotas {
  return {
    ...reference,
    aiAnalysesPerMonth: TRIAL_AI_ANALYSES,
    aiPipelines: null,
  };
}

const isPipeline = (value: unknown): value is AiPipeline =>
  (AI_PIPELINES as readonly unknown[]).includes(value);

// A JSON column read back, made safe: a missing or invalid number is no limit
// (a plan row from before the quotas had none), never a crash.
export function normalizeQuotas(value: unknown): PlanQuotas {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ...UNLIMITED_QUOTAS };
  }

  const raw = value as Record<string, unknown>;
  const limit = (key: QuotaKey): number | null => {
    const candidate = raw[key];
    return typeof candidate === 'number' &&
      Number.isInteger(candidate) &&
      candidate >= 0
      ? candidate
      : null;
  };

  return {
    aiAnalysesPerMonth: limit('aiAnalysesPerMonth'),
    aiPipelines: Array.isArray(raw.aiPipelines)
      ? raw.aiPipelines.filter(isPipeline)
      : null,
    maxDoctors: limit('maxDoctors'),
    maxPatients: limit('maxPatients'),
  };
}

export function isPipelineAllowed(
  quotas: PlanQuotas,
  pipeline: string,
): boolean {
  return (
    quotas.aiPipelines === null ||
    (quotas.aiPipelines as readonly string[]).includes(pipeline)
  );
}
