"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

import { type TranslationFunction } from "@/lib/i18n";

type DrawerShellProps = {
  busy?: boolean;
  children: React.ReactNode;
  onClose: () => void;
  t: TranslationFunction;
  title: string;
};

export function DrawerShell({ busy = false, children, onClose, t, title }: DrawerShellProps) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-[70] bg-[var(--scrim)]" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-label={title} className="absolute inset-y-0 end-0 flex w-full max-w-[840px] flex-col border-s border-[var(--border)] bg-[var(--surface-elevated)]">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-6">
          <div><p className="text-[0.68rem] font-semibold text-[var(--medical)]">{t("reports.common.clinicalReportsCenter")}</p><h2 className="mt-1 text-lg font-semibold">{title}</h2></div>
          <button type="button" className="clinical-icon-button" onClick={onClose} disabled={busy} aria-label={t("reports.actions.close")}><X size={19} aria-hidden="true" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6">{children}</div>
      </aside>
    </div>
  );
}
