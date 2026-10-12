import { ScanLine } from "lucide-react";
import { type ReactNode } from "react";

import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// "Image analysée": the viewer of a result, under its heading and hint. The
// top rule takes the module's colour (accentClassName).
export function RunImageSection({
  accentClassName,
  children,
  hint,
  t,
}: {
  accentClassName: string;
  children: ReactNode;
  hint: string;
  t: TranslationFunction;
}) {
  return (
    <section aria-labelledby="ai-run-image" className={cn("surface-section min-w-0 overflow-hidden border-t-2", accentClassName)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-muted)] px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--ai-line)] bg-[var(--ai-soft)] text-[var(--ai)]">
            <ScanLine size={17} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div>
            <h2 id="ai-run-image" className="text-base font-semibold text-[var(--text-primary)]">
              {t("aiAnalyses.run.image")}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--text-secondary)]">{hint}</p>
          </div>
        </div>
        <span className="rounded-full border border-[var(--ai-line)] bg-[var(--ai-soft)] px-2.5 py-1 text-[.68rem] font-semibold text-[var(--ai)]">{t("aiAnalyses.run.imageBadge")}</span>
      </header>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}
