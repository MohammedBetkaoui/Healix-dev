import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { renderToStaticMarkup } from "react-dom/server";

import { adminRoutes } from "@/config/admin-routes";
import { doctorNavSections, establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { dictionaries } from "@/i18n";
import {
  type ModelMonitoring,
  type ModelMonitoringEntry,
  type MonthlyModelStats,
} from "@/features/ai-analyses/model-monitoring";
import { translate } from "@/lib/i18n";

import { ModelMonitoringBoard } from "./ModelMonitoringBoard";
import { ModelMonitoringContent, MonitoringPeriodSelect } from "./ModelMonitoringContent";

const fr = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);
const ar = (key: string, params?: Record<string, string | number>) => translate(dictionaries.ar, key, params);
const escaped = (text: string) => text.replaceAll("'", "&#x27;").replaceAll("’", "’");

const BRAIN = "brain-efficientnetb4-tumor-classification";
const NUCLEI = "pathology-unet-pannuke-segmentation";
const ECG = "cardio-ecg-resnet1d-ptbxl-superdiagnostic";

const month = (monthKey: string, overrides: Partial<MonthlyModelStats> = {}): MonthlyModelStats => ({
  corrected: 2,
  correctionRate: 0.1,
  decided: 20,
  drift: { alert: false, baselineDecisions: 60, baselineRate: 0.1, deltaPoints: 0 },
  failed: 1,
  medianDecisionMs: 600_000,
  medianInferenceMs: 2_340,
  month: monthKey,
  rejected: 0,
  rejectedInput: 0,
  runs: 21,
  succeeded: 20,
  validated: 18,
  ...overrides,
});

const drifting = month("2026-10", {
  corrected: 6,
  correctionRate: 0.24,
  drift: { alert: true, baselineDecisions: 60, baselineRate: 0.1, deltaPoints: 14 },
  validated: 19,
});

const brain: ModelMonitoringEntry = {
  alert: { baselineRate: 0.1, deltaPoints: 14, month: "2026-10", rate: 0.24 },
  correctionApplicable: true,
  matrix: {
    counts: [[30, 1, 2, 0, 1], [0, 25, 0, 0, 0], [3, 0, 40, 0, 0], [0, 0, 0, 12, 0]],
    modelLabels: ["glioma", "meningioma", "notumor", "pituitary"],
    retainedLabels: ["glioma", "meningioma", "notumor", "pituitary", "other"],
  },
  modelId: BRAIN,
  months: [month("2026-08"), month("2026-09"), drifting],
  pipeline: "brain",
};

const nuclei: ModelMonitoringEntry = {
  alert: null,
  correctionApplicable: false,
  matrix: null,
  modelId: NUCLEI,
  months: [month("2026-10", { corrected: 0, correctionRate: null, rejected: 4, validated: 16 })],
  pipeline: "pathology-nuclei",
};

const ecg: ModelMonitoringEntry = {
  alert: null,
  correctionApplicable: true,
  matrix: null,
  modelId: ECG,
  months: [month("2026-10")],
  pipeline: "cardio-ecg",
};

const data = (models: ModelMonitoringEntry[]): ModelMonitoring => ({
  models,
  period: { from: "2025-10-31T23:00:00.000Z", to: "2026-10-24T10:00:00.000Z" },
  thresholds: { baselineMonths: 3, driftPoints: 10, minDecisions: 20 },
  timeZone: "Africa/Algiers",
});

const render = (board: ModelMonitoring, scope: "global" | "workspace" = "workspace", t = fr) =>
  renderToStaticMarkup(<ModelMonitoringBoard data={board} locale={t === fr ? "fr" : "ar"} scope={scope} t={t} />);

describe("the monitoring board", () => {
  it("raises an alert naming the model, the month, the rate and the gap", () => {
    const html = render(data([brain]));

    expect(html).toContain('role="alert"');
    expect(html).toContain(fr("aiAnalyses.monitoring.alert.title"));
    expect(html).toMatch(/EfficientNetB4 : taux de correction de octobre 2026 à 24\s?%, contre 10\s?% sur les 3 mois précédents \(\+14 points\)\./);
  });

  it("raises none without a drift", () => {
    const html = render(data([{ ...brain, alert: null, months: brain.months.slice(0, 2) }]));

    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain(fr("aiAnalyses.monitoring.alert.title"));
  });

  it("badges each model: the alert, or why there is none", () => {
    const html = render(data([brain, nuclei, ecg]));

    expect(html).toContain('data-status="alert"');
    expect(html).toContain('data-status="map"');
    expect(html).toContain('data-status="stable"');
    expect(html).toContain(fr("aiAnalyses.monitoring.model.status.map"));
  });

  it("draws the curve of the models that can be corrected, with an accessible name and summary", () => {
    const html = render(data([brain, nuclei, ecg]));

    expect(html).toContain('role="img"');
    expect(html).toContain(`<title`);
    // Two curves: the brain model and the ECG; not the nuclei map.
    expect(html.match(/data-series="/g)).toHaveLength(2);
    expect(html).not.toContain(`data-series="pathology-nuclei`);
    expect(html).toContain(escaped(fr("aiAnalyses.monitoring.chart.title")));
    expect(html).toMatch(/Courbe du taux de correction de 2 modèle\(s\), sur 3 mois, de 0 % à 30\s?%/);
  });

  it("circles the drift month on the curve, and names it in its tooltip", () => {
    const html = render(data([brain]));

    expect(html.match(/data-drift="true"/g)?.length).toBeGreaterThanOrEqual(1);
    // "EfficientNetB4 · octobre 2026 : 24 % (6 corrigées sur 25) · Dérive"
    expect(html).toMatch(/EfficientNetB4 · octobre 2026 : 24\s?% \(6 corrigées sur 25\) · Dérive/);
  });

  it("lists the months of a model in a table, the latest first, the drift month highlighted", () => {
    const html = render(data([brain]));
    const rows = [...html.matchAll(/<th scope="row"[^>]*>([^<]+)<\/th>/g)].map((match) => match[1]).filter((text) => /\d{4}/.test(text));

    expect(rows.map((text) => text.replace(/\s/g, " "))).toEqual(["octobre 2026", "septembre 2026", "août 2026"]);
    expect(html).toContain('<tr data-drift="true"');
    expect(html).toContain(fr("aiAnalyses.monitoring.table.drift"));
    // The month's figures: runs, outcomes, decisions, rate, medians.
    for (const column of ["runs", "succeeded", "failed", "rejectedInput", "decided", "validated", "corrected", "rejected", "correctionRate", "decisionDelay", "inference"]) {
      expect(html).toContain(escaped(fr(`aiAnalyses.monitoring.table.${column}`)));
    }
    expect(html).toContain("10 min");
    expect(html).toContain("2,3 s");
  });

  it("shows the gap of the month against the months before it", () => {
    const html = render(data([brain]));

    expect(html).toMatch(/\+14 pts vs 10\s?%/);
  });

  it("crosses what the model said with what the physician kept, the diagonal marked as agreement", () => {
    const html = render(data([brain]));

    expect(html).toContain(fr("aiAnalyses.monitoring.matrix.title"));
    expect(html).toContain(escaped(fr("aiAnalyses.monitoring.matrix.modelClass")));
    for (const label of ["glioma", "meningioma", "notumor", "pituitary", "other"]) {
      expect(html).toContain(escaped(fr(`aiAnalyses.classes.${label}`)));
    }
    // 4 cells on the diagonal.
    expect(html.match(new RegExp(`\\(${fr("aiAnalyses.monitoring.matrix.agreementCell")}\\)`, "g"))).toHaveLength(4);
  });

  it("has no matrix for the ECG and the maps, and says why for the ECG", () => {
    const html = render(data([nuclei, ecg]));

    expect(html).not.toContain(fr("aiAnalyses.monitoring.matrix.title"));
    expect(html).toContain(escaped(fr("aiAnalyses.monitoring.matrix.notApplicable")));
  });

  it("says that a map is validated or rejected, never corrected, and shows its rejections", () => {
    const html = render(data([nuclei]));

    expect(html).toContain(escaped(fr("aiAnalyses.monitoring.howTo.maps")));
    expect(html).toContain(escaped(fr("aiAnalyses.monitoring.model.status.map")));
    expect(html).toContain("—");
  });

  it("says the matrix has no decision yet instead of an empty grid", () => {
    const empty = { ...brain, alert: null, matrix: { ...brain.matrix!, counts: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]] } };

    expect(render(data([empty]))).toContain(fr("aiAnalyses.monitoring.matrix.none"));
  });

  it("says how to read it, for the workspace or for everybody, with the thresholds of the API", () => {
    const mine = render(data([brain]), "workspace");
    const all = render(data([brain]), "global");

    expect(mine).toContain(escaped(fr("aiAnalyses.monitoring.howTo.scope.workspace")));
    expect(all).toContain(escaped(fr("aiAnalyses.monitoring.howTo.scope.global")));
    expect(mine).toContain("plus de 10 points la moyenne des 3 mois précédents, avec au moins 20 décisions");
  });

  it("shows a model whose runs failed before any answer under its own name", () => {
    const html = render(data([{ ...brain, alert: null, matrix: null, modelId: null, months: [month("2026-10", { corrected: 0, correctionRate: null, validated: 0 })] }]));

    expect(html).toContain(escaped(fr("aiAnalyses.monitoring.unknownModel")));
  });

  it("says there is nothing yet when there is no run", () => {
    const html = render(data([]));

    expect(html).toContain(escaped(fr("aiAnalyses.monitoring.empty")));
    expect(html).not.toContain('role="img"');
  });

  it("explains an empty curve when no decision on a class exists yet", () => {
    const html = render(data([{ ...brain, alert: null, matrix: null, months: [month("2026-10", { corrected: 0, correctionRate: null, validated: 0 })] }]));

    expect(html).toContain(escaped(fr("aiAnalyses.monitoring.chart.empty")));
  });

  it("speaks Arabic as well, with no key left bare", () => {
    const html = render(data([brain, nuclei, ecg]), "workspace", ar);

    expect(html).toContain(ar("aiAnalyses.monitoring.alert.title"));
    expect(html).toContain(ar("aiAnalyses.monitoring.matrix.title"));
    expect(html).toContain(ar("aiAnalyses.monitoring.table.correctionRate"));
    expect(html).not.toContain("aiAnalyses.monitoring");
  });
});

describe("the content of the page", () => {
  const axiosError = (status: number, body: unknown) => {
    const config = { headers: new AxiosHeaders() };
    const response: AxiosResponse = { config, data: body, headers: {}, status, statusText: "" };
    return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, {}, response);
  };
  const content = (query: Partial<Parameters<typeof ModelMonitoringContent>[0]["query"]>, accountType?: "DOCTOR" | "ESTABLISHMENT") =>
    renderToStaticMarkup(
      <ModelMonitoringContent
        accountType={accountType}
        locale="fr"
        query={{ data: undefined, error: null, isError: false, isLoading: false, ...query }}
        scope="workspace"
        t={fr}
      />,
    );

  it("shows a loading state that screen readers announce", () => {
    const html = content({ isLoading: true });

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(fr("aiAnalyses.monitoring.loading"));
    expect(html).toContain("animate-pulse");
  });

  it("shows a failure as an alert", () => {
    const html = content({ error: axiosError(500, {}), isError: true });

    expect(html).toContain('role="alert"');
    expect(html).toContain(fr("aiAnalyses.monitoring.error"));
  });

  it("asks an account that is not verified yet to get verified, rather than showing an error", () => {
    const html = content({ error: axiosError(403, { code: "VERIFICATION_REQUIRED" }), isError: true }, "DOCTOR");

    expect(html).not.toContain(fr("aiAnalyses.monitoring.error"));
    expect(html).toContain(escaped(fr("common.verificationRequired.description")));
  });

  it("shows the board once the figures are there", () => {
    expect(content({ data: data([brain]) })).toContain(fr("aiAnalyses.monitoring.chart.title"));
  });

  it("offers 6, 12 and 24 months", () => {
    const html = renderToStaticMarkup(<MonitoringPeriodSelect months={12} onChange={jest.fn()} t={fr} />);

    expect(html).toContain(fr("aiAnalyses.monitoring.period.label"));
    for (const months of [6, 12, 24]) expect(html).toContain(fr(`aiAnalyses.monitoring.period.${months}`));
    expect(html).toMatch(/<option value="12" selected/);
  });
});

describe("how to get there", () => {
  const items = (sections: typeof doctorNavSections) => sections.flatMap((section) => section.items);

  it("links the monitoring from the AI menu of a doctor, after the tracking", () => {
    const ai = doctorNavSections.find((section) => section.key === "ai")!;

    expect(ai.items.map((item) => item.key)).toEqual(["analyses", "aiTracking", "aiMonitoring", "reports"]);
    expect(items(doctorNavSections).find((item) => item.key === "aiMonitoring")).toMatchObject({ href: "/doctor/ai-analyses/monitoring", labelKey: "dashboard.clinical.nav.aiMonitoring" });
  });

  it("links it from the AI menu of an establishment", () => {
    expect(items(establishmentNavSections).find((item) => item.key === "aiMonitoring")).toMatchObject({ href: "/establishment/ai-analyses/monitoring" });
  });

  it("has the label of the menu in both languages", () => {
    expect(fr("dashboard.clinical.nav.aiMonitoring")).toBe("Suivi des modèles");
    expect(ar("dashboard.clinical.nav.aiMonitoring")).not.toBe("dashboard.clinical.nav.aiMonitoring");
  });

  it("has its route and its menu label in the back-office", () => {
    expect(adminRoutes.aiMonitoring).toMatch(/\/ai-monitoring$/);
    expect(fr("admin.layout.nav.aiMonitoring")).toBe("Suivi des modèles IA");
    expect(ar("admin.layout.nav.aiMonitoring")).not.toBe("admin.layout.nav.aiMonitoring");
    expect(fr("admin.aiMonitoring.page.title")).toBeTruthy();
  });
});
