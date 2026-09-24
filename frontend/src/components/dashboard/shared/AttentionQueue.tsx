import { WorkspaceLink as Link } from "../layout/WorkspaceLink";
import { ArrowRight, BrainCircuit, CalendarClock, FileWarning, FlaskConical, UserRoundPlus } from "lucide-react";
import type { TranslationFunction } from "@/lib/i18n";

const icons = { biology: FlaskConical, affiliations: UserRoundPlus, appointments: CalendarClock, records: FileWarning, ai: BrainCircuit };
type AttentionItem = { key: keyof typeof icons; count: number; href: string; priority: boolean };

export function AttentionQueue({ items, t, formatNumber }: { items: readonly AttentionItem[]; t: TranslationFunction; formatNumber: (value: number) => string }) {
  return (
    <section className="surface-clinical" aria-labelledby="attention-heading">
      <div className="clinical-section-heading">
        <div><h2 id="attention-heading">{t("dashboard.clinical.queue.title")}</h2><p className="clinical-caption mt-1">{t("dashboard.clinical.queue.subtitle")}</p></div>
        <span className="clinical-demo">{t("dashboard.clinical.demo")}</span>
      </div>
      <ul className="attention-list">
        {items.map((item) => {
          const Icon = icons[item.key];
          const label = t(`dashboard.clinical.queue.${item.key}`);
          return <li key={item.key} className="attention-row">
            <Icon size={17} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" />
            <span className={`attention-count ${item.priority ? "text-[var(--warning-ink)]" : "text-[var(--text-primary)]"}`}>{formatNumber(item.count)}</span>
            <div className="min-w-0 flex-1 py-2 text-[.8rem] leading-relaxed">
              <p>{label}</p>
              {item.priority ? <span className="text-[.65rem] font-medium text-[var(--warning-ink)]">{t("dashboard.clinical.queue.priority")}</span> : null}
            </div>
            <Link href={item.href} className="clinical-icon-button shrink-0" aria-label={t("dashboard.clinical.queue.open", { label })}><ArrowRight size={16} strokeWidth={1.8} className="clinical-directional" /></Link>
          </li>;
        })}
      </ul>
    </section>
  );
}
