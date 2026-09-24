import { WorkspaceLink as Link } from "../layout/WorkspaceLink";
import { BadgeCheck, CalendarPlus, Plus } from "lucide-react";
import type { TranslationFunction } from "@/lib/i18n";

export function ClinicalWorkspaceHeader({ name, isVerified, t }: { name: string; isVerified: boolean; t: TranslationFunction }) {
  return (
    <header className="workspace-intro">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <p className="text-xs font-medium text-[var(--medical)]">{t("dashboard.clinical.context")}</p>
          {isVerified ? <span className="inline-flex items-center gap-1 text-xs text-[var(--official)]"><BadgeCheck size={14} strokeWidth={1.8} aria-hidden="true" />{t("dashboard.clinical.verified")}</span> : null}
        </div>
        <h1 className="break-words">{name}</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("dashboard.clinical.intro")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="#appointments" className="clinical-button"><CalendarPlus size={16} strokeWidth={1.8} aria-hidden="true" />{t("dashboard.clinical.actions.appointment")}</Link>
        <Link href="/establishment/patients" className="clinical-button clinical-button-primary"><Plus size={17} strokeWidth={1.8} aria-hidden="true" />{t("dashboard.clinical.actions.patient")}</Link>
      </div>
    </header>
  );
}
