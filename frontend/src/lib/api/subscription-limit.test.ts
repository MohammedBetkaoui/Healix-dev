import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

import { dictionaries, type Locale } from "@/i18n";
import { translate, type TranslationFunction } from "@/lib/i18n";

import { getMutationErrorMessage, getSubscriptionLimitMessage } from "./get-mutation-error-message";
import { describeSubscriptionLimit, getSubscriptionLimit } from "./subscription-limit";

function axiosError(status: number, data: unknown) {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = { config, data, headers: {}, status, statusText: "" };
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, {}, response);
}

const tFor =
  (locale: Locale): TranslationFunction =>
  (key, params) =>
    translate(dictionaries[locale], key, params);

const quotaExceeded = axiosError(403, { code: "QUOTA_EXCEEDED", limit: 20, message: "Quota atteint.", quota: "aiAnalysesPerMonth", used: 20 });
const inactive = axiosError(403, { code: "SUBSCRIPTION_INACTIVE", expiresAt: "2026-10-01T00:00:00.000Z", message: "Abonnement inactif.", status: "EXPIRED" });
const notInPlan = axiosError(403, { code: "AI_PIPELINE_NOT_IN_PLAN", message: "Modele hors plan.", pipeline: "cardio-seg-mri" });
const requiresContact = axiosError(400, { code: "PLAN_REQUIRES_CONTACT", message: "Plan sur devis." });

describe("getSubscriptionLimit", () => {
  it("reads the four refusals of the subscription, with their figures", () => {
    expect(getSubscriptionLimit(quotaExceeded)).toEqual({ code: "QUOTA_EXCEEDED", limit: 20, quota: "aiAnalysesPerMonth", trial: false, used: 20 });
    expect(getSubscriptionLimit(inactive)).toEqual({ code: "SUBSCRIPTION_INACTIVE", expiresAt: "2026-10-01T00:00:00.000Z", status: "EXPIRED" });
    expect(getSubscriptionLimit(notInPlan)).toEqual({ code: "AI_PIPELINE_NOT_IN_PLAN", pipeline: "cardio-seg-mri" });
    expect(getSubscriptionLimit(requiresContact)).toEqual({ code: "PLAN_REQUIRES_CONTACT" });
  });

  it("reads an inactive subscription without details as expired", () => {
    expect(getSubscriptionLimit(axiosError(403, { code: "SUBSCRIPTION_INACTIVE" }))).toEqual({ code: "SUBSCRIPTION_INACTIVE", expiresAt: null, status: "EXPIRED" });
  });

  it("ignores everything else: the other 403, a code on another status, a quota without figures, a network error", () => {
    expect(getSubscriptionLimit(axiosError(403, { code: "VERIFICATION_REQUIRED" }))).toBeNull();
    expect(getSubscriptionLimit(axiosError(403, { message: "Interdit." }))).toBeNull();
    // QUOTA_EXCEEDED is a 403; PLAN_REQUIRES_CONTACT a 400.
    expect(getSubscriptionLimit(axiosError(409, { code: "QUOTA_EXCEEDED", limit: 1, quota: "maxPatients", used: 1 }))).toBeNull();
    expect(getSubscriptionLimit(axiosError(403, { code: "PLAN_REQUIRES_CONTACT" }))).toBeNull();
    expect(getSubscriptionLimit(axiosError(400, { code: "VALIDATION_ERROR" }))).toBeNull();
    expect(getSubscriptionLimit(axiosError(403, { code: "QUOTA_EXCEEDED", quota: "maxPatients" }))).toBeNull();
    expect(getSubscriptionLimit(axiosError(403, { code: "QUOTA_EXCEEDED", limit: 1, quota: "somethingElse", used: 1 }))).toBeNull();
    expect(getSubscriptionLimit(axiosError(500, undefined))).toBeNull();
    expect(getSubscriptionLimit(new Error("network"))).toBeNull();
  });
});

describe("describeSubscriptionLimit", () => {
  it("says the quota reached, with the figures (French)", () => {
    const t = tFor("fr");

    expect(describeSubscriptionLimit({ code: "QUOTA_EXCEEDED", limit: 20, quota: "aiAnalysesPerMonth", used: 20 }, t)).toBe("Quota d'analyses IA atteint : 20/20 ce mois-ci");
    expect(describeSubscriptionLimit({ code: "QUOTA_EXCEEDED", limit: 100, quota: "maxPatients", used: 100 }, t)).toBe("Limite de patients atteinte : 100/100");
    expect(describeSubscriptionLimit({ code: "QUOTA_EXCEEDED", limit: 5, quota: "maxDoctors", used: 5 }, t)).toBe("Nombre de médecins atteint : 5/5");
  });

  it("counts the AI analyses over the whole trial during a trial, not per month", () => {
    const limit = { code: "QUOTA_EXCEEDED", limit: 10, quota: "aiAnalysesPerMonth", used: 10 } as const;

    expect(describeSubscriptionLimit(limit, tFor("fr"), { trial: true })).toBe("Quota d'analyses IA de l'essai atteint : 10/10");
    expect(describeSubscriptionLimit(limit, tFor("fr"), { trial: false })).toContain("ce mois-ci");
  });

  it("says it is the trial's when the refusal itself says so, wherever it is shown", () => {
    const trialQuota = axiosError(403, { code: "QUOTA_EXCEEDED", limit: 10, quota: "aiAnalysesPerMonth", trial: true, used: 10 });

    expect(getSubscriptionLimit(trialQuota)).toEqual({ code: "QUOTA_EXCEEDED", limit: 10, quota: "aiAnalysesPerMonth", trial: true, used: 10 });
    // The message of a write modal knows nothing else than the refusal.
    expect(getMutationErrorMessage(trialQuota, tFor("fr"), "Impossible.")).toBe("Quota d'analyses IA de l'essai atteint : 10/10");
    expect(getMutationErrorMessage(trialQuota, tFor("ar"), "Impossible.")).toBe(
      translate(dictionaries.ar, "subscription.limits.quotaTrial.aiAnalysesPerMonth", { limit: 10, used: 10 }),
    );
    // The patients and doctors quotas have no trial wording.
    expect(getMutationErrorMessage(axiosError(403, { code: "QUOTA_EXCEEDED", limit: 5, quota: "maxPatients", trial: true, used: 5 }), tFor("fr"), "Impossible.")).toBe("Limite de patients atteinte : 5/5");
  });

  it.each<Locale>(["fr", "ar"])("has a sentence for each refusal (%s), never the key itself", (locale) => {
    const t = tFor(locale);
    const sentences = [
      describeSubscriptionLimit({ code: "SUBSCRIPTION_INACTIVE", expiresAt: null, status: "EXPIRED" }, t),
      describeSubscriptionLimit({ code: "QUOTA_EXCEEDED", limit: 20, quota: "aiAnalysesPerMonth", used: 20 }, t),
      describeSubscriptionLimit({ code: "QUOTA_EXCEEDED", limit: 10, quota: "aiAnalysesPerMonth", used: 10 }, t, { trial: true }),
      describeSubscriptionLimit({ code: "QUOTA_EXCEEDED", limit: 100, quota: "maxPatients", used: 100 }, t),
      describeSubscriptionLimit({ code: "QUOTA_EXCEEDED", limit: 5, quota: "maxDoctors", used: 5 }, t),
      describeSubscriptionLimit({ code: "AI_PIPELINE_NOT_IN_PLAN", pipeline: "brain" }, t),
      describeSubscriptionLimit({ code: "PLAN_REQUIRES_CONTACT" }, t),
    ];

    for (const sentence of sentences) {
      expect(sentence).not.toMatch(/^subscription\./);
      expect(sentence.length).toBeGreaterThan(10);
    }
    // The figures are filled in, in either language.
    expect(sentences[1]).toContain("20");
    expect(sentences[1]).not.toContain("{");
    expect(new Set(sentences).size).toBe(sentences.length);
  });
});

describe("the error message of a write modal, for the subscription's refusals", () => {
  const fallback = "Impossible d'enregistrer.";

  it.each<Locale>(["fr", "ar"])("translates the four codes (%s) instead of showing the backend's French", (locale) => {
    const t = tFor(locale);
    const expected = {
      inactive: dictionaries[locale].subscription.limits.inactive,
      notInPlan: dictionaries[locale].subscription.limits.pipeline,
      quota: translate(dictionaries[locale], "subscription.limits.quota.aiAnalysesPerMonth", { limit: 20, used: 20 }),
      requiresContact: dictionaries[locale].subscription.limits.contact,
    };

    expect(getMutationErrorMessage(inactive, t, fallback)).toBe(expected.inactive);
    expect(getMutationErrorMessage(quotaExceeded, t, fallback)).toBe(expected.quota);
    expect(getMutationErrorMessage(notInPlan, t, fallback)).toBe(expected.notInPlan);
    expect(getMutationErrorMessage(requiresContact, t, fallback)).toBe(expected.requiresContact);
    // Not the backend's message.
    expect(getMutationErrorMessage(quotaExceeded, t, fallback)).not.toBe("Quota atteint.");
  });

  it("states the quota reached as the product asks, in French", () => {
    expect(getMutationErrorMessage(quotaExceeded, tFor("fr"), fallback)).toBe("Quota d'analyses IA atteint : 20/20 ce mois-ci");
  });

  it("answers only for the subscription's refusals", () => {
    expect(getSubscriptionLimitMessage(axiosError(409, { message: "Conflit." }), tFor("fr"))).toBeUndefined();
    expect(getSubscriptionLimitMessage(new Error("boom"), tFor("fr"))).toBeUndefined();
    expect(getMutationErrorMessage(axiosError(409, { message: "Conflit." }), tFor("fr"), fallback)).toBe("Conflit.");
  });
});
