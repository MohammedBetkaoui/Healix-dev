import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries } from "@/i18n";
import { type Entitlements } from "@/features/subscriptions/types/entitlements.types";
import { translate } from "@/lib/i18n";

import { UsageGauges } from "./UsageGauges";

const t = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);

const entitlements = (overrides: Partial<Entitlements> = {}): Entitlements => ({
  canManage: true,
  daysLeft: 20,
  expiresAt: "2026-11-15T12:00:00.000Z",
  plan: { code: "EST_BASIC_CLINIC", custom: false, id: "plan-est", name: "Basic Clinic" },
  quotas: { aiAnalysesPerMonth: 100, aiPipelines: null, maxDoctors: 5, maxPatients: 500 },
  readOnly: false,
  status: "ACTIVE",
  trial: false,
  usage: { aiAnalysesThisMonth: 0, doctors: 1, patients: 0 },
  ...overrides,
});

const render = (data: Entitlements) => renderToStaticMarkup(<UsageGauges entitlements={data} t={t} />);

// The tone of each gauge, in the order of the page: AI, patients, doctors.
const tones = (html: string) => [...html.matchAll(/data-tone="(\w+)"/g)].map((match) => match[1]);

describe("UsageGauges", () => {
  it("shows the usage of the AI analyses, the patients and the doctors out of their limits", () => {
    const html = render(entitlements({ usage: { aiAnalysesThisMonth: 42, doctors: 3, patients: 120 } }));

    expect(html).toContain(t("subscription.usage.labels.aiAnalysesPerMonth"));
    expect(html).toContain(t("subscription.usage.labels.maxPatients"));
    expect(html).toContain(t("subscription.usage.labels.maxDoctors"));
    expect(html).toContain("42 / 100");
    expect(html).toContain("120 / 500");
    expect(html).toContain("3 / 5");
    expect(tones(html)).toEqual(["ok", "ok", "ok"]);
  });

  it("stays green up to 79 %, turns orange at 80 % and red at 100 %", () => {
    // AI 79/100, patients 400/500 (80 %), doctors 5/5 (100 %).
    const html = render(entitlements({ usage: { aiAnalysesThisMonth: 79, doctors: 5, patients: 400 } }));

    expect(tones(html)).toEqual(["ok", "warning", "danger"]);
    expect(html).toContain('style="width:79%"');
    expect(html).toContain('style="width:80%"');
    expect(html).toContain('style="width:100%"');
    expect(html).toContain(t("subscription.usage.tone.warning"));
    expect(html).toContain(t("subscription.usage.tone.danger"));
    // The bars take the colour of their state.
    expect(html).toContain("bg-[var(--warning)]");
    expect(html).toContain("bg-[var(--danger)]");
  });

  it("shows exactly the quota reached in red: the usage never exceeds the bar", () => {
    const html = render(entitlements({ usage: { aiAnalysesThisMonth: 100, doctors: 0, patients: 0 } }));

    expect(tones(html)).toEqual(["danger", "ok", "ok"]);
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('aria-valuemax="100"');
  });

  it("shows an unlimited quota as a count, without a bar", () => {
    const html = render(entitlements({ quotas: { aiAnalysesPerMonth: 100, aiPipelines: null, maxDoctors: 5, maxPatients: null }, usage: { aiAnalysesThisMonth: 1, doctors: 1, patients: 2_345 } }));

    expect(html).toContain("2345 · illimité");
    expect(tones(html)).toEqual(["ok", "unlimited", "ok"]);
    expect(html.match(/role="progressbar"/g)).toHaveLength(2);
  });

  it("counts the AI analyses over the whole trial during a trial", () => {
    const html = render(entitlements({ quotas: { aiAnalysesPerMonth: 10, aiPipelines: null, maxDoctors: 5, maxPatients: 500 }, status: "TRIALING", trial: true, usage: { aiAnalysesThisMonth: 10, doctors: 1, patients: 0 } }));

    expect(html).toContain(t("subscription.usage.labels.aiAnalysesTrial").replaceAll("'", "&#x27;"));
    expect(html).toContain(t("subscription.usage.captionTrial").replaceAll("'", "&#x27;"));
    expect(html).toContain("10 / 10");
    expect(tones(html)[0]).toBe("danger");
  });

  it("leaves the doctors gauge out for a doctor in private practice, who is the only doctor of their plan", () => {
    const html = renderToStaticMarkup(
      <UsageGauges entitlements={entitlements({ quotas: { aiAnalysesPerMonth: 100, aiPipelines: null, maxDoctors: 1, maxPatients: null }, usage: { aiAnalysesThisMonth: 0, doctors: 1, patients: 3 } })} showDoctors={false} t={t} />,
    );

    expect(html).not.toContain(t("subscription.usage.labels.maxDoctors"));
    expect(html).toContain(t("subscription.usage.labels.aiAnalysesPerMonth"));
    expect(html).toContain(t("subscription.usage.labels.maxPatients"));
    // No red "quota reached" for 1 doctor out of 1.
    expect(tones(html)).toEqual(["ok", "unlimited"]);
    expect(html).not.toContain(t("subscription.usage.tone.danger"));
  });

  it("shows the doctors gauge by default, for an establishment", () => {
    expect(tones(render(entitlements()))).toHaveLength(3);
  });

  it("says which AI models the plan includes", () => {
    expect(render(entitlements())).toContain(t("subscription.usage.pipelines.all"));
    expect(render(entitlements({ quotas: { aiAnalysesPerMonth: 100, aiPipelines: ["brain"], maxDoctors: 1, maxPatients: null } }))).toContain(t("subscription.usage.pipelines.limited"));
  });
});
