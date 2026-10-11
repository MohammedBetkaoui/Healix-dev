import { ArrowRight, BrainCircuit, CalendarClock, CircleCheck, FileWarning } from "lucide-react";

import { type AttentionLink } from "@/features/dashboard/dashboard-overview";
import { type DashboardAttentionKind } from "@/features/dashboard/dashboard.types";
import type { TranslationFunction } from "@/lib/i18n";

import { WorkspaceLink as Link } from "../layout/WorkspaceLink";

const icons: Record<DashboardAttentionKind, typeof BrainCircuit> = {
  AI_CONSENT_MISSING: FileWarning,
  AI_PENDING_OVER_24H: BrainCircuit,
  APPOINTMENTS_UNCONFIRMED_TODAY: CalendarClock,
};

// What needs someone's attention now, each with the page where it is handled.
export function AttentionQueue({ items, t, formatNumber }: {
  items: readonly AttentionLink[];
  t: TranslationFunction;
  formatNumber: (value: number) => string;
}) {
  return (
    <section className="surface-clinical" aria-labelledby="attention-heading">
      <div className="clinical-section-heading">
        <div><h2 id="attention-heading">{t("dashboard.clinical.queue.title")}</h2><p className="clinical-caption mt-1">{t("dashboard.clinical.queue.subtitle")}</p></div>
      </div>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 px-5 pb-5 text-sm text-[var(--text-secondary)]">
          <CircleCheck size={17} strokeWidth={1.8} aria-hidden="true" className="text-[var(--success-ink)]" />
          {t("dashboard.clinical.queue.empty")}
        </p>
      ) : (
        <ul className="attention-list">
          {items.map((item) => {
            const Icon = icons[item.kind];
            const label = t(`dashboard.clinical.queue.kinds.${item.kind}`);
            return <li key={item.kind} className="attention-row">
              <Icon size={17} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" />
              <span className={`attention-count clinical-figure ${item.priority ? "text-[var(--warning-ink)]" : "text-[var(--text-primary)]"}`}>{formatNumber(item.count)}</span>
              <div className="min-w-0 flex-1 py-2 text-[.8rem] leading-relaxed">
                <p>{label}</p>
                {item.priority ? <span className="text-[.65rem] font-medium text-[var(--warning-ink)]">{t("dashboard.clinical.queue.priority")}</span> : null}
              </div>
              <Link href={item.href} className="clinical-icon-button shrink-0" aria-label={t("dashboard.clinical.queue.open", { label })}><ArrowRight size={16} strokeWidth={1.8} className="clinical-directional" /></Link>
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}
