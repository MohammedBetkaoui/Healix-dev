import { type SubscriptionPlan } from "@/types/subscription";

import { type Entitlements } from "../types/entitlements.types";
import {
  findUpgradePlan,
  getBannerActionKind,
  getBannerState,
  getGaugeState,
  isPipelineLocked,
  quotaGauges,
} from "./entitlements-presentation";

const entitlements = (overrides: Partial<Entitlements> = {}): Entitlements => ({
  canManage: true,
  daysLeft: 20,
  expiresAt: "2026-11-15T12:00:00.000Z",
  plan: { code: "DOCTOR_PRO", custom: false, id: "plan-pro", name: "Pro" },
  quotas: { aiAnalysesPerMonth: 100, aiPipelines: ["brain", "pathology-breast", "cardio-ecg"], maxDoctors: 1, maxPatients: null },
  readOnly: false,
  status: "ACTIVE",
  trial: false,
  usage: { aiAnalysesThisMonth: 0, doctors: 1, patients: 0 },
  ...overrides,
});

describe("getGaugeState: orange from 80 %, red at 100 %", () => {
  it.each([
    [0, 20, "ok", 0],
    [15, 20, "ok", 75],
    // 79 / 100: still green.
    [79, 100, "ok", 79],
    // Exactly 80 %: orange.
    [16, 20, "warning", 80],
    [80, 100, "warning", 80],
    [19, 20, "warning", 95],
    // Exactly 100 %: red.
    [20, 20, "danger", 100],
    [100, 100, "danger", 100],
    // Past the limit (never seen, but never beyond the bar).
    [25, 20, "danger", 100],
  ] as const)("%s used of %s is %s (%s %% of the bar)", (used, limit, tone, percent) => {
    expect(getGaugeState(used, limit)).toEqual({ limit, percent, tone, used });
  });

  it("shows an unlimited quota as such, with no bar to fill", () => {
    expect(getGaugeState(4_200, null)).toEqual({ limit: null, percent: 0, tone: "unlimited", used: 4_200 });
  });

  it("treats a quota of zero as reached", () => {
    expect(getGaugeState(0, 0).tone).toBe("danger");
  });

  it("reads the usage of the three quotas from the entitlements, in the order of the page", () => {
    const usage = { aiAnalysesThisMonth: 7, doctors: 2, patients: 31 };

    expect(quotaGauges.map(({ key, usage: read }) => [key, read(entitlements({ usage }))])).toEqual([
      ["aiAnalysesPerMonth", 7],
      ["maxPatients", 31],
      ["maxDoctors", 2],
    ]);
  });
});

describe("getBannerState", () => {
  it("says nothing without entitlements, or while a paid subscription has time", () => {
    expect(getBannerState(null)).toBeNull();
    expect(getBannerState(entitlements({ daysLeft: 20 }))).toBeNull();
    expect(getBannerState(entitlements({ daysLeft: 8 }))).toBeNull();
  });

  it("shows the days left of the free trial, whatever they are", () => {
    expect(getBannerState(entitlements({ daysLeft: 9, status: "TRIALING", trial: true }))).toEqual({ daysLeft: 9, kind: "trial" });
    expect(getBannerState(entitlements({ daysLeft: 14, status: "TRIALING", trial: true }))).toEqual({ daysLeft: 14, kind: "trial" });
  });

  it("warns that a paid subscription ends, from 7 days before", () => {
    expect(getBannerState(entitlements({ daysLeft: 7 }))).toEqual({ daysLeft: 7, kind: "expiring" });
    expect(getBannerState(entitlements({ daysLeft: 3 }))).toEqual({ daysLeft: 3, kind: "expiring" });
    expect(getBannerState(entitlements({ daysLeft: 1 }))).toEqual({ daysLeft: 1, kind: "expiring" });
  });

  it.each(["EXPIRED", "CANCELED", "NO_PLAN"] as const)("shows the read-only mode when the subscription is %s", (status) => {
    expect(getBannerState(entitlements({ daysLeft: 0, readOnly: true, status }))).toEqual({ kind: "readOnly", status });
  });

  it("puts the read-only mode before everything else, a trial that has ended included", () => {
    expect(getBannerState(entitlements({ daysLeft: 0, readOnly: true, status: "EXPIRED", trial: true }))).toEqual({ kind: "readOnly", status: "EXPIRED" });
  });

  it("offers to choose a plan during a trial and to renew when it ends or has ended", () => {
    expect(getBannerActionKind({ daysLeft: 9, kind: "trial" })).toBe("choose");
    expect(getBannerActionKind({ daysLeft: 3, kind: "expiring" })).toBe("renew");
    expect(getBannerActionKind({ kind: "readOnly", status: "EXPIRED" })).toBe("renew");
    expect(getBannerActionKind({ kind: "readOnly", status: "CANCELED" })).toBe("choose");
    expect(getBannerActionKind({ kind: "readOnly", status: "NO_PLAN" })).toBe("choose");
  });
});

describe("isPipelineLocked", () => {
  it("locks the chains outside the plan, never when every chain is open or nothing is known", () => {
    expect(isPipelineLocked(entitlements(), "cardio-seg-mri")).toBe(true);
    expect(isPipelineLocked(entitlements(), "brain")).toBe(false);
    expect(isPipelineLocked(entitlements({ quotas: { aiAnalysesPerMonth: 300, aiPipelines: null, maxDoctors: 1, maxPatients: null } }), "cardio-seg-mri")).toBe(false);
    expect(isPipelineLocked(null, "cardio-seg-mri")).toBe(false);
  });
});

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
  name: id,
  quotas,
});

const classification = ["brain", "pathology-breast", "cardio-ecg"];
const plans: SubscriptionPlan[] = [
  // Deliberately out of order: the plans are ranked by price.
  plan("DOCTOR_PREMIUM_AI", 9_900, { aiAnalysesPerMonth: 300, aiPipelines: null, maxDoctors: 1, maxPatients: null }),
  plan("DOCTOR_STARTER", 2_900, { aiAnalysesPerMonth: 20, aiPipelines: classification, maxDoctors: 1, maxPatients: 100 }),
  plan("DOCTOR_PRO", 5_900, { aiAnalysesPerMonth: 100, aiPipelines: classification, maxDoctors: 1, maxPatients: null }),
  plan("EST_CUSTOM", null, { aiAnalysesPerMonth: null, aiPipelines: null, maxDoctors: null, maxPatients: null }, true),
];

describe("findUpgradePlan: the plan above that gives what was missing", () => {
  it("offers, during a trial, the plan it was trying: Pro, not the cheaper Starter", () => {
    // 10 analyses for the whole trial reached: Starter (20) would do, but a
    // trial of the Pro plan upgrades to the Pro plan.
    const next = findUpgradePlan(plans, { planId: "DOCTOR_PRO", trial: true }, { kind: "quota", limit: 10, quota: "aiAnalysesPerMonth" });

    expect(next?.id).toBe("DOCTOR_PRO");
  });

  it("offers the next plan up to a paid plan that is full", () => {
    expect(findUpgradePlan(plans, { planId: "DOCTOR_STARTER", trial: false }, { kind: "quota", limit: 20, quota: "aiAnalysesPerMonth" })?.id).toBe("DOCTOR_PRO");
    expect(findUpgradePlan(plans, { planId: "DOCTOR_PRO", trial: false }, { kind: "quota", limit: 100, quota: "aiAnalysesPerMonth" })?.id).toBe("DOCTOR_PREMIUM_AI");
  });

  it("skips a plan that does not give more of the quota", () => {
    // Patients: Starter 100; Pro and Premium are unlimited.
    expect(findUpgradePlan(plans, { planId: "DOCTOR_STARTER", trial: false }, { kind: "quota", limit: 100, quota: "maxPatients" })?.id).toBe("DOCTOR_PRO");
    // Doctors: every doctor plan gives 1, nothing above helps.
    expect(findUpgradePlan(plans, { planId: "DOCTOR_STARTER", trial: false }, { kind: "quota", limit: 1, quota: "maxDoctors" })).toBeNull();
  });

  it("offers the plan that opens a chain: Premium for the segmentation", () => {
    expect(findUpgradePlan(plans, { planId: "DOCTOR_PRO", trial: false }, { kind: "pipeline", pipeline: "cardio-seg-mri" })?.id).toBe("DOCTOR_PREMIUM_AI");
    expect(findUpgradePlan(plans, { planId: "DOCTOR_STARTER", trial: false }, { kind: "pipeline", pipeline: "pathology-nuclei" })?.id).toBe("DOCTOR_PREMIUM_AI");
  });

  it("offers nothing above the top plan, and never a plan on quote", () => {
    expect(findUpgradePlan(plans, { planId: "DOCTOR_PREMIUM_AI", trial: false }, { kind: "quota", limit: 300, quota: "aiAnalysesPerMonth" })).toBeNull();
  });

  it("starts from the cheapest plan for an account that has none", () => {
    expect(findUpgradePlan(plans, { planId: null, trial: false }, { kind: "any" })?.id).toBe("DOCTOR_STARTER");
  });
});
