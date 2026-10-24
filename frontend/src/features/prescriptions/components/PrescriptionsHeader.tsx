import { FileStack, Plus, ShieldAlert } from "lucide-react";

import { useReadOnlyAction } from "@/features/subscriptions/hooks/use-read-only-action";
import { type TranslationFunction } from "@/lib/i18n";

import { type PrescriptionCapabilities } from "../types/prescription.types";

type PrescriptionsHeaderProps = {
  capabilities: PrescriptionCapabilities;
  onNew: () => void;
  onTemplates: () => void;
  t: TranslationFunction;
};

export function PrescriptionsHeader({ capabilities, onNew, onTemplates, t }: PrescriptionsHeaderProps) {
  const write = useReadOnlyAction(t);

  return (
    <header className="workspace-intro items-start">
      <div className="min-w-0 max-w-3xl">
        <p className="mb-2 text-xs font-medium text-[var(--medical)]">{t("prescriptions.page.breadcrumb")}</p>
        <h1>{t("prescriptions.page.title")}</h1>
        <p className="mt-1.5 text-sm leading-6 text-[var(--text-secondary)]">{t("prescriptions.page.subtitle")}</p>
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-2">
        <button type="button" className="clinical-button" onClick={onTemplates}>
          <FileStack size={16} strokeWidth={1.8} aria-hidden="true" />
          {t("prescriptions.actions.templates")}
        </button>
        {capabilities.canCreatePrescription ? (
          <button type="button" className="clinical-button clinical-button-primary" disabled={write.disabled} title={write.title} onClick={onNew}>
            <Plus size={17} strokeWidth={2} aria-hidden="true" />
            {t("prescriptions.actions.new")}
          </button>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <button type="button" className="clinical-button clinical-button-unavailable" disabled>
              <ShieldAlert size={16} strokeWidth={1.8} aria-hidden="true" />
              {t("prescriptions.actions.new")}
            </button>
            <span className="max-w-64 text-[.68rem] text-[var(--text-secondary)]">{t("prescriptions.actions.reserved")}</span>
          </div>
        )}
      </div>
    </header>
  );
}

