import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { dictionaries, locales } from "@/i18n";
import { translate } from "@/lib/i18n";

import { aiDecisionLabels } from "../ai-analyses/run-decision";
import {
  ACTIVITY_SERIES,
  APPOINTMENT_FLOW_ORDER,
  DASHBOARD_PERIODS,
  decisionBadge,
} from "./dashboard-overview";
import { type DashboardAttentionKind, type DashboardRecentAnalysis } from "./dashboard.types";

const attentionKinds: DashboardAttentionKind[] = [
  "AI_PENDING_OVER_24H",
  "APPOINTMENTS_UNCONFIRMED_TODAY",
  "AI_CONSENT_MISSING",
  "URGENT_MESSAGES_UNACKED",
];
const runStatuses: DashboardRecentAnalysis["status"][] = ["RUNNING", "SUCCEEDED", "FAILED", "REJECTED_INPUT"];
const decisions: DashboardRecentAnalysis["decision"][] = [null, "VALIDATED", "CORRECTED", "REJECTED"];

// Keys the dashboard widgets build: t(`dashboard.clinical.queue.kinds.${kind}`)…
function builtKeys() {
  const keys = new Set<string>();
  for (const kind of attentionKinds) keys.add(`dashboard.clinical.queue.kinds.${kind}`);
  for (const status of APPOINTMENT_FLOW_ORDER) keys.add(`dashboard.clinical.flow.statuses.${status}`);
  for (const series of ACTIVITY_SERIES) keys.add(`dashboard.clinical.chart.${series}`);
  for (const days of DASHBOARD_PERIODS) keys.add(`dashboard.clinical.chart.days${days}`);
  for (const decided of ["validated", "corrected", "rejected"]) keys.add(`dashboard.clinical.ai.${decided}`);
  for (const status of runStatuses) {
    for (const decision of decisions) keys.add(decisionBadge({ decision, status }).key);
  }
  for (const label of aiDecisionLabels) keys.add(`aiAnalyses.classes.${label}`);
  return [...keys];
}

// Literal keys written in the dashboard components: t("dashboard.…").
function componentKeys() {
  const directory = join(__dirname, "../../components/dashboard");
  return readdirSync(directory, { encoding: "utf8", recursive: true })
    .filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"))
    .flatMap((file) =>
      [...readFileSync(join(directory, file), "utf8").matchAll(/\b(?:t\(|labelKey: )"((?:dashboard|aiAnalyses|common)\.[\w.-]+)"/g)].map(
        (match) => match[1],
      ),
    );
}

describe("dashboard i18n keys", () => {
  it("finds the keys to check", () => {
    expect(builtKeys().length).toBeGreaterThan(20);
    expect(componentKeys().length).toBeGreaterThan(40);
  });

  it.each(locales)("translates every key of the dashboard widgets in %s", (locale) => {
    const keys = [...new Set([...builtKeys(), ...componentKeys()])];
    // translate() returns the key itself when it is missing.
    const missing = keys.filter((key) => {
      const value = translate(dictionaries[locale], key);
      return value === key || value.trim() === "";
    });
    expect(missing).toEqual([]);
  });

  it.each(locales)("keeps no demonstration figure in the dashboard texts (%s)", (locale) => {
    const texts = JSON.stringify(dictionaries[locale].dashboard);
    expect(texts).not.toMatch(/\+\d+\s*%|\+\d+ ce mois|démo \d|exemple \d/i);
  });
});
