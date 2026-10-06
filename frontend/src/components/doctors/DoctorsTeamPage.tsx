"use client";

import { Ban, CircleCheck, Edit3, KeyRound, Mail, Phone, RotateCcw, Stethoscope, TriangleAlert, UserRoundPlus, Users } from "lucide-react";
import { useState } from "react";

import { AddDoctorModal } from "@/components/doctors/AddDoctorModal";
import { EditDoctorModal } from "@/components/doctors/EditDoctorModal";
import { ResetDoctorPasswordModal } from "@/components/doctors/ResetDoctorPasswordModal";
import { ToggleDoctorStatusModal } from "@/components/doctors/ToggleDoctorStatusModal";
import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import { VerificationRequiredNotice } from "@/components/shared/VerificationRequiredNotice";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { type AffiliatedDoctor } from "@/features/doctors/doctors.types";
import { useAffiliatedDoctors } from "@/features/doctors/hooks/use-affiliated-doctors";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type DashboardStatusTone } from "@/types/dashboard";

const teamCopy = {
  fr: {
    added: "Médecin ajouté avec succès.",
    countSuffix: (count: number) => `${count} médecin${count > 1 ? "s" : ""}`,
    edit: "Modifier le profil",
    empty: {
      description: "Ajoutez un premier médecin affilié à votre établissement.",
      title: "Aucun médecin affilié",
    },
    error: {
      description: "Vérifiez votre connexion puis réessayez.",
      retry: "Réessayer",
      title: "Impossible de charger l’équipe médicale",
    },
    loading: "Chargement de l’équipe médicale…",
    new: "Ajouter un médecin",
    passwordReset: "Mot de passe régénéré avec succès.",
    reactivate: "Réactiver",
    reactivated: "Médecin réactivé.",
    resetPassword: "Régénérer le mot de passe",
    statuses: {
      ACTIVE: "Actif",
      BASIC_ACCOUNT: "Compte de base",
      PAYMENT_PENDING: "Paiement en attente",
      PENDING_VERIFICATION: "Vérification en attente",
      REJECTED: "Rejeté",
      SUSPENDED: "Suspendu",
      VERIFIED_NO_PLAN: "Vérifié, sans abonnement",
    },
    subtitle: "Médecins affiliés à votre établissement.",
    suspend: "Suspendre",
    suspended: "Médecin suspendu.",
    title: "Équipe médicale",
    updated: "Profil du médecin mis à jour.",
  },
  ar: {
    added: "تمت إضافة الطبيب بنجاح.",
    countSuffix: (count: number) => `${count} طبيب`,
    edit: "تعديل الملف",
    empty: {
      description: "أضف أول طبيب منتسب إلى مؤسستك.",
      title: "لا يوجد أي طبيب منتسب",
    },
    error: {
      description: "تحقق من الاتصال ثم أعد المحاولة.",
      retry: "إعادة المحاولة",
      title: "تعذر تحميل الفريق الطبي",
    },
    loading: "جارٍ تحميل الفريق الطبي…",
    new: "إضافة طبيب",
    passwordReset: "تمت إعادة تعيين كلمة المرور بنجاح.",
    reactivate: "إعادة تفعيل",
    reactivated: "تمت إعادة تفعيل الطبيب.",
    resetPassword: "إعادة تعيين كلمة المرور",
    statuses: {
      ACTIVE: "نشط",
      BASIC_ACCOUNT: "حساب أساسي",
      PAYMENT_PENDING: "الدفع قيد الانتظار",
      PENDING_VERIFICATION: "التحقق قيد الانتظار",
      REJECTED: "مرفوض",
      SUSPENDED: "موقوف",
      VERIFIED_NO_PLAN: "تم التحقق، بدون اشتراك",
    },
    subtitle: "الأطباء المنتسبون إلى مؤسستك.",
    suspend: "إيقاف",
    suspended: "تم إيقاف الطبيب.",
    title: "الفريق الطبي",
    updated: "تم تحديث ملف الطبيب.",
  },
} as const;

const statusTone: Record<string, DashboardStatusTone> = {
  ACTIVE: "success",
  BASIC_ACCOUNT: "neutral",
  PAYMENT_PENDING: "warning",
  PENDING_VERIFICATION: "warning",
  REJECTED: "danger",
  SUSPENDED: "danger",
  VERIFIED_NO_PLAN: "info",
};

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return `${first}${last}`.toLocaleUpperCase() || "?";
}

function SkeletonBlock({ className }: { className: string }) {
  return <span className={cn("block animate-pulse rounded-[var(--radius-xs)] bg-[var(--surface-muted)]", className)} />;
}

export function DoctorsTeamPage() {
  const { locale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const prefill = useEstablishmentVerificationPrefill();
  const initials = getAccountInitials(currentUser.data?.fullName);
  const copy = teamCopy[locale];
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [editTarget, setEditTarget] = useState<AffiliatedDoctor | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: string; fullName: string } | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ id: string; fullName: string; action: "suspend" | "reactivate" } | null>(null);
  const { data: doctors, error, isError, isLoading, refetch } = useAffiliatedDoctors();

  const list = doctors ?? [];
  const hasData = doctors !== undefined;

  const shellProps = {
    accountType: "ESTABLISHMENT" as const,
    navSections: establishmentNavSections,
    titleKey: "dashboard.clinical.nav.team",
    user: { accountType: "ESTABLISHMENT" as const, footerSubtitle: t("dashboard.clinical.administration"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.administration"), roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: prefill.data?.establishment.name || t("dashboard.clinical.workspace") },
  };

  return (
    <DashboardShell {...shellProps} activeKey="doctors">
      <div className="workspace-stack">
        <header className="workspace-intro">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-medium text-[var(--medical)]">{copy.title}</p>
            <h1 className="break-words">{copy.title}</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {copy.subtitle}
              {hasData ? <> · {copy.countSuffix(list.length)}</> : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="clinical-button clinical-button-primary" onClick={() => setCreateOpen(true)}>
              <UserRoundPlus size={16} strokeWidth={1.8} aria-hidden="true" />
              {copy.new}
            </button>
          </div>
        </header>

        <section className="surface-section overflow-hidden" aria-labelledby="doctors-team-heading">
          <div className="clinical-section-heading border-b border-[var(--line-soft)]">
            <div>
              <h2 id="doctors-team-heading" className="sr-only">{copy.title}</h2>
            </div>
          </div>

          {isLoading ? (
            <>
              <p className="sr-only" role="status">{copy.loading}</p>
              <ol aria-hidden="true">
                {Array.from({ length: 3 }, (_, index) => (
                  <li key={index} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4", index > 0 && "border-t border-[var(--line-soft)]")}>
                    <div className="flex items-center gap-3">
                      <SkeletonBlock className="h-9 w-9 shrink-0" />
                      <div className="w-full space-y-2"><SkeletonBlock className="h-3.5 w-2/5" /><SkeletonBlock className="h-2.5 w-1/4" /></div>
                    </div>
                    <SkeletonBlock className="h-6 w-20 rounded-full" />
                  </li>
                ))}
              </ol>
            </>
          ) : isError && isVerificationRequiredError(error) ? (
            <div className="p-5">
              <VerificationRequiredNotice accountType="ESTABLISHMENT" t={t} />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center px-6 py-14 text-center" role="alert">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger-ink)]">
                <TriangleAlert size={22} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-sm font-semibold">{copy.error.title}</h3>
              <p className="clinical-caption mt-1 max-w-sm">{copy.error.description}</p>
              <button type="button" className="clinical-button mt-5" onClick={() => { void refetch(); }}>
                <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
                {copy.error.retry}
              </button>
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--medical-soft)] text-[var(--medical)]">
                <Users size={22} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-sm font-semibold">{copy.empty.title}</h3>
              <p className="clinical-caption mt-1 max-w-sm">{copy.empty.description}</p>
              <button type="button" className="clinical-button clinical-button-primary mt-5" onClick={() => setCreateOpen(true)}>
                <UserRoundPlus size={16} strokeWidth={1.8} aria-hidden="true" />
                {copy.new}
              </button>
            </div>
          ) : (
            <ol>
              {list.map((doctor, index) => (
                <li key={doctor.id} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4", index > 0 && "border-t border-[var(--line-soft)]")}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[.7rem] font-semibold text-[var(--medical)]">
                      {getInitials(doctor.fullName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{doctor.fullName}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
                        <span className="inline-flex items-center gap-1.5"><Stethoscope size={13} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />{doctor.speciality} · {doctor.wilaya}</span>
                        <span className="inline-flex items-center gap-1.5"><Mail size={13} strokeWidth={1.8} className="shrink-0" aria-hidden="true" /><bdi dir="ltr">{doctor.email}</bdi></span>
                        <span className="inline-flex items-center gap-1.5"><Phone size={13} strokeWidth={1.8} className="shrink-0" aria-hidden="true" /><bdi dir="ltr">{doctor.phone}</bdi></span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      label={copy.statuses[doctor.accountStatus as keyof typeof copy.statuses] ?? doctor.accountStatus}
                      tone={statusTone[doctor.accountStatus] ?? "neutral"}
                    />
                    <button
                      type="button"
                      className="clinical-icon-button"
                      onClick={() => setEditTarget(doctor)}
                      aria-label={copy.edit}
                      title={copy.edit}
                    >
                      <Edit3 size={16} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="clinical-icon-button"
                      onClick={() => setResetTarget({ id: doctor.id, fullName: doctor.fullName })}
                      aria-label={copy.resetPassword}
                      title={copy.resetPassword}
                    >
                      <KeyRound size={16} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                    {doctor.accountStatus === "SUSPENDED" ? (
                      <button
                        type="button"
                        className="clinical-icon-button"
                        onClick={() => setStatusTarget({ id: doctor.id, fullName: doctor.fullName, action: "reactivate" })}
                        aria-label={copy.reactivate}
                        title={copy.reactivate}
                      >
                        <RotateCcw size={16} strokeWidth={1.8} aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="clinical-icon-button"
                        onClick={() => setStatusTarget({ id: doctor.id, fullName: doctor.fullName, action: "suspend" })}
                        aria-label={copy.suspend}
                        title={copy.suspend}
                      >
                        <Ban size={16} strokeWidth={1.8} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div role="status" aria-live="polite">
        {notice ? (
          <div className="surface-raised fixed bottom-6 end-6 z-40 flex items-center gap-2.5 border-[var(--success-line)] px-4 py-3 text-sm font-medium text-[var(--text-primary)]">
            <CircleCheck size={17} strokeWidth={1.8} className="shrink-0 text-[var(--success-ink)]" aria-hidden="true" />
            {notice}
          </div>
        ) : null}
      </div>

      <AddDoctorModal
        direction={direction}
        isOpen={isCreateOpen}
        locale={locale}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setNotice(copy.added);
          window.setTimeout(() => setNotice(""), 3200);
        }}
      />

      <EditDoctorModal
        direction={direction}
        doctor={editTarget}
        isOpen={editTarget !== null}
        locale={locale}
        onClose={() => setEditTarget(null)}
        onUpdated={() => {
          setNotice(copy.updated);
          window.setTimeout(() => setNotice(""), 3200);
        }}
      />

      <ResetDoctorPasswordModal
        direction={direction}
        doctorId={resetTarget?.id ?? ""}
        doctorName={resetTarget?.fullName ?? ""}
        isOpen={resetTarget !== null}
        locale={locale}
        onClose={() => setResetTarget(null)}
        onReset={() => {
          setNotice(copy.passwordReset);
          window.setTimeout(() => setNotice(""), 3200);
        }}
      />

      <ToggleDoctorStatusModal
        action={statusTarget?.action ?? "suspend"}
        direction={direction}
        doctorId={statusTarget?.id ?? ""}
        doctorName={statusTarget?.fullName ?? ""}
        isOpen={statusTarget !== null}
        locale={locale}
        onClose={() => setStatusTarget(null)}
        onDone={() => {
          setNotice(statusTarget?.action === "reactivate" ? copy.reactivated : copy.suspended);
          window.setTimeout(() => setNotice(""), 3200);
        }}
      />
    </DashboardShell>
  );
}
