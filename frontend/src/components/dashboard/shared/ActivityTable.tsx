import { Clock3 } from "lucide-react";
import Link from "next/link";

import { type Locale } from "@/i18n";
import {
  analysisHref,
  decisionBadge,
  patientName,
  type RoleBase,
} from "@/features/dashboard/dashboard-overview";
import { type DashboardRecentAnalysis } from "@/features/dashboard/dashboard.types";
import type { TranslationFunction } from "@/lib/i18n";

import { StatusBadge } from "./StatusBadge";

// The latest AI analyses of the workspace, each linked to its result.
export function ActivityTable({ analyses, roleBase, locale, t, timeZone }: {
  analyses: readonly DashboardRecentAnalysis[];
  roleBase: RoleBase;
  locale: Locale;
  t: TranslationFunction;
  /** The overview's time zone, the one its daily figures are counted in. */
  timeZone: string;
}) {
  const title = t("dashboard.clinical.recent.title");
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    timeZone,
    year: "numeric",
  });

  return (
    <section className="clinical-table min-w-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]/94 shadow-sm">
      <div className="border-b border-[var(--line-soft)] px-6 py-5">
        <h2 className="font-[var(--font-auth-display)] text-[1.2rem] font-medium text-[var(--ink)]">{title}</h2>
        <p className="mt-1 text-xs text-[var(--ink-soft)]">{t("dashboard.clinical.recent.subtitle")}</p>
      </div>
      {analyses.length === 0 ? (
        <p className="px-6 py-5 text-sm text-[var(--ink-soft)]">{t("dashboard.clinical.recent.empty")}</p>
      ) : (
        <div className="overflow-x-auto" role="region" aria-label={title} tabIndex={0}>
          <table className="min-w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="text-start font-[family-name:var(--font-auth-mono)] text-[0.66rem] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                <th scope="col" className="px-6 py-4 font-medium">{t("dashboard.clinical.recent.columns.date")}</th>
                <th scope="col" className="px-6 py-4 font-medium">{t("dashboard.clinical.recent.columns.patient")}</th>
                <th scope="col" className="px-6 py-4 font-medium">{t("dashboard.clinical.recent.columns.modelClass")}</th>
                <th scope="col" className="px-6 py-4 font-medium">{t("dashboard.clinical.recent.columns.decision")}</th>
                <th scope="col" className="px-6 py-4 font-medium"><span className="sr-only">{t("dashboard.clinical.recent.columns.result")}</span></th>
              </tr>
            </thead>
            <tbody>
              {analyses.map((run) => {
                const badge = decisionBadge(run);
                const name = patientName(run.patient, locale);
                const date = dateFormat.format(new Date(run.createdAt));
                return (
                  <tr key={run.id} className="border-t border-[var(--line-soft)] text-[var(--ink-soft)] transition hover:bg-[var(--panel-soft)]/70">
                    <td className="clinical-figure whitespace-nowrap px-6 py-4">{date}</td>
                    <td className="px-6 py-4 font-medium text-[var(--ink)]">{name}</td>
                    <td className="px-6 py-4">{run.modelLabel ? t(`aiAnalyses.classes.${run.modelLabel}`) : t("dashboard.clinical.recent.noClass")}</td>
                    <td className="min-w-[140px] px-6 py-4">
                      <span className="inline-flex items-center gap-1.5">
                        {badge.pending ? <Clock3 size={14} strokeWidth={1.8} aria-hidden="true" className="text-[var(--accent-dark)]" /> : null}
                        <StatusBadge label={t(badge.key)} tone={badge.tone} />
                      </span>
                    </td>
                    <td className="px-6 py-4 text-end">
                      <Link
                        href={analysisHref(roleBase, run)}
                        className="inline-flex min-h-10 items-center px-3 text-xs font-medium text-[var(--accent-dark)]"
                        aria-label={t("dashboard.clinical.recent.openFor", { date, patient: name })}
                      >
                        {t("dashboard.clinical.recent.open")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
