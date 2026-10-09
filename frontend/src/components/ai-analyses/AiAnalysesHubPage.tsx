"use client";

import {
  ArrowRight,
  Brain,
  ClipboardList,
  HeartPulse,
  Microscope,
  ScanLine,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import {
  doctorNavSections,
  establishmentNavSections,
} from "@/components/dashboard/layout/navigation";
import { aiModules, type AiModule } from "@/features/ai-analyses/ai-analyses.types";
import {
  aiModels,
  aiPipelines,
  getPipelineRole,
  type AiModelId,
} from "@/features/ai-analyses/ai-models.registry";
import { isolate } from "@/features/ai-analyses/evaluation-presentation";
import { useAiRunsOverview } from "@/features/ai-analyses/hooks/use-ai-runs-overview";
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

// Catalog of the models of ai-models.registry, and the count of analyses
// waiting for a decision (shown only when there are some: an unverified
// account, refused with VERIFICATION_REQUIRED, simply sees no banner).
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
  // Only the total is needed: one row is asked for.
  const pending = useAiRunsOverview({ decision: "pending", limit: 1, page: 1 });
  const pendingCount = pending.data?.total ?? 0;

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

        {pendingCount > 0 ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-s-[3px] border-[var(--border)] border-s-[color:var(--accent)] bg-[var(--surface)] px-4 py-3"
          >
            <p className="flex items-center gap-2.5 text-sm font-medium text-[var(--text-primary)]">
              <ClipboardList size={18} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-[var(--accent-dark)]" />
              {pendingCount === 1
                ? t("aiAnalyses.tracking.hub.pendingOne")
                : t("aiAnalyses.tracking.hub.pendingOther", { count: isolate(String(pendingCount)) })}
            </p>
            <Link href={`${roleBase}/ai-analyses/tracking`} className="clinical-button clinical-button-primary">
              {t("aiAnalyses.tracking.hub.open")}
              <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
            </Link>
          </div>
        ) : null}

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
          const pipeline = aiPipelines.find((candidate) => candidate.module === module);
          const pipelineModels = pipeline
            ? [pipeline.classifierId, ...Object.values(pipeline.segmenterByClass)]
                .map((id) => aiModels.find((model) => model.id === id))
                .filter((model) => model !== undefined)
            : [];

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
              {pipeline ? (
                <div className="px-5 pb-5">
                  <article className="rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--medical-soft)] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 max-w-3xl">
                        <p className="text-xs font-semibold text-[var(--medical)]">{t("aiAnalyses.pipelines.eyebrow")}</p>
                        <h3 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                          {t(`aiAnalyses.pipelines.${pipeline.id}.name`)}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                          {t(`aiAnalyses.pipelines.${pipeline.id}.description`)}
                        </p>
                      </div>
                      <Link
                        href={`${roleBase}/ai-analyses/new?pipeline=${encodeURIComponent(pipeline.id)}`}
                        className="clinical-button clinical-button-primary shrink-0"
                      >
                        <ScanLine size={16} strokeWidth={1.8} aria-hidden="true" />
                        {t(`aiAnalyses.pipelines.${pipeline.id}.launch`)}
                        <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
                      </Link>
                    </div>
                    <div className="mt-4 grid gap-4 border-t border-[var(--border)] pt-4 lg:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold text-[var(--text-secondary)]">{t("aiAnalyses.pipelines.components")}</p>
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {pipelineModels.map((model) => (
                            <li key={model.id} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--text-primary)]">
                              {t(`aiAnalyses.models.${model.id}.name`)}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <ol className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                        <li>1. {t(`aiAnalyses.pipelines.${pipeline.id}.steps.classify`)}</li>
                        <li>2. {t(`aiAnalyses.pipelines.${pipeline.id}.steps.segmentMeningioma`)}</li>
                        <li>3. {t(`aiAnalyses.pipelines.${pipeline.id}.steps.segmentPituitary`)}</li>
                      </ol>
                    </div>
                  </article>
                </div>
              ) : null}
              <ul className="grid gap-4 px-5 pb-5 md:grid-cols-2 xl:grid-cols-3">
                {aiModels
                  .filter((model) => model.module === module)
                  .map((model) => {
                    const role = getPipelineRole(model.id);
                    const pipelineRole = role?.role === "classifier"
                      ? t("aiAnalyses.card.pipelineRole.classifier")
                      : role?.role === "segmenter"
                        ? t("aiAnalyses.card.pipelineRole.segmenter", { class: t(`aiAnalyses.classes.${role.classKey}`) })
                        : undefined;
                    const unavailableReason = model.status === "requires_multisequence"
                      ? t("aiAnalyses.statusNotes.requires_multisequence")
                      : model.status === "documentation_pending"
                        ? t("aiAnalyses.statusNotes.documentation_pending")
                        : t("aiAnalyses.statusNotes.noPipeline");

                    return (
                      <li key={model.id} className="min-w-0">
                        <AiModelCard
                          locale={locale}
                          model={model}
                          onOpenSheet={() => setSheetModelId(model.id)}
                          pipelineRole={pipelineRole}
                          unavailableReason={pipelineRole ? undefined : unavailableReason}
                          t={t}
                        />
                      </li>
                    );
                  })}
              </ul>
            </section>
          );
        })}
      </div>

      <AiModelSheet locale={locale} model={sheetModel} onClose={() => setSheetModelId(null)} t={t} />
    </DashboardShell>
  );
}
