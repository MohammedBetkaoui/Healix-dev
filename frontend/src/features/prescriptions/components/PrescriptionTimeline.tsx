import { History } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type PrescriptionHistoryEntry } from "../types/prescription.types";
import { formatPrescriptionDate } from "../utils/prescription-format";

type PrescriptionTimelineProps = {
  events?: PrescriptionHistoryEntry[];
  isError: boolean;
  isLoading: boolean;
  locale: Locale;
  onRetry: () => void;
  t: TranslationFunction;
};

// Audit entries of GET /prescriptions/:id/history, oldest first; shown latest first.
export function PrescriptionTimeline({ events, isError, isLoading, locale, onRetry, t }: PrescriptionTimelineProps) {
  const label = (action: string) => {
    const key = `prescriptions.history.actions.${action}`;
    const translated = t(key);
    return translated === key ? action : translated;
  };
  const ordered = events ? events.slice().reverse() : [];
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><History size={16} className="text-[var(--medical)]" aria-hidden="true" />{t("prescriptions.detail.history")}</h3>
      {isLoading ? <div className="mt-4 space-y-3" role="status" aria-busy="true" aria-label={t("prescriptions.states.loading")}>{[0, 1, 2].map((row) => <span key={row} className="block h-8 animate-pulse rounded bg-[var(--surface-muted)]" aria-hidden="true" />)}</div> : null}
      {isError ? <p className="mt-4 text-[.72rem] text-[var(--danger-ink)]" role="alert">{t("prescriptions.history.error")} <button type="button" className="clinical-link" onClick={onRetry}>{t("prescriptions.actions.retry")}</button></p> : null}
      {events && ordered.length === 0 ? <p className="mt-4 text-[.72rem] text-[var(--text-secondary)]">{t("prescriptions.history.empty")}</p> : null}
      <ol className="mt-4 space-y-0">
        {ordered.map((event, index) => (
          <li key={event.id} className="relative grid grid-cols-[1rem_1fr] gap-3 pb-5 last:pb-0">
            {index < ordered.length - 1 ? <span className="absolute inset-y-3 start-[7px] w-px bg-[var(--line)]" aria-hidden="true" /> : null}
            <span className="relative z-10 mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)] bg-[var(--medical)] ring-1 ring-[var(--medical)]" aria-hidden="true" />
            <div><time className="text-[.66rem] font-medium text-[var(--text-secondary)]" dateTime={event.createdAt}>{formatPrescriptionDate(event.createdAt, locale, true)}</time><p className="mt-0.5 text-[.76rem] font-semibold">{label(event.action)}</p>{event.actorName ? <p className="mt-0.5 text-[.66rem] text-[var(--text-muted)]">{event.actorName}</p> : null}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
