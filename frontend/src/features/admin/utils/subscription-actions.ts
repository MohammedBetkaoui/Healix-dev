import {
  activateAdminCustomSubscription,
  cancelAdminSubscription,
  extendAdminSubscription,
  extendAdminTrial,
  updateAdminSubscriptionQuotas,
} from "../api/admin-subscriptions.api";
import {
  type AdminQuotasInput,
  type AdminSubscriptionActionResponse,
} from "../subscriptions.types";

// The actions of the console, for the cases the card payment does not cover.
// Each needs a reason (the backend keeps it in the history of the subscription
// and in the audit log, and refuses one under 5 characters): the check is made
// here first, so that a request without one is never sent.
export const ADMIN_REASON_MIN_LENGTH = 5;
export const ADMIN_REASON_MAX_LENGTH = 500;
export const TRIAL_EXTENSION_MAX_DAYS = 30;
export const EXTENSION_MAX_DAYS = 365;

export const adminActionKinds = ["extendTrial", "extend", "cancel", "quotas", "activateCustom"] as const;
export type AdminActionKind = (typeof adminActionKinds)[number];

export type QuotaFieldMode = "keep" | "unlimited" | "value";
export type QuotaFieldForm = { mode: QuotaFieldMode; value: string };
export type PipelinesFieldForm = { mode: "all" | "keep" | "some"; selected: string[] };

export type AdminActionForm = {
  days: string;
  planId: string;
  quotas: {
    aiAnalysesPerMonth: QuotaFieldForm;
    aiPipelines: PipelinesFieldForm;
    maxDoctors: QuotaFieldForm;
    maxPatients: QuotaFieldForm;
  };
  reason: string;
  // The quotas action: back to the quotas of the plan.
  resetQuotas: boolean;
  until: string;
};

const keep = (): QuotaFieldForm => ({ mode: "keep", value: "" });

export function emptyActionForm(): AdminActionForm {
  return {
    days: "",
    planId: "EST_CUSTOM",
    quotas: {
      aiAnalysesPerMonth: keep(),
      aiPipelines: { mode: "keep", selected: [] },
      maxDoctors: keep(),
      maxPatients: keep(),
    },
    reason: "",
    resetQuotas: false,
    until: "",
  };
}

export type AdminActionError =
  | "daysInvalid"
  | "planRequired"
  | "quotasInvalid"
  | "reasonRequired"
  | "reasonTooLong"
  | "untilInvalid";

const wholeNumber = /^\d+$/;

function quotaValue(field: QuotaFieldForm): number | null | undefined {
  if (field.mode === "keep") return undefined;
  if (field.mode === "unlimited") return null;
  return wholeNumber.test(field.value.trim()) ? Number(field.value.trim()) : Number.NaN;
}

// The quotas the form fixes; a key left out keeps the plan's value.
export function buildQuotasInput(form: AdminActionForm): AdminQuotasInput {
  const input: AdminQuotasInput = {};
  const numbers = ["aiAnalysesPerMonth", "maxDoctors", "maxPatients"] as const;

  for (const key of numbers) {
    const value = quotaValue(form.quotas[key]);
    if (value !== undefined) input[key] = value;
  }

  if (form.quotas.aiPipelines.mode === "all") input.aiPipelines = null;
  if (form.quotas.aiPipelines.mode === "some") input.aiPipelines = form.quotas.aiPipelines.selected;

  return input;
}

function hasInvalidQuota(form: AdminActionForm): boolean {
  const numbers = ["aiAnalysesPerMonth", "maxDoctors", "maxPatients"] as const;

  return numbers.some((key) => Number.isNaN(quotaValue(form.quotas[key])));
}

// null when the action can be sent. The reason comes first: it is what every
// action is asked for.
export function validateAdminAction(kind: AdminActionKind, form: AdminActionForm, now = new Date()): AdminActionError | null {
  const reason = form.reason.trim();

  if (reason.length < ADMIN_REASON_MIN_LENGTH) return "reasonRequired";
  if (reason.length > ADMIN_REASON_MAX_LENGTH) return "reasonTooLong";

  if (kind === "extendTrial" || kind === "extend") {
    const max = kind === "extendTrial" ? TRIAL_EXTENSION_MAX_DAYS : EXTENSION_MAX_DAYS;
    const days = Number(form.days);

    if (!wholeNumber.test(form.days.trim()) || days < 1 || days > max) return "daysInvalid";
  }

  if (kind === "quotas" && !form.resetQuotas) {
    if (hasInvalidQuota(form)) return "quotasInvalid";
    if (form.quotas.aiPipelines.mode === "some" && form.quotas.aiPipelines.selected.length === 0) return "quotasInvalid";
  }

  if (kind === "activateCustom") {
    if (!form.planId.trim()) return "planRequired";

    const until = new Date(form.until);
    if (form.until === "" || Number.isNaN(until.getTime()) || until <= now) return "untilInvalid";
    if (hasInvalidQuota(form)) return "quotasInvalid";
  }

  return null;
}

export class AdminActionValidationError extends Error {
  constructor(readonly code: AdminActionError) {
    super(code);
  }
}

export type AdminSubscriptionApi = {
  activateCustom: typeof activateAdminCustomSubscription;
  cancel: typeof cancelAdminSubscription;
  extend: typeof extendAdminSubscription;
  extendTrial: typeof extendAdminTrial;
  quotas: typeof updateAdminSubscriptionQuotas;
};

const defaultApi: AdminSubscriptionApi = {
  activateCustom: activateAdminCustomSubscription,
  cancel: cancelAdminSubscription,
  extend: extendAdminSubscription,
  extendTrial: extendAdminTrial,
  quotas: updateAdminSubscriptionQuotas,
};

// Validates, then sends: without a valid reason nothing leaves the browser.
export async function submitAdminAction(
  kind: AdminActionKind,
  accountId: string,
  form: AdminActionForm,
  api: AdminSubscriptionApi = defaultApi,
): Promise<AdminSubscriptionActionResponse> {
  const error = validateAdminAction(kind, form);

  if (error) {
    throw new AdminActionValidationError(error);
  }

  const reason = form.reason.trim();

  switch (kind) {
    case "extendTrial":
      return api.extendTrial(accountId, { days: Number(form.days), reason });
    case "extend":
      return api.extend(accountId, { days: Number(form.days), reason });
    case "cancel":
      return api.cancel(accountId, { reason });
    case "quotas":
      return api.quotas(accountId, { quotas: form.resetQuotas ? null : buildQuotasInput(form), reason });
    case "activateCustom": {
      const quotas = buildQuotasInput(form);

      return api.activateCustom(accountId, {
        planId: form.planId.trim(),
        ...(Object.keys(quotas).length > 0 ? { quotas } : {}),
        reason,
        until: new Date(form.until).toISOString(),
      });
    }
  }
}
