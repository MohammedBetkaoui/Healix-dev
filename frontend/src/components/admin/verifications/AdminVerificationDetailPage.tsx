"use client";

import { BadgeCheck, CircleSlash } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/layout/AdminShell";
import { adminRoutes } from "@/config/admin-routes";
import {
  useAdminVerificationDecision,
  useAdminVerificationDetail,
} from "@/features/admin/hooks/use-admin-verification-detail";
import {
  type TranslationFunction,
  useStoredLocale,
  useTranslation,
} from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type AdminVerificationDetailResponse,
  type VerificationDecision,
  type VerificationDetail,
  type VerificationDocument,
  type VerificationStatus,
} from "@/types/admin";

import { VerificationStatusBadge } from "./VerificationStatusBadge";
import { AdminDecisionChecklist } from "./detail/AdminDecisionChecklist";
import { AdminDecisionPanel } from "./detail/AdminDecisionPanel";
import { VerificationDocumentModal } from "./detail/VerificationDocumentModal";
import { VerificationDocumentsList } from "./detail/VerificationDocumentsList";
import { VerificationInfoSection } from "./detail/VerificationInfoSection";
import { VerificationSummaryCard } from "./detail/VerificationSummaryCard";
import { VerificationTimeline } from "./detail/VerificationTimeline";

type AdminVerificationDetailPageProps = {
  id: string;
};

type AdminDecisionResultProps = {
  reason?: string | null;
  status: VerificationStatus;
  t: TranslationFunction;
};

const requiredEstablishmentDocuments = new Set([
  "COMMERCIAL_REGISTER",
  "NIF_DOCUMENT",
  "HEALTH_AUTHORIZATION",
  "LEGAL_REPRESENTATIVE_ID",
  "ADDRESS_PROOF",
]);

const requiredDoctorDocuments = new Set([
  "IDENTITY_DOCUMENT",
  "MEDICAL_DEGREE",
  "ORDRE_REGISTRATION",
  "PRACTICE_AUTHORIZATION",
  "CABINET_ADDRESS_PROOF",
  "NIF_DOCUMENT",
  "SPECIALITY_DEGREE",
]);

const documentTypeLabels: Record<string, string> = {
  COMMERCIAL_REGISTER: "Registre de commerce",
  NIF_DOCUMENT: "Numéro d'identification fiscale (NIF)",
  HEALTH_AUTHORIZATION: "Autorisation sanitaire ou agrément",
  LEGAL_REPRESENTATIVE_ID: "Pièce d'identité du responsable légal",
  ADDRESS_PROOF: "Justificatif d'adresse professionnelle",
  IDENTITY_DOCUMENT: "Pièce d'identité",
  MEDICAL_DEGREE: "Diplôme de docteur en médecine",
  ORDRE_REGISTRATION: "Attestation d'inscription à l'Ordre",
  PRACTICE_AUTHORIZATION: "Autorisation d'exercice",
  CABINET_ADDRESS_PROOF: "Justificatif d'adresse du cabinet",
  SPECIALITY_DEGREE: "Diplôme de spécialité",
};

function valueToText(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "boolean") {
    return value ? "Oui" : "Non";
  }

  return String(value);
}

function readRecordValue(
  source: Record<string, unknown> | null | undefined,
  key: string,
): string {
  return valueToText(source?.[key]);
}

function createInfoSection(
  source: Record<string, unknown> | null,
  keys: string[],
): Record<string, string> {
  return Object.fromEntries(
    keys.map((key) => [key, readRecordValue(source, key)]),
  );
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AdminDecisionResult({
  reason,
  status,
  t,
}: AdminDecisionResultProps) {
  const isApproved = status === "VERIFIED";
  const isRejected = status === "REJECTED";
  const Icon = isApproved ? BadgeCheck : CircleSlash;

  const title = isApproved
    ? t("admin.detail.decision.approvedTitle")
    : isRejected
      ? t("admin.detail.decision.rejectedTitle")
      : t("admin.detail.decision.lockedTitle");

  const description = isApproved
    ? t("admin.detail.decision.approvedDescription")
    : isRejected
      ? t("admin.detail.decision.rejectedDescription")
      : t("admin.detail.decision.unavailableDescription");

  return (
    <section
      className={cn(
        "rounded-2xl border bg-card p-6 shadow-sm",
        isApproved && "border-[var(--success-line)] bg-[var(--success-soft)]/60",
        isRejected && "border-[var(--danger-line)] bg-[var(--danger-soft)]/60",
        !isApproved && !isRejected && "border-border",
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border",
            isApproved &&
              "border-[var(--success-line)] bg-card text-[var(--success-ink)] shadow-sm",
            isRejected && "border-[var(--danger-line)] bg-card text-[var(--danger-ink)] shadow-sm",
            !isApproved &&
              !isRejected &&
              "border-border bg-muted text-muted-foreground",
          )}
        >
          <Icon size={22} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          {isRejected && reason ? (
            <div className="mt-4 rounded-xl border border-[var(--danger-line)] bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--danger-ink)]">
                {t("admin.detail.decision.savedReason")}
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">{reason}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function mapDetailToView(
  response: AdminVerificationDetailResponse,
): VerificationDetail {
  const data = response.verificationData;
  const requiredDocuments =
    response.type === "ESTABLISHMENT"
      ? requiredEstablishmentDocuments
      : requiredDoctorDocuments;
  const documentsCompleted = response.documents.filter(
    (document) => document.status === "UPLOADED",
  ).length;
  const documentsTotal = requiredDocuments.size;
  const isEstablishment = response.type === "ESTABLISHMENT";
  const mainInfo = isEstablishment
    ? createInfoSection(data, [
        "name",
        "type",
        "legalForm",
        "address",
        "wilaya",
        "commune",
        "professionalEmail",
        "phone",
      ])
    : createInfoSection(data, [
        "fullName",
        "speciality",
        "doctorType",
        "wilaya",
        "commune",
        "cabinetAddress",
        "professionalEmail",
        "phone",
      ]);
  const legalInfo = isEstablishment
    ? createInfoSection(data, [
        "commercialRegisterNumber",
        "nif",
        "nis",
        "healthAuthorizationNumber",
        "healthDirectionWilaya",
        "legalRepresentativeFullName",
      ])
    : createInfoSection(data, [
        "orderRegistrationNumber",
        "regionalCouncil",
        "professionalStatus",
        "nif",
        "casnosNumber",
        "fiscalActivityType",
      ]);

  return {
    commune: readRecordValue(data, "commune"),
    completenessScore:
      documentsTotal > 0
        ? Math.min(100, Math.round((documentsCompleted / documentsTotal) * 100))
        : 100,
    documents: response.documents.map((document) => ({
      id: document.id,
      originalName: document.originalName,
      required: requiredDocuments.has(document.documentType),
      size: formatFileSize(document.size),
      status: document.status,
      title: documentTypeLabels[document.documentType] ?? document.documentType,
      type: document.documentType,
      uploadedAt: document.uploadedAt,
    })),
    documentsCompleted,
    documentsTotal,
    email: response.requester.email,
    id: response.id,
    legalInfo,
    mainInfo,
    phone: response.requester.phone,
    priority: "NORMAL",
    registeredAt:
      readRecordValue(response.establishment, "createdAt") !== "-"
        ? readRecordValue(response.establishment, "createdAt")
        : readRecordValue(response.doctorProfile, "createdAt"),
    requesterName: response.requester.name,
    status: response.status,
    submittedAt: response.submittedAt ?? "-",
    timeline:
      response.history.length > 0
        ? response.history.map((event) => ({
            date: event.createdAt,
            id: event.id,
            label: event.action,
            status: "DONE" as const,
          }))
        : [
            {
              date: response.submittedAt ?? "-",
              id: `${response.id}-status`,
              label: response.status,
              status: "CURRENT" as const,
            },
          ],
    type: response.type,
    updatedAt: response.reviewedAt ?? response.submittedAt ?? "-",
    wilaya: readRecordValue(data, "wilaya"),
  };
}

export function AdminVerificationDetailPage({
  id,
}: AdminVerificationDetailPageProps) {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const { data, error, isLoading } = useAdminVerificationDetail(id);
  const decision = useAdminVerificationDecision(id);
  const detail = useMemo(
    () => (data ? mapDetailToView(data) : null),
    [data],
  );
  const [previewDocument, setPreviewDocument] =
    useState<VerificationDocument | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleDecision = async (
    nextDecision: VerificationDecision,
    reason?: string,
  ) => {
    setFeedback(null);

    if (nextDecision === "APPROVED") {
      await decision.approve.mutateAsync(undefined);
      setFeedback(t("admin.detail.decision.approved"));
      return;
    }

    await decision.reject.mutateAsync({
      reason: reason ?? "",
    });
    setFeedback(t("admin.detail.decision.rejected"));
  };

  const status =
    decision.approve.data?.status ?? decision.reject.data?.status ?? detail?.status;
  const canRenderDecisionActions = status === "PENDING_VERIFICATION";
  const rejectionReason = decision.reject.data?.reason ?? data?.rejectionReason;

  return (
    <AdminShell
      breadcrumb={`${t("admin.breadcrumb.pages")} / ${t("admin.layout.nav.verifications")}`}
      titleKey="admin.detail.page.title"
    >
      <div className="space-y-6">
        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground shadow-sm">
            {t("admin.detail.loading")}
          </div>
        ) : error || !detail ? (
          <div className="rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-soft)] p-5 text-sm font-medium text-[var(--danger-ink)]">
            {t("admin.detail.error")}
          </div>
        ) : (
          <>
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm md:flex-row md:items-start md:justify-between">
          <div>
            <Link
              href={adminRoutes.verifications}
              className="text-sm font-semibold text-[var(--accent-dark)] hover:text-[var(--accent-dark)]"
            >
              {t("admin.actions.back")}
            </Link>
            <h2 className="mt-3 text-2xl font-semibold text-foreground">
              {detail.requesterName}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t("admin.detail.page.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <VerificationStatusBadge status={status ?? detail.status} t={t} />
            <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
              {t("admin.detail.header.completeness")} {detail.completenessScore}%
            </span>
          </div>
        </div>

        {feedback ? (
          <div
            role="status"
            className="rounded-2xl border border-[var(--success-line)] bg-[var(--success-soft)] p-4 text-sm font-medium text-[var(--success-ink)]"
          >
            {feedback}
          </div>
        ) : null}

        <VerificationSummaryCard detail={detail} t={t} />

        <section className="grid gap-6 xl:grid-cols-2">
          <VerificationInfoSection
            entries={detail.mainInfo}
            title={t("admin.detail.info.main")}
          />
          <VerificationInfoSection
            entries={detail.legalInfo}
            title={t("admin.detail.info.legal")}
          />
        </section>

        <VerificationDocumentsList
          documents={detail.documents}
          onPreview={setPreviewDocument}
          t={t}
          verificationId={id}
        />

        {canRenderDecisionActions ? (
          <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <AdminDecisionChecklist t={t} />
            <div className="space-y-6">
              <VerificationTimeline
                detail={detail}
                title={t("admin.detail.timeline")}
              />
              <AdminDecisionPanel
                isPending={decision.isPending}
                onDecision={handleDecision}
                t={t}
              />
            </div>
          </section>
        ) : (
          <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <AdminDecisionResult
              reason={rejectionReason}
              status={status ?? detail.status}
              t={t}
            />
            <VerificationTimeline
              detail={detail}
              title={t("admin.detail.timeline")}
            />
          </section>
        )}
          </>
        )}
      </div>

      <VerificationDocumentModal
        document={previewDocument}
        onClose={() => setPreviewDocument(null)}
        t={t}
        verificationId={id}
      />
    </AdminShell>
  );
}
