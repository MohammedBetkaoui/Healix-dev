import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { type QuotaKey } from './plans/plan-quotas';

// An object body is sent as-is by Nest's default exception filter, so the
// frontend reads response.data.code (and the figures it shows the user).

export const SUBSCRIPTION_INACTIVE_CODE = 'SUBSCRIPTION_INACTIVE';
export const QUOTA_EXCEEDED_CODE = 'QUOTA_EXCEEDED';
export const AI_PIPELINE_NOT_IN_PLAN_CODE = 'AI_PIPELINE_NOT_IN_PLAN';
export const PLAN_REQUIRES_CONTACT_CODE = 'PLAN_REQUIRES_CONTACT';
export const PAYMENT_METHOD_DISABLED_CODE = 'PAYMENT_METHOD_DISABLED';

export function subscriptionInactive(status: string, expiresAt: Date | null) {
  return new ForbiddenException({
    code: SUBSCRIPTION_INACTIVE_CODE,
    expiresAt,
    message:
      'Votre abonnement est inactif : le compte est en lecture seule. Choisissez un plan pour créer de nouveaux éléments.',
    status,
  });
}

// `trial`: the quota is the free trial's (counted over the whole trial, not per
// month), which the message shown to the user says.
export function quotaExceeded(
  quota: QuotaKey,
  used: number,
  limit: number,
  trial = false,
) {
  return new ForbiddenException({
    code: QUOTA_EXCEEDED_CODE,
    limit,
    message: 'Le quota de votre abonnement est atteint.',
    quota,
    trial,
    used,
  });
}

export function pipelineNotInPlan(pipeline: string) {
  return new ForbiddenException({
    code: AI_PIPELINE_NOT_IN_PLAN_CODE,
    message: "Ce modèle d'analyse IA n'est pas inclus dans votre plan.",
    pipeline,
  });
}

export function planRequiresContact() {
  return new BadRequestException({
    code: PLAN_REQUIRES_CONTACT_CODE,
    message:
      "Ce plan est sur devis : contactez l'équipe HealixDZ, il ne se paie pas en ligne.",
  });
}

export function paymentMethodDisabled() {
  return new BadRequestException({
    code: PAYMENT_METHOD_DISABLED_CODE,
    message:
      "Ce mode de règlement n'est pas disponible : payez par carte en ligne.",
  });
}
