import { CircleCheck, Clock3 } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type ClinicalReport } from "../types/report.types";

export function ReportTimeline({ locale, report, t }: { locale: Locale; report: ClinicalReport; t: TranslationFunction }) {
  const formatter = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "short", year: "numeric" });
  return (
    <div>
      <div className="mb-4 flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-muted)] p-3"><Clock3 size={16} className="mt-0.5 shrink-0 text-[var(--medical)]" aria-hidden="true" /><p className="text-[0.7rem] leading-5 text-[var(--text-secondary)]">{t(report.isDemo ? "reports.timeline.mockNotice" : "reports.timeline.backendNotice")}</p></div>
      <ol className="space-y-0">
        {[...report.timeline].sort((a, b) => b.at.localeCompare(a.at)).map((event, index, events) => (
          <li key={event.id} className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
            {index < events.length - 1 ? <span className="absolute start-[0.72rem] top-5 h-[calc(100%-0.5rem)] w-px bg-[var(--border)]" aria-hidden="true" /> : null}
            <span className="relative z-10 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--accent-line)] bg-[var(--surface)] text-[var(--medical)]"><CircleCheck size={12} aria-hidden="true" /></span>
            <div><time dateTime={event.at} className="clinical-figure text-[0.66rem] font-semibold text-[var(--text-secondary)]">{formatter.format(new Date(event.at))}</time><p className="mt-1 text-xs font-semibold">{event.detail[locale]}</p><p className="mt-1 text-[0.66rem] text-[var(--text-muted)]">{event.actor}</p></div>
          </li>
        ))}
      </ol>
    </div>
  );
}

