"use client";

import {
  Brain,
  HeartPulse,
  Microscope,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import {
  doctorNavSections,
  establishmentNavSections,
} from "@/components/dashboard/layout/navigation";
import { aiModules, type AiModule } from "@/features/ai-analyses/ai-analyses.types";
import { aiModels, type AiModelId } from "@/features/ai-analyses/ai-models.registry";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

import { AiModelCard } from "./AiModelCard";
import { AiModelSheet } from "./AiModelSheet";

const moduleIcons: Record<AiModule, LucideIcon> = {
  brain: Brain,
  cardiology: HeartPulse,
  pathology: Microscope,
};

type AiAnalysesHubPageProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
};

// Catalog of the models of ai-models.registry. It calls no clinical API (only
// the account identity for the shell), so VERIFICATION_REQUIRED cannot occur
// here until analyses actually run.
export function AiAnalysesHubPage({ accountType }: AiAnalysesHubPageProps) {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  // Establishment name for the workspace subtitle; skipped for doctor
  // accounts (ESTABLISHMENT_ADMIN-only endpoint).
  const prefill = useEstablishmentVerificationPrefill({ enabled: accountType === "ESTABLISHMENT" });
  const initials = getAccountInitials(currentUser.data?.fullName);
  const [sheetModelId, setSheetModelId] = useState<AiModelId | null>(null);
  const sheetModel = aiModels.find((model) => model.id === sheetModelId) ?? null;
  const roleBase = accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";

  const shellProps = accountType === "ESTABLISHMENT"
    ? {
        accountType: "ESTABLISHMENT" as const,
        navSections: establishmentNavSections,
        user: { accountType: "ESTABLISHMENT" as const, footerSubtitle: t("dashboard.clinical.administration"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.administration"), roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: prefill.data?.establishment.name || t("dashboard.clinical.workspace") },
      }
    : {
        accountType: "INDEPENDENT_DOCTOR" as const,
        navSections: doctorNavSections,
        user: { accountType: "INDEPENDENT_DOCTOR" as const, footerSubtitle: t("dashboard.clinical.doctor.practice"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.doctor.workspace"), roleKey: "dashboard.common.roles.doctor", workspaceSubtitle: t("dashboard.clinical.doctor.workspace") },
      };

  return (
    <DashboardShell
      {...shellProps}
      activeKey="analyses"
      breadcrumbLabel={t("aiAnalyses.page.breadcrumb")}
      titleKey="aiAnalyses.page.title"
    >
      <div className="workspace-stack">
        <header className="workspace-intro">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-medium text-[var(--medical)]">{t("aiAnalyses.page.context")}</p>
            <h1 className="break-words">{t("aiAnalyses.page.title")}</h1>
            <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">{t("aiAnalyses.page.subtitle")}</p>
          </div>
        </header>

        {/* Permanent: shown whatever the model or its status. */}
        <div
          role="note"
          className="flex items-start gap-3 rounded-[var(--radius-md)] border border-s-[3px] border-[var(--border)] border-s-[color:var(--warning)] bg-[var(--surface)] px-4 py-3"
        >
          <ShieldAlert size={18} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--warning-ink)]" />
          <p className="text-sm font-medium text-[var(--text-primary)]">{t("aiAnalyses.page.disclaimer")}</p>
        </div>

        {aiModules.map((module) => {
          const Icon = moduleIcons[module];
          const headingId = `ai-module-${module}`;

          return (
            // The specialty color is only an accent (rule + icon): the heading
            // names the module.
            <section key={module} aria-labelledby={headingId} className="surface-section ai-module" data-module={module}>
              <div className="clinical-section-heading">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="ai-module-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)]">
                    <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 id={headingId}>{t(`aiAnalyses.modules.${module}.title`)}</h2>
                    <p className="clinical-caption mt-1">{t(`aiAnalyses.modules.${module}.description`)}</p>
                  </div>
                </div>
              </div>
              <ul className="grid gap-4 px-5 pb-5 md:grid-cols-2 xl:grid-cols-3">
                {aiModels
                  .filter((model) => model.module === module)
                  .map((model) => (
                    <li key={model.id} className="min-w-0">
                      <AiModelCard
                        locale={locale}
                        model={model}
                        newAnalysisHref={`${roleBase}/ai-analyses/new?model=${encodeURIComponent(model.id)}`}
                        onOpenSheet={() => setSheetModelId(model.id)}
                        t={t}
                      />
                    </li>
                  ))}
              </ul>
            </section>
          );
        })}
      </div>

      <AiModelSheet locale={locale} model={sheetModel} onClose={() => setSheetModelId(null)} t={t} />
    </DashboardShell>
  );
}
