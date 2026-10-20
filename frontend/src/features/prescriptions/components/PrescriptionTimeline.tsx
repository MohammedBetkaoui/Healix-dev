import { History } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { localize } from "../prescriptions.copy";
import { type PrescriptionAuditEvent } from "../types/prescription.types";
import { formatPrescriptionDate } from "../utils/prescription-format";

export function PrescriptionTimeline({ events, locale, t }: { events: PrescriptionAuditEvent[]; locale: Locale; t: TranslationFunction }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><History size={16} className="text-[var(--medical)]" aria-hidden="true" />{t("prescriptions.detail.history")}</h3>
      <ol className="mt-4 space-y-0">
        {events.slice().reverse().map((event, index) => (
          <li key={event.id} className="relative grid grid-cols-[1rem_1fr] gap-3 pb-5 last:pb-0">
            {index < events.length - 1 ? <span className="absolute inset-y-3 start-[7px] w-px bg-[var(--line)]" aria-hidden="true" /> : null}
            <span className="relative z-10 mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)] bg-[var(--medical)] ring-1 ring-[var(--medical)]" aria-hidden="true" />
            <div><time className="text-[.66rem] font-medium text-[var(--text-secondary)]" dateTime={event.at}>{formatPrescriptionDate(event.at, locale, true)}</time><p className="mt-0.5 text-[.76rem] font-semibold">{localize(event.label, locale)}</p><p className="mt-0.5 text-[.66rem] text-[var(--text-muted)]">{event.actor}</p></div>
          </li>
        ))}
      </ol>
    </section>
  );
}

