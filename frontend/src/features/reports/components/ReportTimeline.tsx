import { CircleCheck } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type ReportHistoryEntry } from "../types/report.types";

type ReportTimelineProps = {
  events?: ReportHistoryEntry[];
  isError: boolean;
  isLoading: boolean;
  locale: Locale;
  onRetry: () => void;
  t: TranslationFunction;
};

// Audit entries of GET /reports/:id/history, oldest first; shown latest first.
export function ReportTimeline({ events, isError, isLoading, locale, onRetry, t }: ReportTimelineProps) {
  const formatter = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "short", year: "numeric" });
  const label = (action: string) => {
    const key = `reports.history.actions.${action}`;
    const translated = t(key);
    return translated === key ? action : translated;
  };
  const ordered = events ? events.slice().reverse() : [];
  return (
    <div>
      {isLoading ? <div className="space-y-3" role="status" aria-busy="true" aria-label={t("reports.states.loading")}>{[0, 1, 2].map((row) => <span key={row} className="block h-8 animate-pulse rounded bg-[var(--surface-muted)]" aria-hidden="true" />)}</div> : null}
      {isError ? <p className="text-[0.72rem] text-[var(--danger-ink)]" role="alert">{t("reports.history.error")} <button type="button" className="clinical-link" onClick={onRetry}>{t("reports.actions.retry")}</button></p> : null}
      {events && !ordered.length ? <p className="text-[0.72rem] text-[var(--text-secondary)]">{t("reports.history.empty")}</p> : null}
      <ol className="space-y-0">
        {ordered.map((event, index) => (
          <li key={event.id} className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
            {index < ordered.length - 1 ? <span className="absolute start-[0.72rem] top-5 h-[calc(100%-0.5rem)] w-px bg-[var(--border)]" aria-hidden="true" /> : null}
            <span className="relative z-10 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--accent-line)] bg-[var(--surface)] text-[var(--medical)]"><CircleCheck size={12} aria-hidden="true" /></span>
            <div><time dateTime={event.createdAt} className="clinical-figure text-[0.66rem] font-semibold text-[var(--text-secondary)]">{formatter.format(new Date(event.createdAt))}</time><p className="mt-1 text-xs font-semibold">{label(event.action)}</p>{event.actorName ? <p className="mt-1 text-[0.66rem] text-[var(--text-muted)]">{event.actorName}</p> : null}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
