import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries } from "@/i18n";
import { type SubscriptionLimit } from "@/lib/api/subscription-limit";
import { translate } from "@/lib/i18n";
import { type SubscriptionPlan } from "@/types/subscription";

import { getLimitAction, SubscriptionLimitDialogView, type LimitAction } from "./SubscriptionLimitDialog";

const t = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);
const ar = (key: string, params?: Record<string, string | number>) => translate(dictionaries.ar, key, params);
const escaped = (text: string) => text.replaceAll("'", "&#x27;");

const plan = (id: string, monthlyPrice: number | null, quotas: SubscriptionPlan["quotas"], custom = false): SubscriptionPlan => ({
  accountType: "INDEPENDENT_DOCTOR",
  annualPrice: monthlyPrice === null ? null : monthlyPrice * 10,
  currency: "DZD",
  custom,
  description: "",
  features: [],
  id,
  limits: [],
  monthlyPrice,
  name: `subscription.plans.${id}`,
  quotas,
});

const classification = ["brain", "pathology-breast", "cardio-ecg"];
const starter = plan("DOCTOR_STARTER", 2_900, { aiAnalysesPerMonth: 20, aiPipelines: classification, maxDoctors: 1, maxPatients: 100 });
const pro = plan("DOCTOR_PRO", 5_900, { aiAnalysesPerMonth: 100, aiPipelines: classification, maxDoctors: 1, maxPatients: null });
const premium = plan("DOCTOR_PREMIUM_AI", 9_900, { aiAnalysesPerMonth: 300, aiPipelines: null, maxDoctors: 1, maxPatients: null });
const plans = [premium, starter, pro];

const aiQuota = (limit: number): SubscriptionLimit => ({ code: "QUOTA_EXCEEDED", limit, quota: "aiAnalysesPerMonth", used: limit });
const context = (overrides: Partial<Parameters<typeof getLimitAction>[1]> = {}) => ({
  canManage: true,
  currentPlanId: "DOCTOR_STARTER",
  plans,
  trial: false,
  ...overrides,
});

describe("getLimitAction: what the dialog offers", () => {
  it("leads a full plan straight to the payment of the next plan", () => {
    expect(getLimitAction(aiQuota(20), context())).toEqual({ kind: "upgrade", plan: pro });
    expect(getLimitAction(aiQuota(100), context({ currentPlanId: "DOCTOR_PRO" }))).toEqual({ kind: "upgrade", plan: premium });
  });

  it("leads a full trial to the plan it was trying", () => {
    expect(getLimitAction(aiQuota(10), context({ currentPlanId: "DOCTOR_PRO", trial: true }))).toEqual({ kind: "upgrade", plan: pro });
  });

  it("leads a chain out of the plan to the plan that opens it", () => {
    expect(getLimitAction({ code: "AI_PIPELINE_NOT_IN_PLAN", pipeline: "cardio-seg-mri" }, context({ currentPlanId: "DOCTOR_PRO" }))).toEqual({ kind: "upgrade", plan: premium });
  });

  it("offers nothing above the top plan", () => {
    expect(getLimitAction(aiQuota(300), context({ currentPlanId: "DOCTOR_PREMIUM_AI" }))).toEqual({ kind: "none", reason: "top" });
  });

  it("offers to renew the plan that ended, and to choose one when there is none to renew", () => {
    const expired: SubscriptionLimit = { code: "SUBSCRIPTION_INACTIVE", expiresAt: "2026-10-01T00:00:00.000Z", status: "EXPIRED" };
    const canceled: SubscriptionLimit = { code: "SUBSCRIPTION_INACTIVE", expiresAt: null, status: "CANCELED" };

    expect(getLimitAction(expired, context({ currentPlanId: "DOCTOR_PRO" }))).toEqual({ kind: "renew", plan: pro });
    expect(getLimitAction(canceled, context({ currentPlanId: "DOCTOR_PRO" }))).toEqual({ kind: "choose" });
    expect(getLimitAction(expired, context({ currentPlanId: null }))).toEqual({ kind: "choose" });
    // A plan on quote is not renewed online.
    expect(getLimitAction(expired, context({ currentPlanId: "EST_CUSTOM", plans: [...plans, plan("EST_CUSTOM", null, { aiAnalysesPerMonth: null, aiPipelines: null, maxDoctors: null, maxPatients: null }, true)] }))).toEqual({ kind: "choose" });
  });

  it("sends a plan on quote to the team, whoever asks", () => {
    expect(getLimitAction({ code: "PLAN_REQUIRES_CONTACT" }, context())).toEqual({ kind: "none", reason: "contact" });
    expect(getLimitAction({ code: "PLAN_REQUIRES_CONTACT" }, context({ canManage: false }))).toEqual({ kind: "none", reason: "contact" });
  });

  it("sends an affiliated doctor to the establishment: the subscription is not theirs to pay", () => {
    expect(getLimitAction(aiQuota(20), context({ canManage: false }))).toEqual({ kind: "none", reason: "managed" });
    expect(getLimitAction({ code: "SUBSCRIPTION_INACTIVE", expiresAt: null, status: "EXPIRED" }, context({ canManage: false }))).toEqual({ kind: "none", reason: "managed" });
  });
});

describe("SubscriptionLimitDialogView", () => {
  const render = (limit: SubscriptionLimit | null, action: LimitAction, extra: { error?: string; isPreparing?: boolean; trial?: boolean; translate?: typeof t } = {}) =>
    renderToStaticMarkup(
      <SubscriptionLimitDialogView
        action={action}
        error={extra.error}
        isPreparing={extra.isPreparing ?? false}
        limit={limit}
        onAction={jest.fn()}
        onClose={jest.fn()}
        t={extra.translate ?? t}
        trial={extra.trial ?? false}
      />,
    );

  it("says « Quota d'analyses IA atteint : 20/20 ce mois-ci » and offers « Passer au plan supérieur »", () => {
    const html = render(aiQuota(20), { kind: "upgrade", plan: pro });

    expect(html).toContain("<dialog");
    expect(html).toContain(escaped("Quota d'analyses IA atteint : 20/20 ce mois-ci"));
    expect(html).toContain(">Passer au plan supérieur<");
    // The plan on offer, with its price.
    expect(html).toContain(escaped(t("subscription.limits.suggestion", { plan: t(pro.name), price: "5 900" })));
    expect(html).toContain(">Fermer<");
  });

  it("counts the whole trial for the analyses of a trial", () => {
    const html = render(aiQuota(10), { kind: "upgrade", plan: pro }, { trial: true });

    expect(html).toContain(escaped("Quota d'analyses IA de l'essai atteint : 10/10"));
    expect(html).not.toContain("ce mois-ci");
  });

  it("offers to renew an expired subscription, and to choose a plan otherwise", () => {
    const inactive: SubscriptionLimit = { code: "SUBSCRIPTION_INACTIVE", expiresAt: null, status: "EXPIRED" };

    expect(render(inactive, { kind: "renew", plan: pro })).toContain(">Renouveler<");
    expect(render(inactive, { kind: "choose" })).toContain(">Choisir un plan<");
  });

  it("disables the button while the payment is prepared", () => {
    const html = render(aiQuota(20), { kind: "upgrade", plan: pro }, { isPreparing: true });

    expect(html).toContain(t("subscription.limits.preparing"));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Préparation du paiement/);
  });

  it("explains, without a button to pay, that the establishment manages the subscription", () => {
    const html = render(aiQuota(20), { kind: "none", reason: "managed" });

    expect(html).toContain(escaped(t("subscription.limits.managedByEstablishment")));
    expect(html).not.toContain("Passer au plan supérieur");
    expect(html.match(/<button/g)).toHaveLength(2);
  });

  it("says there is no higher plan, and sends a plan on quote to the team", () => {
    expect(render(aiQuota(300), { kind: "none", reason: "top" })).toContain(escaped(t("subscription.limits.noHigherPlan")));
    expect(render({ code: "PLAN_REQUIRES_CONTACT" }, { kind: "none", reason: "contact" })).toContain(escaped(t("subscription.limits.contact")));
  });

  it("shows why the payment could not be prepared", () => {
    const html = render(aiQuota(20), { kind: "upgrade", plan: pro }, { error: "Le serveur est indisponible." });

    expect(html).toContain('role="alert"');
    expect(html).toContain("Le serveur est indisponible.");
  });

  it("speaks Arabic as well", () => {
    const html = render(aiQuota(20), { kind: "upgrade", plan: pro }, { translate: ar });

    expect(html).toContain(ar("subscription.limits.upgrade"));
    expect(html).toContain(ar("subscription.limits.quota.aiAnalysesPerMonth", { limit: 20, used: 20 }));
    expect(html).not.toContain("Passer au plan supérieur");
  });
});
