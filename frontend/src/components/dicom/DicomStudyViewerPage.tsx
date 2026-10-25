"use client";

import { ArrowLeft, RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { isAxiosError } from "axios";

import { getPatientDisplayName } from "@/components/ai-analyses/wizard/PatientStep";
import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import {
  doctorNavSections,
  establishmentNavSections,
} from "@/components/dashboard/layout/navigation";
import { VerificationRequiredNotice } from "@/components/shared/VerificationRequiredNotice";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { buildViewerUrl } from "@/features/dicom/dicom-import";
import { useDicomStudy, useViewerAvailable } from "@/features/dicom/hooks/use-dicom-studies";
import { usePatient } from "@/features/patients/hooks/use-patient";
import { formatPatientDate } from "@/features/patients/patient-registry";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import { useSessionKeepAlive } from "@/lib/auth/use-session-keep-alive";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

import { CardiacVolumePanel } from "./CardiacVolumePanel";
import { DicomAnalysisPanel } from "./DicomAnalysisPanel";

type DicomStudyViewerPageProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  patientId: string;
  studyId: string;
};

// One study in the OHIF viewer, in a frame of the page. The viewer is a
// separate application (/viewer/, served by its own container) that reads the
// images from /api/dicomweb with the session cookie; it cannot renew that
// session itself, so this page does it while it is open.
export function DicomStudyViewerPage({ accountType, patientId, studyId }: DicomStudyViewerPageProps) {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const prefill = useEstablishmentVerificationPrefill({ enabled: accountType === "ESTABLISHMENT" });
  const initials = getAccountInitials(currentUser.data?.fullName);
  const studyQuery = useDicomStudy(studyId);
  const viewerQuery = useViewerAvailable();
  const patientQuery = usePatient(patientId);
  const keepAlive = useSessionKeepAlive();
  const study = studyQuery.data;
  const roleBase = accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";
  const recordHref = `${roleBase}/patients/${encodeURIComponent(patientId)}?tab=imaging`;

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

  const patientName = patientQuery.data ? getPatientDisplayName(patientQuery.data, locale) : "";
  const notFound = isAxiosError(studyQuery.error) && studyQuery.error.response?.status === 404;

  const content = () => {
    if (isVerificationRequiredError(studyQuery.error)) {
      return <VerificationRequiredNotice accountType={accountType} t={t} />;
    }
    if (studyQuery.isLoading) {
      return (
        <p className="surface-section flex items-center gap-3 p-5 text-sm text-[var(--text-secondary)]" aria-live="polite">
          <RefreshCw size={18} className="animate-spin" aria-hidden="true" />
          {t("dicom.viewer.loading")}
        </p>
      );
    }
    if (studyQuery.isError || !study) {
      return (
        <p role="alert" className="surface-section flex items-start gap-3 p-5 text-sm text-[var(--danger-ink)]">
          <ShieldAlert size={18} className="mt-px shrink-0" aria-hidden="true" />
          {notFound ? t("dicom.viewer.notFound") : t("dicom.viewer.unavailable")}
        </p>
      );
    }

    return (
      <>
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-[var(--font-auth-display)] text-xl font-medium text-[var(--ink)]">
              {study.studyDescription || t("dicom.viewer.pageTitle")}
            </h1>
            <p className="clinical-caption mt-0.5">
              {[
                patientName,
                study.studyDate ? formatPatientDate(study.studyDate, locale) : "",
                study.modalities.join(", "),
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
        </header>

        {study.identityWarnings.length > 0 ? (
          <div role="note" className="mb-4 flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--warning-ink)]">
            <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
            <ul className="space-y-0.5">
              {study.identityWarnings.map((warning) => (
                <li key={warning.field}>
                  {t("dicom.studies.warningDetail", {
                    field: t(`dicom.studies.warningFields.${warning.field}`),
                    value: warning.dicomValue,
                  })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {keepAlive.ended ? (
          <p role="alert" className="mb-4 flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
            <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
            {t("dicom.viewer.sessionEnded")}
          </p>
        ) : null}

        {viewerQuery.isLoading ? (
          <p className="surface-section flex items-center gap-3 p-5 text-sm text-[var(--text-secondary)]" aria-live="polite" data-viewer-state="loading">
            <RefreshCw size={18} className="animate-spin" aria-hidden="true" />
            {t("dicom.viewer.viewerLoading")}
          </p>
        ) : viewerQuery.data ? (
          <iframe
            allowFullScreen
            className="h-[calc(100dvh-16rem)] min-h-[32rem] w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-black"
            referrerPolicy="same-origin"
            src={buildViewerUrl(study.studyInstanceUid)}
            title={t("dicom.viewer.frameTitle")}
          />
        ) : (
          // Nothing answers at /viewer/: say so, rather than frame the browser's
          // own error page ("localhost a refusé de se connecter").
          <div role="note" className="surface-section flex items-start gap-3 p-5 text-sm text-[var(--text-secondary)]" data-viewer-state="unavailable">
            <ShieldAlert size={18} className="mt-px shrink-0 text-[var(--warning-ink)]" aria-hidden="true" />
            <div className="space-y-1.5">
              <p className="font-medium text-[var(--ink)]">{t("dicom.viewer.viewerUnavailable")}</p>
              <p>{t("dicom.viewer.viewerUnavailableBody")}</p>
              {process.env.NODE_ENV !== "production" ? <p className="clinical-caption">{t("dicom.viewer.viewerDevHint")}</p> : null}
            </div>
          </div>
        )}

        <DicomAnalysisPanel accountType={accountType} patientId={patientId} study={study} t={t} />
        <CardiacVolumePanel accountType={accountType} patientId={patientId} studyId={study.id} t={t} />
      </>
    );
  };

  return (
    <DashboardShell {...shellProps} activeKey="patients" breadcrumbLabel={patientName || t("dicom.viewer.pageTitle")} titleKey={accountType === "ESTABLISHMENT" ? "patients.page.title" : "patients.page.doctorTitle"}>
      <div className="mb-4">
        <Link className="inline-flex items-center gap-2 text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]" href={recordHref}>
          <ArrowLeft size={16} strokeWidth={1.8} className="rtl:rotate-180" aria-hidden="true" />
          {t("dicom.viewer.back")}
        </Link>
      </div>
      {content()}
    </DashboardShell>
  );
}
