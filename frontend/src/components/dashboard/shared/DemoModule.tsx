import { AlertTriangle } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Marks of the demo modules (config/demo-modules.ts): pages on mock data,
// where nothing is saved or sent.

/** "Démo", next to a menu entry. */
export function DemoBadge({ className, label }: { className?: string; label: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-[var(--radius-sm)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-1.5 py-px text-[.62rem] font-semibold leading-4 text-[var(--warning-ink)]",
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Permanent banner at the top of a demo module's page: it cannot be dismissed. */
export function DemoModuleBanner({ t }: { t: TranslationFunction }) {
  return (
    <div
      role="note"
      data-demo-banner=""
      className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-s-[3px] border-[var(--warning-line)] border-s-[color:var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-sm font-medium leading-6 text-[var(--warning-ink)]"
    >
      <AlertTriangle className="mt-1 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
      <p>{t("dashboard.clinical.demo.banner")}</p>
    </div>
  );
}
