import { AlertTriangle, CheckCircle2, CircleAlert, ShieldCheck } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { localize } from "../prescriptions.copy";
import { type ClinicalSafetyAlert, type SafetyLevel } from "../types/prescription.types";

const tone: Record<SafetyLevel, { classes: string; icon: typeof CircleAlert }> = {
  attention: { classes: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]", icon: AlertTriangle },
  critical: { classes: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]", icon: CircleAlert },
  information: { classes: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]", icon: CheckCircle2 },
};

type ClinicalSafetyPanelProps = {
  alerts: ClinicalSafetyAlert[];
  locale: Locale;
  t: TranslationFunction;
};

export function ClinicalSafetyPanel({ alerts, locale, t }: ClinicalSafetyPanelProps) {
  const unresolved = alerts.filter((alert) => !alert.resolved);
  return (
    <aside className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={17} className="text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />{t("prescriptions.safety.title")}</h3><p className="mt-1 text-[.66rem] text-[var(--text-secondary)]">{t("prescriptions.safety.subtitle")}</p></div><span className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[.66rem] font-semibold">{unresolved.length}</span></div>
      <div className="mt-4 space-y-2">
        {alerts.length === 0 ? <p className="rounded-[var(--radius-sm)] border border-[var(--success-line)] bg-[var(--success-soft)] p-3 text-[.72rem] text-[var(--success-ink)]">{t("prescriptions.safety.noAlert")}</p> : alerts.map((alert) => {
          const Icon = tone[alert.level].icon;
          return <div key={alert.id} className={cn("flex items-start gap-2 rounded-[var(--radius-sm)] border p-3", tone[alert.level].classes)}><Icon className="mt-0.5 shrink-0" size={15} strokeWidth={1.8} aria-hidden="true" /><div><p className="text-[.72rem] font-semibold leading-5">{localize(alert.title, locale)}</p>{alert.detail ? <p className="mt-0.5 text-[.66rem] leading-5 opacity-90">{localize(alert.detail, locale)}</p> : null}</div></div>;
        })}
      </div>
      <p className="mt-4 border-t border-[var(--line-soft)] pt-3 text-[.66rem] leading-5 text-[var(--text-secondary)]">{t("prescriptions.safety.disclaimer")}</p>
    </aside>
  );
}

