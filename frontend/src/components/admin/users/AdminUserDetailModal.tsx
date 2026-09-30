"use client";

import {
  BadgeCheck,
  Building2,
  CalendarClock,
  History,
  Mail,
  MapPin,
  Phone,
  PhoneCall,
  Stethoscope,
  Tag,
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
import { VerificationStatusBadge } from "@/components/admin/verifications/VerificationStatusBadge";
import { Button } from "@/components/ui/button";
import { useAdminUserDetail } from "@/features/admin/hooks/use-admin-user-detail";
import { type Locale } from "@/i18n";
import { formatAdminDateTime } from "@/lib/date-format";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type EstablishmentType, type RegisteredUser } from "@/types/admin";
import { ESTABLISHMENT_TYPE_OPTIONS } from "@/types/auth";

import { AdminUserRoleBadge } from "./AdminUserRoleBadge";
import { AdminUserStatusBadge } from "./AdminUserStatusBadge";

type AdminUserDetailModalProps = {
  locale: Locale;
  onClose: () => void;
  t: TranslationFunction;
  user: RegisteredUser | null;
};

// Same palette as the badge styles of AdminAuditLogDetailModal.tsx.
const toneBadge: Record<AuditPresentationTone, string> = {
  danger: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  info: "border-[var(--accent-line)] bg-secondary text-[var(--accent-dark)]",
  success: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
  warning: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
};

// Labels already exist for the registration form (register.establishmentTypes.*).
function getEstablishmentTypeLabel(type: EstablishmentType, t: TranslationFunction) {
  const option = ESTABLISHMENT_TYPE_OPTIONS.find((entry) => entry.value === type);
  return option ? t(`register.establishmentTypes.${option.translationKey}`) : type;
}

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

export function AdminUserDetailModal({
  user,
  ...dialogProps
}: AdminUserDetailModalProps) {
  // Mounted only while a user is targeted; keyed by id so switching users
  // never shows the previous one's details.
  if (!user) {
    return null;
  }

  return <AdminUserDetailDialog key={user.id} user={user} {...dialogProps} />;
}

function AdminUserDetailDialog({
  locale,
  onClose,
  t,
  user,
}: Omit<AdminUserDetailModalProps, "user"> & { user: RegisteredUser }) {
  const titleId = useId();
  const { data, isError, isLoading } = useAdminUserDetail(user.id);
  const yesNo = (value: boolean) => t(value ? "admin.common.yes" : "admin.common.no");

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
                  {t("admin.users.detail.title")}
                </p>
                <h2 id={titleId} className="mt-2 break-words text-2xl font-semibold text-foreground">
                  {user.fullName}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <AdminUserRoleBadge role={user.role} t={t} />
                  <AdminUserStatusBadge status={user.accountStatus} t={t} />
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
              {t("admin.users.detail.loading")}
            </div>
          ) : isError || !data ? (
            <div role="alert" className="mt-6 rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-soft)] p-5 text-sm font-medium text-[var(--danger-ink)]">
              {t("admin.users.detail.error")}
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <DetailItem icon={Mail} label={t("admin.users.table.email")} value={data.user.email} />
                <DetailItem icon={Phone} label={t("admin.users.table.phone")} value={data.user.phone} />
                <DetailItem icon={BadgeCheck} label={t("admin.users.detail.emailVerified")} value={yesNo(data.user.isEmailVerified)} />
                <DetailItem icon={PhoneCall} label={t("admin.users.detail.phoneVerified")} value={yesNo(data.user.isPhoneVerified)} />
                <DetailItem icon={CalendarClock} label={t("admin.users.table.createdAt")} value={formatAdminDateTime(data.user.createdAt, locale)} />
                <DetailItem icon={History} label={t("admin.users.detail.updatedAt")} value={formatAdminDateTime(data.user.updatedAt, locale)} />
              </div>

              {data.establishment ? (
                <DetailSection title={t("admin.users.detail.establishmentTitle")}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailItem icon={Building2} label={t("admin.users.detail.establishmentName")} value={data.establishment.name} />
                    <DetailItem icon={Tag} label={t("admin.users.detail.establishmentType")} value={getEstablishmentTypeLabel(data.establishment.type, t)} />
                    <DetailItem icon={MapPin} label={t("admin.users.detail.wilaya")} value={data.establishment.wilaya} />
                    <DetailItem icon={MapPin} label={t("admin.users.detail.address")} value={data.establishment.address} />
                    <DetailItem icon={UserRound} label={t("admin.users.detail.manager")} value={data.establishment.managerFullName} />
                  </div>
                </DetailSection>
              ) : data.doctorProfile ? (
                <DetailSection title={t("admin.users.detail.doctorProfileTitle")}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailItem icon={Stethoscope} label={t("admin.users.detail.speciality")} value={data.doctorProfile.speciality} />
                    <DetailItem icon={MapPin} label={t("admin.users.detail.wilaya")} value={data.doctorProfile.wilaya} />
                    <DetailItem icon={MapPin} label={t("admin.users.detail.professionalAddress")} value={data.doctorProfile.professionalAddress} />
                  </div>
                </DetailSection>
              ) : null}

              <DetailSection title={t("admin.users.detail.verificationTitle")}>
                {data.verificationSummary ? (
                  <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <dl className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {t("admin.users.detail.verificationType")}
                        </dt>
                        <dd className="mt-1 text-sm font-medium text-foreground">
                          {t(`admin.badges.type.${data.verificationSummary.type}`)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {t("admin.users.detail.submittedAt")}
                        </dt>
                        <dd className="mt-1 text-sm font-medium text-foreground">
                          {data.verificationSummary.submittedAt
                            ? formatAdminDateTime(data.verificationSummary.submittedAt, locale)
                            : "-"}
                        </dd>
                      </div>
                    </dl>
                    <VerificationStatusBadge status={data.verificationSummary.status} t={t} />
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    {t("admin.users.detail.noVerification")}
                  </p>
                )}
              </DetailSection>

              <DetailSection title={t("admin.users.detail.auditTitle")}>
                {data.latestAuditLogs.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    {t("admin.users.detail.noAuditLogs")}
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-2xl border border-border">
                    {data.latestAuditLogs.map((log) => (
                      <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                        <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", toneBadge[getAuditTone(log.action)])}>
                          {getAuditActionLabel(log.action, t)}
                        </span>
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
