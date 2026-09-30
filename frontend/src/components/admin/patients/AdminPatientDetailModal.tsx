"use client";

import {
  BadgeCheck,
  Building2,
  CalendarDays,
  Droplet,
  FileText,
  Fingerprint,
  Landmark,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import { type ReactNode, useId } from "react";

import { DetailItem } from "@/components/admin/audit/AdminAuditLogDetailModal";
import {
  type AuditPresentationTone,
  getAuditActionLabel,
  getAuditTone,
} from "@/components/admin/audit/audit-presentation";
import { Button } from "@/components/ui/button";
import { useAdminPatientDetail } from "@/features/admin/hooks/use-admin-patient-detail";
import { formatPatientDate } from "@/features/patients/patient-registry";
import { bloodGroupToDisplay } from "@/features/patients/patients.api";
import { type Locale } from "@/i18n";
import { formatAdminDateTime } from "@/lib/date-format";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type Patient } from "@/types/patient";

import { getPatientStatusClasses } from "./patient-status-classes";

type AdminPatientDetailModalProps = {
  locale: Locale;
  onClose: () => void;
  patient: Patient | null;
  t: TranslationFunction;
};

// Same palette as the badge styles of AdminAuditLogDetailModal.tsx.
const toneBadge: Record<AuditPresentationTone, string> = {
  danger: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  info: "border-[var(--accent-line)] bg-secondary text-[var(--accent-dark)]",
  success: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
  warning: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
};

function DetailSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function AdminPatientDetailModal({
  patient,
  ...dialogProps
}: AdminPatientDetailModalProps) {
  // Mounted only while a patient is targeted; keyed by id so switching
  // patients never shows the previous one's details.
  if (!patient) {
    return null;
  }

  return <AdminPatientDetailDialog key={patient.id} patient={patient} {...dialogProps} />;
}

function AdminPatientDetailDialog({
  locale,
  onClose,
  patient,
  t,
}: Omit<AdminPatientDetailModalProps, "patient"> & { patient: Patient }) {
  const titleId = useId();
  const { data, isError, isLoading } = useAdminPatientDetail(patient.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <button
        type="button"
        aria-label={t("admin.actions.close")}
        className="absolute inset-0 bg-[#0f172a]/35 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
        role="dialog"
      >
        <div className="max-h-[92vh] overflow-y-auto p-6">
          {/* Header renders straight from the table row while the detail loads. */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-secondary text-[var(--accent-dark)]">
                <UserRound className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("patients.detail.title")}
                </p>
                <h2 id={titleId} className="mt-2 break-words text-2xl font-semibold text-foreground">
                  {patient.firstName} {patient.lastName}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
                    {t(`patients.genders.${patient.gender}`)}
                  </span>
                  <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", getPatientStatusClasses(patient.status))}>
                    {t(`patients.statuses.${patient.status}`)}
                  </span>
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label={t("admin.actions.close")}
              onClick={onClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {isLoading ? (
            <div role="status" className="mt-6 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              {t("patients.detail.loading")}
            </div>
          ) : isError || !data ? (
            <div role="alert" className="mt-6 rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-soft)] p-5 text-sm font-medium text-[var(--danger-ink)]">
              {t("patients.detail.error")}
            </div>
          ) : (
            <>
              <DetailSection title={t("patients.drawer.titles.general")}>
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailItem icon={Phone} label={t("patients.table.columns.phone")} value={data.patient.phone} />
                  <DetailItem icon={Mail} label={t("patients.drawer.fields.email")} value={data.patient.email ?? "-"} />
                  <DetailItem icon={MapPin} label={t("patients.filters.wilaya")} value={data.patient.wilaya} />
                  <DetailItem icon={MapPin} label={t("patients.modal.fields.commune")} value={data.patient.commune} />
                  <DetailItem icon={Fingerprint} label={t("patients.table.columns.nationalId")} value={data.patient.nationalId} />
                  {/* Unknown stays "-": never the "O+" fallback of toPatientViewModel. */}
                  <DetailItem icon={Droplet} label={t("patients.drawer.fields.bloodGroup")} value={data.patient.bloodGroup ? bloodGroupToDisplay[data.patient.bloodGroup] : "-"} />
                  <DetailItem icon={CalendarDays} label={t("patients.table.columns.birthDate")} value={formatPatientDate(data.patient.birthDate, locale, "-")} />
                  <DetailItem icon={FileText} label={t("patients.detail.hospitalRecordNumber")} value={data.patient.hospitalRecordNumber ?? "-"} />
                </div>
              </DetailSection>

              <DetailSection title={t("patients.modal.sections.administrative")}>
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailItem icon={ShieldCheck} label={t("patients.table.columns.administrativeStatus")} value={t(`patients.administrativeStatuses.${data.patient.administrativeStatus}`)} />
                  <DetailItem icon={BadgeCheck} label={t("patients.table.columns.insurance")} value={t(`patients.insurances.${data.patient.insurance}`)} />
                  <DetailItem icon={Landmark} label={t("patients.filters.sector")} value={t(`patients.sectors.${data.patient.sector}`)} />
                </div>
              </DetailSection>

              {data.establishment ? (
                <DetailSection title={t("patients.detail.establishmentTitle")}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailItem icon={Building2} label={t("patients.detail.establishmentName")} value={data.establishment.name} />
                    <DetailItem icon={MapPin} label={t("patients.filters.wilaya")} value={data.establishment.wilaya} />
                    <DetailItem icon={MapPin} label={t("patients.drawer.fields.address")} value={data.establishment.address} />
                    <DetailItem icon={UserRound} label={t("patients.detail.manager")} value={data.establishment.managerFullName} />
                  </div>
                </DetailSection>
              ) : data.doctorProfile ? (
                <DetailSection title={t("patients.table.columns.assignedDoctor")}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailItem icon={UserRound} label={t("patients.table.columns.fullName")} value={data.patient.ownerName} />
                    <DetailItem icon={Stethoscope} label={t("patients.detail.speciality")} value={data.doctorProfile.speciality} />
                    <DetailItem icon={MapPin} label={t("patients.filters.wilaya")} value={data.doctorProfile.wilaya} />
                    <DetailItem icon={MapPin} label={t("patients.detail.professionalAddress")} value={data.doctorProfile.professionalAddress} />
                  </div>
                </DetailSection>
              ) : null}

              <DetailSection title={t("patients.detail.auditTitle")}>
                {data.latestAuditLogs.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    {t("patients.detail.noAuditLogs")}
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-2xl border border-border">
                    {data.latestAuditLogs.map((log) => (
                      <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", toneBadge[getAuditTone(log.action)])}>
                            {getAuditActionLabel(log.action, t)}
                          </span>
                          {/* Entries come from several actors (doctors, staff,
                              admins), unlike a user's own activity. */}
                          <span className="text-xs text-muted-foreground">
                            {log.userName ?? t("admin.common.system")}
                          </span>
                        </div>
                        <time className="text-xs text-muted-foreground" dateTime={log.createdAt}>
                          {formatAdminDateTime(log.createdAt, locale)}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
              </DetailSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
