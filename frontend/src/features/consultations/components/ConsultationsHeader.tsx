import { ClipboardPlus, ShieldCheck } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

type ConsultationsHeaderProps = {
  canCreate: boolean;
  onCreate: () => void;
  t: TranslationFunction;
};

export function ConsultationsHeader({ canCreate, onCreate, t }: ConsultationsHeaderProps) {
  return (
    <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[0.7rem] font-semibold text-[var(--medical)]">{t("consultations.page.breadcrumb")}</p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2.5 py-1 text-[0.64rem] font-semibold text-[var(--accent-dark)]">
            <ShieldCheck size={12} strokeWidth={2} aria-hidden="true" />
            {t("consultations.page.recordNotice")}
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-[1.75rem]">{t("consultations.page.title")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{t("consultations.page.subtitle")}</p>
      </div>
      {canCreate ? (
        <button type="button" className="clinical-button clinical-button-primary lg:shrink-0" onClick={onCreate}>
          <ClipboardPlus size={16} strokeWidth={1.8} aria-hidden="true" />
          {t("consultations.actions.new")}
        </button>
      ) : null}
    </header>
  );
}
