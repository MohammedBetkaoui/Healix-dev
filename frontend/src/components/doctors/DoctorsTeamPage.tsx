"use client";

import {
  Ban,
  Building2,
  CircleCheck,
  Edit3,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  Search,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
  UserCheck,
  UserRoundPlus,
  Users,
  UserX,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AddDoctorModal } from "@/components/doctors/AddDoctorModal";
import { EditDoctorModal } from "@/components/doctors/EditDoctorModal";
import { ResetDoctorPasswordModal } from "@/components/doctors/ResetDoctorPasswordModal";
import { ToggleDoctorStatusModal } from "@/components/doctors/ToggleDoctorStatusModal";
import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import { VerificationRequiredNotice } from "@/components/shared/VerificationRequiredNotice";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { type AffiliatedDoctor } from "@/features/doctors/doctors.types";
import { useAffiliatedDoctors } from "@/features/doctors/hooks/use-affiliated-doctors";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type DashboardStatusTone } from "@/types/dashboard";

const teamCopy = {
  fr: {
    access: "Réinitialiser l’accès",
    added: "Médecin ajouté avec succès.",
    allStatuses: "Tous les statuts",
    directory: "Répertoire médical",
    directoryBadge: "Répertoire professionnel sécurisé",
    directoryNote: "Gestion centralisée des profils et des habilitations de votre équipe.",
    email: "E-mail",
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
    filterLabel: "Statut du compte",
    loading: "Chargement de l’équipe médicale…",
    metrics: {
      active: "Comptes actifs",
      activeNote: "habilités à accéder à la plateforme",
      specialties: "Spécialités",
      specialtiesNote: "expertises représentées dans l’équipe",
      suspended: "Accès suspendus",
      suspendedNote: "comptes temporairement désactivés",
      total: "Médecins affiliés",
      totalNote: "professionnels rattachés à l’établissement",
    },
    new: "Ajouter un médecin",
    noResults: {
      description: "Modifiez la recherche ou le filtre de statut pour afficher d’autres profils.",
      reset: "Réinitialiser les filtres",
      title: "Aucun profil ne correspond",
    },
    passwordReset: "Mot de passe régénéré avec succès.",
    phone: "Téléphone",
    professionalAddress: "Adresse professionnelle",
    reactivate: "Réactiver",
    reactivated: "Médecin réactivé.",
    resetPassword: "Régénérer le mot de passe",
    results: (visible: number, total: number) => `${visible} profil${visible !== 1 ? "s" : ""} affiché${visible !== 1 ? "s" : ""} sur ${total}`,
    searchLabel: "Rechercher un professionnel",
    searchPlaceholder: "Nom, spécialité, wilaya, e-mail ou téléphone…",
    statuses: {
      ACTIVE: "Actif",
      BASIC_ACCOUNT: "Compte de base",
      PAYMENT_PENDING: "Paiement en attente",
      PENDING_VERIFICATION: "Vérification en attente",
      REJECTED: "Rejeté",
      SUSPENDED: "Suspendu",
      VERIFIED_NO_PLAN: "Vérifié, sans abonnement",
    },
    subtitle: "Supervisez les professionnels affiliés, leurs coordonnées et leurs droits d’accès depuis un espace unique et traçable.",
    suspend: "Suspendre",
    suspended: "Médecin suspendu.",
    title: "Équipe médicale",
    updated: "Profil du médecin mis à jour.",
  },
  ar: {
    access: "إعادة ضبط الوصول",
    added: "تمت إضافة الطبيب بنجاح.",
    allStatuses: "جميع الحالات",
    directory: "الدليل الطبي",
    directoryBadge: "دليل مهني آمن",
    directoryNote: "إدارة مركزية لملفات فريقك وصلاحيات الوصول.",
    email: "البريد الإلكتروني",
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
    filterLabel: "حالة الحساب",
    loading: "جارٍ تحميل الفريق الطبي…",
    metrics: {
      active: "الحسابات النشطة",
      activeNote: "مصرح لها بالوصول إلى المنصة",
      specialties: "التخصصات",
      specialtiesNote: "الخبرات الممثلة ضمن الفريق",
      suspended: "الوصول الموقوف",
      suspendedNote: "حسابات معطلة مؤقتاً",
      total: "الأطباء المنتسبون",
      totalNote: "مهنيون تابعون للمؤسسة",
    },
    new: "إضافة طبيب",
    noResults: {
      description: "غيّر البحث أو مرشح الحالة لعرض ملفات أخرى.",
      reset: "إعادة ضبط المرشحات",
      title: "لا يوجد ملف مطابق",
    },
    passwordReset: "تمت إعادة تعيين كلمة المرور بنجاح.",
    phone: "الهاتف",
    professionalAddress: "العنوان المهني",
    reactivate: "إعادة تفعيل",
    reactivated: "تمت إعادة تفعيل الطبيب.",
    resetPassword: "إعادة تعيين كلمة المرور",
    results: (visible: number, total: number) => `عرض ${visible} من أصل ${total} ملف`,
    searchLabel: "البحث عن مهني",
    searchPlaceholder: "الاسم، التخصص، الولاية، البريد أو الهاتف…",
    statuses: {
      ACTIVE: "نشط",
      BASIC_ACCOUNT: "حساب أساسي",
      PAYMENT_PENDING: "الدفع قيد الانتظار",
      PENDING_VERIFICATION: "التحقق قيد الانتظار",
      REJECTED: "مرفوض",
      SUSPENDED: "موقوف",
      VERIFIED_NO_PLAN: "تم التحقق، بدون اشتراك",
    },
    subtitle: "أشرف على المهنيين المنتسبين وبياناتهم وصلاحيات وصولهم من مساحة موحدة وقابلة للتتبع.",
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editTarget, setEditTarget] = useState<AffiliatedDoctor | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: string; fullName: string } | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ id: string; fullName: string; action: "suspend" | "reactivate" } | null>(null);
  const { data: doctors, error, isError, isLoading, refetch } = useAffiliatedDoctors();

  const list = useMemo(() => doctors ?? [], [doctors]);
  const hasData = doctors !== undefined;
  const numberLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const activeCount = list.filter((doctor) => doctor.accountStatus === "ACTIVE").length;
  const suspendedCount = list.filter((doctor) => doctor.accountStatus === "SUSPENDED").length;
  const specialtyCount = new Set(list.map((doctor) => doctor.speciality.trim().toLocaleLowerCase()).filter(Boolean)).size;
  const availableStatuses = useMemo(
    () => Array.from(new Set(list.map((doctor) => doctor.accountStatus))).sort((first, second) => {
      const firstLabel = copy.statuses[first as keyof typeof copy.statuses] ?? first;
      const secondLabel = copy.statuses[second as keyof typeof copy.statuses] ?? second;
      return firstLabel.localeCompare(secondLabel, locale);
    }),
    [copy, list, locale],
  );
  const filteredDoctors = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return list.filter((doctor) => {
      if (statusFilter && doctor.accountStatus !== statusFilter) return false;
      if (!query) return true;
      return [doctor.fullName, doctor.speciality, doctor.wilaya, doctor.email, doctor.phone, doctor.professionalAddress]
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [list, search, statusFilter]);
  const hasFilters = Boolean(search.trim() || statusFilter);

  const shellProps = {
    accountType: "ESTABLISHMENT" as const,
    navSections: establishmentNavSections,
    titleKey: "dashboard.clinical.nav.team",
    user: { accountType: "ESTABLISHMENT" as const, footerSubtitle: t("dashboard.clinical.administration"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.administration"), roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: prefill.data?.establishment.name || t("dashboard.clinical.workspace") },
  };

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("");
  };

  return (
    <DashboardShell {...shellProps} activeKey="doctors">
      <div className="space-y-6">
        <section className="surface-section surface-raised relative overflow-hidden border-t-2 border-t-[var(--medical)]">
          <div className="grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-7">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--medical-soft)] text-[var(--medical)] ring-1 ring-[var(--accent-line)]">
                <Users className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--medical)]">
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                  {copy.directoryBadge}
                </span>
                <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-[1.75rem]">{copy.title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">{copy.subtitle}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button type="button" className="clinical-button clinical-button-primary px-4" onClick={() => setCreateOpen(true)}>
                <UserRoundPlus size={16} strokeWidth={1.8} aria-hidden="true" />
                {copy.new}
              </button>
            </div>
          </div>

          <dl className="grid border-t border-[var(--line)] bg-[var(--panel-soft)] sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-center gap-3 px-5 py-4 sm:border-e sm:border-[var(--line)] lg:px-7">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--panel)] text-[var(--institutional)] ring-1 ring-[var(--line)]"><Users className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /></span>
              <div className="min-w-0"><dd className="clinical-figure text-lg font-semibold text-[var(--ink)]">{hasData ? list.length.toLocaleString(numberLocale) : "—"}</dd><dt className="text-xs font-medium text-[var(--ink)]">{copy.metrics.total}</dt><p className="mt-0.5 text-[0.68rem] text-[var(--ink-faint)]">{copy.metrics.totalNote}</p></div>
            </div>
            <div className="flex items-center gap-3 border-t border-[var(--line)] px-5 py-4 sm:border-t-0 xl:border-e lg:px-7">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--success-soft)] text-[var(--success-ink)] ring-1 ring-[var(--success-line)]"><UserCheck className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /></span>
              <div className="min-w-0"><dd className="clinical-figure text-lg font-semibold text-[var(--ink)]">{hasData ? activeCount.toLocaleString(numberLocale) : "—"}</dd><dt className="text-xs font-medium text-[var(--ink)]">{copy.metrics.active}</dt><p className="mt-0.5 text-[0.68rem] text-[var(--ink-faint)]">{copy.metrics.activeNote}</p></div>
            </div>
            <div className="flex items-center gap-3 border-t border-[var(--line)] px-5 py-4 sm:border-e sm:border-[var(--line)] xl:border-t-0 lg:px-7">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent-dark)] ring-1 ring-[var(--accent-line)]"><Stethoscope className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /></span>
              <div className="min-w-0"><dd className="clinical-figure text-lg font-semibold text-[var(--ink)]">{hasData ? specialtyCount.toLocaleString(numberLocale) : "—"}</dd><dt className="text-xs font-medium text-[var(--ink)]">{copy.metrics.specialties}</dt><p className="mt-0.5 text-[0.68rem] text-[var(--ink-faint)]">{copy.metrics.specialtiesNote}</p></div>
            </div>
            <div className="flex items-center gap-3 border-t border-[var(--line)] px-5 py-4 xl:border-t-0 lg:px-7">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--danger-soft)] text-[var(--danger-ink)] ring-1 ring-[var(--danger-line)]"><UserX className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /></span>
              <div className="min-w-0"><dd className="clinical-figure text-lg font-semibold text-[var(--ink)]">{hasData ? suspendedCount.toLocaleString(numberLocale) : "—"}</dd><dt className="text-xs font-medium text-[var(--ink)]">{copy.metrics.suspended}</dt><p className="mt-0.5 text-[0.68rem] text-[var(--ink-faint)]">{copy.metrics.suspendedNote}</p></div>
            </div>
          </dl>
        </section>

        <section className="surface-section p-4 sm:p-5" aria-label={copy.searchLabel}>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(13rem,0.32fr)] md:items-end">
            <label className="min-w-0">
              <span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--ink-soft)]">{copy.searchLabel}</span>
              <span className="relative block">
                <Search className="pointer-events-none absolute start-3.5 top-3.5 h-4 w-4 text-[var(--ink-faint)]" strokeWidth={1.8} aria-hidden="true" />
                <input
                  className="h-11 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] pe-4 ps-10 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                  type="search"
                />
              </span>
            </label>
            <label>
              <span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--ink-soft)]">{copy.filterLabel}</span>
              <select
                className="h-11 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">{copy.allStatuses}</option>
                {availableStatuses.map((status) => (
                  <option key={status} value={status}>{copy.statuses[status as keyof typeof copy.statuses] ?? status}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="surface-section overflow-hidden" aria-labelledby="doctors-team-heading">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]">
                <Stethoscope className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="doctors-team-heading" className="text-base font-semibold text-[var(--ink)]">{copy.directory}</h2>
                <p className="mt-0.5 text-xs text-[var(--ink-faint)]">{hasData ? copy.results(filteredDoctors.length, list.length) : copy.loading}</p>
              </div>
            </div>
            <p className="hidden max-w-md items-center gap-2 text-xs text-[var(--ink-faint)] lg:flex">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />
              {copy.directoryNote}
            </p>
          </header>

          {isLoading ? (
            <>
              <p className="sr-only" role="status">{copy.loading}</p>
              <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-2" aria-hidden="true">
                {Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)] p-5">
                    <div className="flex items-center gap-3"><SkeletonBlock className="h-11 w-11 shrink-0 rounded-full" /><div className="w-full space-y-2"><SkeletonBlock className="h-3.5 w-2/5" /><SkeletonBlock className="h-2.5 w-1/4" /></div><SkeletonBlock className="h-6 w-20 rounded-full" /></div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2"><SkeletonBlock className="h-10 w-full" /><SkeletonBlock className="h-10 w-full" /><SkeletonBlock className="h-10 w-full sm:col-span-2" /></div>
                    <div className="mt-5 flex gap-2 border-t border-[var(--line-soft)] pt-4"><SkeletonBlock className="h-10 w-28" /><SkeletonBlock className="h-10 w-36" /></div>
                  </div>
                ))}
              </div>
            </>
          ) : isError && isVerificationRequiredError(error) ? (
            <div className="p-5"><VerificationRequiredNotice accountType="ESTABLISHMENT" t={t} /></div>
          ) : isError ? (
            <div className="flex flex-col items-center px-6 py-16 text-center" role="alert">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger-ink)]"><TriangleAlert size={22} strokeWidth={1.8} aria-hidden="true" /></span>
              <h3 className="mt-4 text-sm font-semibold">{copy.error.title}</h3>
              <p className="clinical-caption mt-1 max-w-sm">{copy.error.description}</p>
              <button type="button" className="clinical-button mt-5" onClick={() => { void refetch(); }}><RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />{copy.error.retry}</button>
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--medical-soft)] text-[var(--medical)]"><Users size={22} strokeWidth={1.8} aria-hidden="true" /></span>
              <h3 className="mt-4 text-sm font-semibold">{copy.empty.title}</h3>
              <p className="clinical-caption mt-1 max-w-sm">{copy.empty.description}</p>
              <button type="button" className="clinical-button clinical-button-primary mt-5" onClick={() => setCreateOpen(true)}><UserRoundPlus size={16} strokeWidth={1.8} aria-hidden="true" />{copy.new}</button>
            </div>
          ) : filteredDoctors.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-dark)]"><Search size={21} strokeWidth={1.8} aria-hidden="true" /></span>
              <h3 className="mt-4 text-sm font-semibold">{copy.noResults.title}</h3>
              <p className="clinical-caption mt-1 max-w-md">{copy.noResults.description}</p>
              {hasFilters ? <button type="button" className="clinical-button mt-5" onClick={resetFilters}><RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />{copy.noResults.reset}</button> : null}
            </div>
          ) : (
            <ol className="grid gap-4 p-4 sm:p-5 xl:grid-cols-2">
              {filteredDoctors.map((doctor) => (
                <li key={doctor.id} className="min-w-0">
                  <article className="flex h-full flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)] transition duration-200 hover:border-[var(--accent-line)] hover:shadow-[var(--shadow-raised)]">
                    <div className="flex min-w-0 items-start gap-3 border-b border-[var(--line-soft)] px-4 py-4 sm:px-5">
                      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--medical-soft)] text-xs font-semibold text-[var(--medical)] ring-1 ring-[var(--accent-line)]">{getInitials(doctor.fullName)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--ink)]">{doctor.fullName}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ink-soft)]">
                          <span className="inline-flex min-w-0 items-center gap-1.5"><Stethoscope size={13} strokeWidth={1.8} className="shrink-0 text-[var(--medical)]" aria-hidden="true" /><span className="truncate">{doctor.speciality}</span></span>
                          <span className="inline-flex min-w-0 items-center gap-1.5"><MapPin size={13} strokeWidth={1.8} className="shrink-0 text-[var(--ink-faint)]" aria-hidden="true" /><span className="truncate">{doctor.wilaya}</span></span>
                        </p>
                      </div>
                      <StatusBadge label={copy.statuses[doctor.accountStatus as keyof typeof copy.statuses] ?? doctor.accountStatus} tone={statusTone[doctor.accountStatus] ?? "neutral"} />
                    </div>

                    <dl className="grid flex-1 gap-x-5 gap-y-4 px-4 py-5 sm:grid-cols-2 sm:px-5">
                      <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--ink-faint)]"><Mail size={13} strokeWidth={1.8} aria-hidden="true" />{copy.email}</dt>
                        <dd className="mt-1 truncate text-sm text-[var(--ink-soft)]" title={doctor.email}><bdi dir="ltr">{doctor.email}</bdi></dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--ink-faint)]"><Phone size={13} strokeWidth={1.8} aria-hidden="true" />{copy.phone}</dt>
                        <dd className="mt-1 text-sm text-[var(--ink-soft)]"><bdi dir="ltr">{doctor.phone}</bdi></dd>
                      </div>
                      <div className="min-w-0 sm:col-span-2">
                        <dt className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--ink-faint)]"><Building2 size={13} strokeWidth={1.8} aria-hidden="true" />{copy.professionalAddress}</dt>
                        <dd className="mt-1 text-sm leading-5 text-[var(--ink-soft)]">{doctor.professionalAddress}</dd>
                      </div>
                    </dl>

                    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line-soft)] bg-[var(--panel-soft)] px-4 py-3 sm:px-5">
                      <button type="button" className="clinical-button min-h-10" onClick={() => setEditTarget(doctor)}><Edit3 size={15} strokeWidth={1.8} aria-hidden="true" />{copy.edit}</button>
                      <button type="button" className="clinical-button min-h-10" onClick={() => setResetTarget({ id: doctor.id, fullName: doctor.fullName })} title={copy.resetPassword}><KeyRound size={15} strokeWidth={1.8} aria-hidden="true" />{copy.access}</button>
                      {doctor.accountStatus === "SUSPENDED" ? (
                        <button type="button" className="clinical-button min-h-10 border-[var(--success-line)] text-[var(--success-ink)]" onClick={() => setStatusTarget({ id: doctor.id, fullName: doctor.fullName, action: "reactivate" })}><RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />{copy.reactivate}</button>
                      ) : (
                        <button type="button" className="clinical-button min-h-10 border-[var(--danger-line)] text-[var(--danger-ink)]" onClick={() => setStatusTarget({ id: doctor.id, fullName: doctor.fullName, action: "suspend" })}><Ban size={15} strokeWidth={1.8} aria-hidden="true" />{copy.suspend}</button>
                      )}
                    </div>
                  </article>
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
