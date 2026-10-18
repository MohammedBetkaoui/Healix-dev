"use client";

import {
  ArrowRight, Brain, Check, ChevronDown, ClipboardList,
  FileCheck2, FileInput, HeartPulse, Layers3, Microscope, RefreshCw,
  ShieldCheck, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { doctorNavSections, establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { HealixLogo } from "@/components/shared/HealixLogo";
import { aiModules, type AiModule, type AiPipelineId } from "@/features/ai-analyses/ai-analyses.types";
import { aiModels, aiPipelines, findModel, getPipelineRole, type AiModelId } from "@/features/ai-analyses/ai-models.registry";
import { isolate } from "@/features/ai-analyses/evaluation-presentation";
import { getPipelineAvailability } from "@/features/ai-analyses/hub-presentation";
import { useAiModelsStatus } from "@/features/ai-analyses/hooks/use-ai-models-status";
import { useAiRunsOverview } from "@/features/ai-analyses/hooks/use-ai-runs-overview";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

import { AiModelCard } from "./AiModelCard";
import { AiModelSheet } from "./AiModelSheet";
import { AiPipelineCard } from "./AiPipelineCard";
import { HealixSpecialtyArtwork } from "./HealixSpecialtyArtwork";
import "./ai-analyses-hub.css";

const moduleIcons: Record<AiModule, LucideIcon> = {
  brain: Brain, cardiology: HeartPulse, pathology: Microscope,
};
const catalogPipelines = aiModules.flatMap((module) => aiPipelines.filter((pipeline) => pipeline.module === module));
const preparationSteps = [
  { key: "patient", icon: ClipboardList },
  { key: "document", icon: FileInput },
  { key: "review", icon: FileCheck2 },
] as const;

type AiAnalysesHubPageProps = { accountType: "DOCTOR" | "ESTABLISHMENT" };

export function AiAnalysesHubPage({ accountType }: AiAnalysesHubPageProps) {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const prefill = useEstablishmentVerificationPrefill({ enabled: accountType === "ESTABLISHMENT" });
  const initials = getAccountInitials(currentUser.data?.fullName);
  const [sheetModelId, setSheetModelId] = useState<AiModelId | null>(null);
  const [activeModule, setActiveModule] = useState<AiModule | "all">("all");
  const [selectedId, setSelectedId] = useState<AiPipelineId>("brain");
  const status = useAiModelsStatus();
  const serviceStatus = status.isError ? undefined : status.data;
  const pending = useAiRunsOverview({ decision: "pending", limit: 1, page: 1 });
  const pendingCount = pending.data?.total ?? 0;
  const roleBase = accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";
  const sheetModel = aiModels.find((model) => model.id === sheetModelId) ?? null;
  const selected = aiPipelines.find((pipeline) => pipeline.id === selectedId) ?? aiPipelines[0];
  const selectedModel = findModel(selected.entryModelId);
  const selectedModels = [selected.entryModelId, ...Object.values(selected.segmenterByClass)]
    .map((id) => aiModels.find((model) => model.id === id)).filter((model) => model !== undefined);
  const visiblePipelines = catalogPipelines.filter((pipeline) => activeModule === "all" || pipeline.module === activeModule);
  const workspaceName = accountType === "ESTABLISHMENT"
    ? prefill.data?.establishment.name || t("dashboard.clinical.administration")
    : currentUser.data?.fullName || t("dashboard.clinical.doctor.workspace");
  const availability = getPipelineAvailability(selected, serviceStatus);
  const serviceState = status.isPending ? "checking" : !serviceStatus ? "unknown" : serviceStatus.service === "available" ? "online" : "offline";
  const number = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ");

  function selectModule(module: AiModule | "all") {
    setActiveModule(module);
    if (module !== "all" && selected.module !== module) {
      const first = aiPipelines.find((pipeline) => pipeline.module === module);
      if (first) setSelectedId(first.id);
    }
  }

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
    <DashboardShell {...shellProps} activeKey="analyses" breadcrumbLabel={t("aiAnalyses.hub.title")} titleKey="aiAnalyses.hub.title">
      <div className="ai-hub">
        <header className="ai-hub-hero">
          <div className="ai-hub-hero-main">
            <div className="ai-hub-hero-top">
              <p className="ai-hub-eyebrow"><span aria-hidden="true" />{t("aiAnalyses.hub.brandEyebrow")}</p>
              <Link href={`${roleBase}/ai-analyses/tracking`} className="ai-hub-history">
                {t("aiAnalyses.hub.history")}<ArrowRight size={14} aria-hidden="true" className="clinical-directional" />
              </Link>
            </div>
            <div className="ai-hub-hero-copy">
              <h1>{t("aiAnalyses.hub.title")}</h1>
              <p className="ai-hub-brand-signature">{t("aiAnalyses.hub.brandSignature")}</p>
              <p className="ai-hub-hero-description">{t("aiAnalyses.hub.subtitle")}</p>
            </div>
            <div className="ai-hub-hero-bottom">
              <div className="ai-hub-service" role="status">
                <span className="ai-hub-service-label">{t("aiAnalyses.hub.service.label")}</span>
                <p className="ai-hub-service-state" data-state={serviceState}>
                  <span className="ai-hub-status-dot" />{t(`aiAnalyses.hub.service.${serviceState}`)}
                </p>
                <button type="button" className="ai-hub-refresh" onClick={() => void status.refetch()} disabled={status.isFetching} aria-label={t("aiAnalyses.hub.service.refresh")}>
                  <RefreshCw size={14} aria-hidden="true" className={status.isFetching ? "ai-hub-spinning" : undefined} />
                </button>
              </div>
              <p className="ai-hub-capabilities">
                <span>{t("aiAnalyses.hub.analysisCount", { count: number.format(aiPipelines.length) })}</span>
                <span aria-hidden="true">/</span>
                <span>{t("aiAnalyses.hub.specialtyCount", { count: number.format(aiModules.length) })}</span>
              </p>
            </div>
          </div>
          <div className="ai-hub-atlas" aria-hidden="true">
            <div className="ai-hub-atlas-brand"><HealixLogo variant="full" alt="" className="ai-hub-wordmark" /><span>{t("aiAnalyses.hub.atlasEdition")}</span></div>
            <HealixSpecialtyArtwork pipeline={selected.id} className="ai-hub-atlas-art" />
            <div className="ai-hub-atlas-caption">
              <span>{t("aiAnalyses.hub.atlasLabel")}</span>
              <strong>{t(`aiAnalyses.modules.${selected.module}.title`)}</strong>
            </div>
            <svg className="ai-hub-brand-pulse" viewBox="0 0 720 52" preserveAspectRatio="none">
              <path d="M0 27H250l18-1 10-14 15 30 17-39 19 24h95l14-1 8-10 11 21 14-10H720" />
            </svg>
          </div>
          <ol className="ai-hub-journey" aria-label={t("aiAnalyses.hub.journey.label")}>
            {(["choose", "prepare", "read"] as const).map((step, index) => (
              <li key={step} aria-current={index === 0 ? "step" : undefined}>
                <span className="ai-hub-journey-number"><bdi>{number.format(index + 1)}</bdi></span>
                <span>{t(`aiAnalyses.hub.journey.${step}`)}</span>
                {index === 0 ? <span className="ai-hub-current-step">{t("aiAnalyses.hub.journey.current")}</span> : null}
              </li>
            ))}
          </ol>
        </header>

        {pendingCount > 0 ? (
          <Link href={`${roleBase}/ai-analyses/tracking`} className="ai-hub-pending">
            <span className="ai-hub-pending-icon"><ClipboardList size={18} aria-hidden="true" /></span>
            <span>{pendingCount === 1 ? t("aiAnalyses.tracking.hub.pendingOne") : t("aiAnalyses.tracking.hub.pendingOther", { count: isolate(number.format(pendingCount)) })}</span>
            <span className="ai-hub-pending-action">{t("aiAnalyses.tracking.hub.open")}<ArrowRight size={15} aria-hidden="true" className="clinical-directional" /></span>
          </Link>
        ) : null}

        <div className="ai-hub-workspace">
          <section className="ai-hub-picker" aria-labelledby="ai-hub-picker-title">
            <div className="ai-hub-section-title">
              <div><p className="ai-hub-section-index"><span aria-hidden="true">01 /</span>{t("aiAnalyses.hub.examSection")}</p><h2 id="ai-hub-picker-title">{t("aiAnalyses.hub.chooseTitle")}</h2><p>{t("aiAnalyses.hub.chooseHint")}</p></div>
              <span className="ai-hub-result-count" aria-live="polite" aria-atomic="true">{t("aiAnalyses.hub.visibleCount", { count: number.format(visiblePipelines.length) })}</span>
            </div>
            <div className="ai-hub-filters" role="group" aria-label={t("aiAnalyses.hub.filterLabel")}>
              {(["all", ...aiModules] as const).map((module) => {
                const Icon = module === "all" ? Layers3 : moduleIcons[module];
                const count = module === "all" ? aiPipelines.length : aiPipelines.filter((pipeline) => pipeline.module === module).length;
                return (
                  <button key={module} type="button" aria-pressed={activeModule === module} aria-controls="ai-hub-pipelines" className="ai-hub-filter" onClick={() => selectModule(module)}>
                    <Icon size={15} strokeWidth={1.8} aria-hidden="true" />{module === "all" ? t("aiAnalyses.hub.all") : t(`aiAnalyses.modules.${module}.title`)}<span>{number.format(count)}</span>
                  </button>
                );
              })}
            </div>
            <ul id="ai-hub-pipelines" className="ai-hub-pipelines" aria-label={t("aiAnalyses.hub.chooseTitle")}>
              {visiblePipelines.map((pipeline) => (
                <li key={pipeline.id}><AiPipelineCard pipeline={pipeline} index={number.format(catalogPipelines.findIndex((item) => item.id === pipeline.id) + 1)} selected={selectedId === pipeline.id} status={serviceStatus} onSelect={() => setSelectedId(pipeline.id)} t={t} /></li>
              ))}
            </ul>
            <p className="ai-hub-selection-hint"><ShieldCheck size={15} aria-hidden="true" />{t("aiAnalyses.hub.selectionHint")}</p>
          </section>

          <aside id="ai-hub-summary" className="ai-hub-summary" aria-labelledby="ai-hub-summary-title">
            <div className="ai-hub-summary-heading">
              <span className="ai-hub-dossier-tab">{t("aiAnalyses.hub.dossierLabel")}</span>
              <span>HealixDz</span>
            </div>
            <div className="ai-hub-summary-body">
              <div className="ai-hub-workspace-owner"><span>{t("aiAnalyses.hub.yourWorkspace")}</span><strong>{workspaceName}</strong></div>
              <div className="ai-hub-summary-selection" aria-live="polite" aria-atomic="true">
                <p className="ai-hub-summary-specialty"><span aria-hidden="true" />{t("aiAnalyses.hub.selection")}</p>
                <h2 id="ai-hub-summary-title">{t(`aiAnalyses.hub.analyses.${selected.id}.title`)}</h2>
              </div>
              <dl className="ai-hub-requirements">
                <div><dt><FileInput size={14} aria-hidden="true" />{t("aiAnalyses.hub.input")}</dt><dd>{t(`aiAnalyses.hub.analyses.${selected.id}.input`)}</dd></div>
                <div><dt><Layers3 size={14} aria-hidden="true" />{t("aiAnalyses.hub.output")}</dt><dd>{t(`aiAnalyses.hub.analyses.${selected.id}.output`)}</dd></div>
              </dl>
              <div className="ai-hub-preparation">
                <h3>{t("aiAnalyses.hub.nextTitle")}</h3>
                <ol>{preparationSteps.map(({ key, icon: Icon }) => <li key={key}><span><Icon size={14} aria-hidden="true" /></span>{t(`aiAnalyses.hub.preparation.${key}`)}</li>)}</ol>
              </div>
              <div className="ai-hub-models">
                <span>{t("aiAnalyses.hub.models")}</span>
                <div>{selectedModels.map((model) => (
                  <button type="button" key={model.id} onClick={() => setSheetModelId(model.id)} aria-haspopup="dialog" aria-label={t("aiAnalyses.card.openSheetFor", { name: t(`aiAnalyses.models.${model.id}.name`) })}>
                    {t(`aiAnalyses.models.${model.id}.name`)}<ArrowRight size={11} aria-hidden="true" className="clinical-directional" />
                  </button>
                ))}</div>
              </div>
              <Link href={`${roleBase}/ai-analyses/new?pipeline=${encodeURIComponent(selected.id)}`} className="ai-hub-continue" aria-label={t("aiAnalyses.hub.continueWith", { name: t(`aiAnalyses.hub.analyses.${selected.id}.title`) })}>
                {t("aiAnalyses.hub.continue")}<ArrowRight size={17} aria-hidden="true" className="clinical-directional" />
              </Link>
              <p className="ai-hub-launch-note">{availability === "ready" ? <Check size={13} aria-hidden="true" /> : <ShieldCheck size={13} aria-hidden="true" />}{availability === "ready" ? t("aiAnalyses.hub.readyHint") : t("aiAnalyses.hub.checkHint")}</p>
              {selectedModel?.acceptedFormats ? <p className="ai-hub-summary-formats"><bdi dir="ltr">{selectedModel.acceptedFormats.join(" · ").toUpperCase()}</bdi></p> : null}
            </div>
          </aside>
          <div className="ai-hub-mobile-action">
            <div><span>{t("aiAnalyses.hub.selection")}</span><strong>{t(`aiAnalyses.hub.analyses.${selected.id}.title`)}</strong></div>
            <Link href={`${roleBase}/ai-analyses/new?pipeline=${encodeURIComponent(selected.id)}`} className="ai-hub-continue" aria-label={t("aiAnalyses.hub.continueWith", { name: t(`aiAnalyses.hub.analyses.${selected.id}.title`) })}>
              {t("aiAnalyses.hub.continue")}<ArrowRight size={16} aria-hidden="true" className="clinical-directional" />
            </Link>
          </div>
        </div>

        <div role="note" className="ai-hub-disclaimer"><ShieldCheck size={19} strokeWidth={1.7} aria-hidden="true" /><div><strong>{t("aiAnalyses.hub.clinicalNote")}</strong><p>{t("aiAnalyses.page.disclaimer")}</p></div></div>

        <details className="ai-hub-catalog">
          <summary>
            <span className="ai-hub-catalog-icon"><Layers3 size={20} strokeWidth={1.6} aria-hidden="true" /></span>
            <span className="ai-hub-catalog-copy"><strong>{t("aiAnalyses.hub.catalogTitle")}</strong><span>{t("aiAnalyses.hub.catalogHint")}</span></span>
            <span className="ai-hub-catalog-count">{number.format(aiModels.length)}</span><ChevronDown size={18} aria-hidden="true" className="ai-hub-catalog-chevron" />
          </summary>
          <div className="ai-hub-catalog-content">
            {aiModules.map((module) => {
              const Icon = moduleIcons[module];
              return (
                <section key={module} aria-labelledby={`ai-module-${module}`} className="ai-hub-catalog-module">
                  <h3 id={`ai-module-${module}`}><Icon size={17} aria-hidden="true" />{t(`aiAnalyses.modules.${module}.title`)}</h3>
                  <ul>{aiModels.filter((model) => model.module === module).map((model) => {
                    const role = getPipelineRole(model.id);
                    const pipelineRole = role?.role === "entry"
                      ? role.pipeline.kind === "routed" ? t("aiAnalyses.card.pipelineRole.entry") : t("aiAnalyses.card.pipelineRole.single", { pipeline: t(`aiAnalyses.pipelines.${role.pipeline.id}.name`) })
                      : role?.role === "segmenter" ? t("aiAnalyses.card.pipelineRole.segmenter", { class: t(`aiAnalyses.classes.${role.classKey}`) }) : undefined;
                    const unavailableReason = model.status === "requires_multisequence" ? t("aiAnalyses.statusNotes.requires_multisequence") : model.status === "documentation_pending" ? t("aiAnalyses.statusNotes.documentation_pending") : t("aiAnalyses.statusNotes.noPipeline");
                    return <li key={model.id}><AiModelCard locale={locale} model={model} onOpenSheet={() => setSheetModelId(model.id)} pipelineRole={pipelineRole} unavailableReason={pipelineRole ? undefined : unavailableReason} t={t} /></li>;
                  })}</ul>
                </section>
              );
            })}
          </div>
        </details>
      </div>
      <AiModelSheet locale={locale} model={sheetModel} onClose={() => setSheetModelId(null)} t={t} />
    </DashboardShell>
  );
}
