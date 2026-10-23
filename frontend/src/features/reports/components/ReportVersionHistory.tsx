import { GitCompareArrows } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type ReportVersion } from "../types/report.types";
import { ReportStatusBadge } from "./ReportStatusBadge";

type ReportVersionHistoryProps = {
  currentId: string;
  locale: Locale;
  onOpen: (id: string) => void;
  t: TranslationFunction;
  versions: ReportVersion[];
};

// Every version of the report, the latest first. A replaced version stays
// readable: opening it shows the report as it was finalized.
export function ReportVersionHistory({ currentId, locale, onOpen, t, versions }: ReportVersionHistoryProps) {
  const formatter = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { day: "2-digit", month: "short", year: "numeric" });
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><GitCompareArrows size={16} className="text-[var(--medical)]" aria-hidden="true" />{t("reports.versions.title")}</h3>
      <div className="mt-3 divide-y divide-[var(--line-soft)]">
        {[...versions].sort((a, b) => b.version - a.version).map((version) => (
          <article key={version.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div>
              <p className="clinical-figure text-xs font-semibold" dir="ltr">v{version.version}{version.number ? <span className="ms-2 font-normal text-[var(--text-muted)]">{version.number}</span> : null}</p>
              <p className="mt-1 text-[0.66rem] text-[var(--text-muted)]">{formatter.format(new Date(version.finalizedAt ?? version.createdAt))}</p>
              {version.supersededAt ? <p className="mt-1 text-[0.66rem] font-medium text-[var(--warning-ink)]">{t("reports.versions.replacedOn", { date: formatter.format(new Date(version.supersededAt)) })}</p> : null}
              {version.id === currentId ? <p className="mt-1 text-[0.66rem] font-semibold text-[var(--medical)]">{t("reports.versions.shown")}</p> : <button type="button" className="clinical-link mt-1 text-[0.66rem]" onClick={() => onOpen(version.id)}>{t("reports.versions.open")}</button>}
            </div>
            <ReportStatusBadge status={version.status} t={t} />
          </article>
        ))}
      </div>
    </section>
  );
}
