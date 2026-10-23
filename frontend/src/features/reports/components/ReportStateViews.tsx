import { AlertTriangle, RotateCcw } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

// The table while the first page loads: same frame, grey rows.
export function ReportsListSkeleton({ t }: { t: TranslationFunction }) {
  return (
    <section className="divide-y divide-[var(--line-soft)] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]" role="status" aria-busy="true" aria-label={t("reports.states.loading")}>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 p-4">
          <span className="h-4 w-28 animate-pulse rounded bg-[var(--surface-muted)]" aria-hidden="true" />
          <span className="h-4 flex-1 animate-pulse rounded bg-[var(--surface-muted)]" aria-hidden="true" />
          <span className="hidden h-4 w-24 animate-pulse rounded bg-[var(--surface-muted)] md:block" aria-hidden="true" />
          <span className="h-6 w-20 animate-pulse rounded-full bg-[var(--surface-muted)]" aria-hidden="true" />
        </div>
      ))}
    </section>
  );
}

// A failed call: what went wrong (see utils/report-errors) and a retry.
export function ReportErrorState({ errorKey, onRetry, t }: { errorKey: string; onRetry: () => void; t: TranslationFunction }) {
  return (
    <section className="flex flex-col items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center" role="alert">
      <AlertTriangle className="text-[var(--danger-ink)]" size={28} strokeWidth={1.6} aria-hidden="true" />
      <h2 className="mt-3 text-sm font-semibold">{t("reports.states.errorTitle")}</h2>
      <p className="mt-1 max-w-md text-xs text-[var(--text-secondary)]">{t(`reports.errors.${errorKey}`)}</p>
      <button type="button" className="clinical-button mt-4" onClick={onRetry}><RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" />{t("reports.actions.retry")}</button>
    </section>
  );
}

// A failed action inside a drawer: stays visible until the next attempt.
export function ReportActionError({ errorKey, t }: { errorKey: string; t: TranslationFunction }) {
  return (
    <p className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2 text-[0.72rem] text-[var(--danger-ink)]" role="alert">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      {t(`reports.errors.${errorKey}`)}
    </p>
  );
}

export function ReportsBlockSkeleton({ rows = 3, t }: { rows?: number; t: TranslationFunction }) {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label={t("reports.states.loading")}>
      {Array.from({ length: rows }, (_, index) => <span key={index} className="block h-28 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-muted)]" aria-hidden="true" />)}
    </div>
  );
}
