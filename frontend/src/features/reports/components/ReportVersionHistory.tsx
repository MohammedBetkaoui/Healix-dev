import { GitCompareArrows } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type ClinicalReport } from "../types/report.types";
import { ReportStatusBadge } from "./ReportStatusBadge";

export function ReportVersionHistory({ locale, report, t }: { locale: Locale; report: ClinicalReport; t: TranslationFunction }) {
  const formatter = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { day: "2-digit", month: "short", year: "numeric" });
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><GitCompareArrows size={16} className="text-[var(--medical)]" aria-hidden="true" />{t("reports.versions.title")}</h3>
      <div className="mt-3 divide-y divide-[var(--line-soft)]">{[...report.versions].sort((a, b) => b.version - a.version).map((version) => <article key={version.version} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="clinical-figure text-xs font-semibold" dir="ltr">v{version.version}</p><p className="mt-1 text-[0.66rem] text-[var(--text-muted)]">{formatter.format(new Date(version.issuedAt))}</p>{version.replacesVersion ? <p className="mt-1 text-[0.66rem] font-medium text-[var(--warning-ink)]">{t("reports.common.replaces", { version: version.replacesVersion })}</p> : null}{version.note ? <p className="mt-1 text-[0.66rem] text-[var(--text-secondary)]">{version.note[locale]}</p> : null}</div><ReportStatusBadge status={version.status} t={t} /></article>)}</div>
    </section>
  );
}

