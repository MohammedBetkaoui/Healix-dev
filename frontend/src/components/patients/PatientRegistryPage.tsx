"use client";

import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Columns3,
  Download,
  Info,
  LockKeyhole,
  MessageSquareText,
  MoreHorizontal,
  Phone,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { AddPatientModal } from "@/components/patients/AddPatientModal";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { usePatients } from "@/features/patients/hooks/use-patients";
import {
  algerianWilayas,
  patientAdministrativeStatusValues,
  patientGenderValues,
  patientInsuranceValues,
  patientSectorValues,
} from "@/features/patients/patients.constants";
import {
  formatAlgerianPhone,
  formatPatientDate,
  getPatientAge,
  patientMatchesSearch,
} from "@/features/patients/patient-registry";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type Patient } from "@/types/patient";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { VerificationRequiredNotice } from "@/components/shared/VerificationRequiredNotice";
import { doctorNavSections, establishmentNavSections } from "@/components/dashboard/layout/navigation";

type PatientRegistryPageProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
};

type OptionalColumn = "nin" | "gender" | "insurance" | "location" | "doctor" | "visits";

type RegistryFilterState = {
  administrativeStatus: string;
  gender: string;
  insurance: string;
  sector: string;
  wilaya: string;
};

const initialFilters: RegistryFilterState = {
  administrativeStatus: "",
  gender: "",
  insurance: "",
  sector: "",
  wilaya: "",
};

const initialColumns: Record<OptionalColumn, boolean> = {
  doctor: true,
  gender: true,
  insurance: true,
  location: true,
  nin: true,
  visits: true,
};

const registryCopy = {
  fr: {
    actions: { columns: "Colonnes", export: "Exporter", filters: "Filtres", import: "Importer", new: "Nouveau patient" },
    columns: { doctor: "Médecin référent", gender: "Sexe", insurance: "Assurance", location: "Wilaya / Commune", nin: "N° identification nationale", visits: "Visites" },
    demo: "Accès limité aux personnels habilités. Les consultations et actions sont journalisées conformément à la Loi 18-07.",
    empty: "Aucun patient ne correspond à ces critères.",
    filterTitle: "Affiner le registre",
    headerBadge: "Référentiel patient sécurisé",
    importReady: "Fichier prêt pour validation avant import.",
    loadMore: "Charger les patients suivants",
    loaded: (visible: number, total: number) => `${visible} sur ${total} lignes chargées progressivement`,
    metrics: {
      active: "Dossiers actifs",
      activeNote: "dans les résultats chargés",
      coverage: "Sous couverture",
      coverageNote: "CNAS, CASNOS ou privée",
      total: "Dossiers patients",
      totalNote: "périmètre de votre organisation",
    },
    reset: "Réinitialiser",
    results: "Résultats du registre",
    searchHelp: "Tolérant aux variantes de translittération : Mohamed / Mohammed, Benali / Ben Ali. Recherche en arabe prise en charge.",
    searchLabel: "Recherche patient",
    searchPlaceholder: "Nom, ID patient, téléphone, NIN, naissance ou n° dossier hospitalier…",
    subtitle: "Pilotez l’identité, la couverture et le suivi administratif depuis un registre clinique unique, sécurisé et traçable.",
    title: "Registre des patients",
  },
  ar: {
    actions: { columns: "الأعمدة", export: "تصدير", filters: "الفلاتر", import: "استيراد", new: "مريض جديد" },
    columns: { doctor: "الطبيب المرجعي", gender: "الجنس", insurance: "التأمين", location: "الولاية / البلدية", nin: "رقم التعريف الوطني", visits: "الزيارات" },
    demo: "الوصول مقتصر على الموظفين المخولين. يتم تسجيل عمليات الاطلاع والإجراءات وفق القانون 18-07.",
    empty: "لا يوجد مريض مطابق لهذه المعايير.",
    filterTitle: "تصفية السجل",
    headerBadge: "مرجع مرضى آمن",
    importReady: "الملف جاهز للتحقق قبل الاستيراد.",
    loadMore: "تحميل المرضى التاليين",
    loaded: (visible: number, total: number) => `تم تحميل ${visible} من ${total} سطراً تدريجياً`,
    metrics: {
      active: "الملفات النشطة",
      activeNote: "ضمن النتائج المحملة",
      coverage: "تحت التغطية",
      coverageNote: "CNAS أو CASNOS أو خاصة",
      total: "ملفات المرضى",
      totalNote: "ضمن نطاق مؤسستك",
    },
    reset: "إعادة الضبط",
    results: "نتائج السجل",
    searchHelp: "يدعم اختلافات كتابة الأسماء بالحروف اللاتينية والبحث باللغة العربية.",
    searchLabel: "البحث عن مريض",
    searchPlaceholder: "الاسم، رقم المريض، الهاتف، رقم التعريف، الميلاد أو رقم الملف…",
    subtitle: "أدِر الهوية والتغطية والمتابعة الإدارية من سجل سريري موحّد وآمن وقابل للتتبع.",
    title: "سجل المرضى",
  },
} as const;

function getInitials(patient: Patient, locale: "fr" | "ar") {
  const first = locale === "ar" ? patient.firstNameAr : patient.firstName;
  const last = locale === "ar" ? patient.lastNameAr : patient.lastName;
  return `${first.at(0) ?? ""}${last.at(0) ?? ""}`;
}

function getDisplayName(patient: Patient, locale: "fr" | "ar") {
  return locale === "ar"
    ? `${patient.firstNameAr} ${patient.lastNameAr}`
    : `${patient.firstName} ${patient.lastName}`;
}

function statusClass(status: Patient["administrativeStatus"]) {
  if (status === "ACTIVE") return "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]";
  if (status === "DECEASED") return "border-[var(--line)] bg-muted text-[var(--ink-soft)]";
  return "border-[var(--line)] bg-muted text-[var(--ink-soft)]";
}

function RegistrySelect({ label, value, onChange, children }: {
  children: React.ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-[0.7rem] font-semibold text-[var(--ink-soft)]">{label}</span>
      <select className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]" value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
    </label>
  );
}

function PatientActions({ direction, patient, onOpen, label }: {
  direction: "ltr" | "rtl";
  label: string;
  onOpen: () => void;
  patient: Patient;
}) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!isOpen) return;

    const close = () => setOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    const focusFrame = window.requestAnimationFrame(() => menuRef.current?.querySelector("button")?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [isOpen]);

  const toggleMenu = () => {
    if (isOpen) {
      setOpen(false);
      return;
    }

    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = 52;
    const gap = 6;
    const preferredLeft = direction === "rtl" ? rect.left : rect.right - menuWidth;
    const left = Math.min(window.innerWidth - menuWidth - 8, Math.max(8, preferredLeft));
    const top = window.innerHeight - rect.bottom >= menuHeight + gap
      ? rect.bottom + gap
      : rect.top - menuHeight - gap;

    setPosition({ left, top: Math.max(8, top) });
    setOpen(true);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-transparent text-[var(--ink-faint)] transition hover:border-[var(--line)] hover:bg-[var(--panel-soft)] hover:text-[var(--accent-dark)]"
        aria-label={`${label} ${patient.id}`}
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          toggleMenu();
        }}
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
      </button>
      {isOpen && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          dir={direction}
          className="dashboard-theme clinical-theme fixed z-[80] w-48 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)] p-1.5 shadow-[var(--shadow-raised)]"
          style={position}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="w-full rounded-[var(--radius-sm)] px-3 py-2.5 text-start text-sm font-medium text-[var(--ink-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpen();
            }}
          >
            {label}
          </button>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

export function PatientRegistryPage({ accountType }: PatientRegistryPageProps) {
  const router = useRouter();
  const { locale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  // Establishment name for the workspace subtitle; skipped for doctor
  // accounts (ESTABLISHMENT_ADMIN-only endpoint).
  const prefill = useEstablishmentVerificationPrefill({ enabled: accountType === "ESTABLISHMENT" });
  const initials = getAccountInitials(currentUser.data?.fullName);
  const copy = registryCopy[locale];
  const { data, error, isError, isLoading } = usePatients({ limit: 100 });
  const patients = useMemo(() => data?.data ?? [], [data?.data]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [columns, setColumns] = useState(initialColumns);
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [isAddOpen, setAddOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);
  const [notice, setNotice] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const basePath = accountType === "ESTABLISHMENT" ? "/establishment/patients" : "/doctor/patients";

  const filteredPatients = useMemo(() => patients.filter((patient) => {
    if (!patientMatchesSearch(patient, search)) return false;
    if (filters.gender && patient.gender !== filters.gender) return false;
    if (filters.administrativeStatus && patient.administrativeStatus !== filters.administrativeStatus) return false;
    if (filters.insurance && patient.insurance !== filters.insurance) return false;
    if (filters.sector && patient.sector !== filters.sector) return false;
    if (filters.wilaya && patient.wilayaCode !== filters.wilaya) return false;
    return true;
  }), [filters, patients, search]);

  const visiblePatients = filteredPatients.slice(0, visibleCount);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const totalPatients = data?.meta.total ?? patients.length;
  const activePatients = patients.filter((patient) => patient.administrativeStatus === "ACTIVE").length;
  const coveredPatients = patients.filter((patient) => patient.insurance !== "UNINSURED").length;

  const openPatient = (patient: Patient) => router.push(`${basePath}/${encodeURIComponent(patient.id)}`);
  const openPatientFromKeyboard = (event: KeyboardEvent, patient: Patient) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPatient(patient);
    }
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setSearch("");
    setVisibleCount(8);
  };

  const updateFilter = (key: keyof RegistryFilterState, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setVisibleCount(8);
  };

  const exportRegistry = () => {
    const header = ["ID patient", "Nom", "NIN", "Naissance", "Sexe", "Téléphone", "Assurance", "Wilaya", "Commune", "Médecin référent", "Dernière visite", "Prochaine visite", "Statut"];
    const rows = filteredPatients.map((patient) => [
      patient.id, getDisplayName(patient, locale), patient.nationalId, patient.birthDate,
      patient.gender, patient.phone, patient.insurance, patient.wilaya, patient.commune,
      `${patient.assignedDoctor} (${patient.doctorRegistrationNumber})`, patient.lastVisit,
      patient.nextVisit, patient.administrativeStatus,
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "registre-patients-healixdz.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const shellProps = accountType === "ESTABLISHMENT"
    ? {
        accountType: "ESTABLISHMENT" as const,
        navSections: establishmentNavSections,
        titleKey: "patients.page.title",
        user: { accountType: "ESTABLISHMENT" as const, footerSubtitle: t("dashboard.clinical.administration"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.administration"), roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: prefill.data?.establishment.name || t("dashboard.clinical.workspace") },
      }
    : {
        accountType: "INDEPENDENT_DOCTOR" as const,
        navSections: doctorNavSections,
        titleKey: "patients.page.doctorTitle",
        user: { accountType: "INDEPENDENT_DOCTOR" as const, footerSubtitle: t("dashboard.clinical.doctor.practice"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.doctor.workspace"), roleKey: "dashboard.common.roles.doctor", workspaceSubtitle: t("dashboard.clinical.doctor.workspace") },
      };

  return (
    <DashboardShell {...shellProps} activeKey="patients" breadcrumbLabel={t("patients.page.breadcrumb")}>
      <div className="space-y-6">
        {notice ? <div className="surface-raised fixed end-6 top-24 z-40 flex items-center gap-2.5 border-[var(--accent-line)] px-4 py-3 text-sm font-medium text-[var(--ink)]"><CheckCircle2 className="h-4 w-4 text-[var(--success-ink)]" strokeWidth={1.8} />{notice}</div> : null}

        <section className="surface-section surface-raised relative overflow-hidden border-t-2 border-t-[var(--medical)]">
          <div className="grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-7">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--medical-soft)] text-[var(--medical)] ring-1 ring-[var(--accent-line)]">
                <UsersRound className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--medical)]">
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} />{copy.headerBadge}
                </span>
                <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-[1.75rem]">{copy.title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">{copy.subtitle}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <input ref={importRef} className="hidden" type="file" accept=".csv,.xlsx" onChange={() => { setNotice(copy.importReady); window.setTimeout(() => setNotice(""), 3200); }} />
              <Button className="rounded-[var(--radius-sm)] border-[var(--line)] bg-[var(--panel)] px-3.5 text-[var(--ink-soft)] shadow-none" variant="outline" onClick={() => importRef.current?.click()}><Upload className="h-4 w-4" strokeWidth={1.7} />{copy.actions.import}</Button>
              <Button className="rounded-[var(--radius-sm)] border-[var(--line)] bg-[var(--panel)] px-3.5 text-[var(--ink-soft)] shadow-none" variant="outline" onClick={exportRegistry}><Download className="h-4 w-4" strokeWidth={1.7} />{copy.actions.export}</Button>
              <Button className="rounded-[var(--radius-sm)] px-4 shadow-sm" onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" strokeWidth={1.8} />{copy.actions.new}</Button>
            </div>
          </div>

          <dl className="grid border-t border-[var(--line)] bg-[var(--panel-soft)] sm:grid-cols-3">
            <div className="flex items-center gap-3 px-5 py-4 sm:border-e sm:border-[var(--line)] lg:px-7">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--panel)] text-[var(--institutional)] ring-1 ring-[var(--line)]"><UsersRound className="h-4 w-4" strokeWidth={1.7} /></span>
              <div><dd className="clinical-figure text-lg font-semibold text-[var(--ink)]">{totalPatients.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")}</dd><dt className="text-xs font-medium text-[var(--ink)]">{copy.metrics.total}</dt><p className="mt-0.5 text-[0.68rem] text-[var(--ink-faint)]">{copy.metrics.totalNote}</p></div>
            </div>
            <div className="flex items-center gap-3 border-t border-[var(--line)] px-5 py-4 sm:border-e sm:border-t-0 lg:px-7">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--success-soft)] text-[var(--success-ink)] ring-1 ring-[var(--success-line)]"><Activity className="h-4 w-4" strokeWidth={1.7} /></span>
              <div><dd className="clinical-figure text-lg font-semibold text-[var(--ink)]">{activePatients.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")}</dd><dt className="text-xs font-medium text-[var(--ink)]">{copy.metrics.active}</dt><p className="mt-0.5 text-[0.68rem] text-[var(--ink-faint)]">{copy.metrics.activeNote}</p></div>
            </div>
            <div className="flex items-center gap-3 border-t border-[var(--line)] px-5 py-4 sm:border-t-0 lg:px-7">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent-dark)] ring-1 ring-[var(--accent-line)]"><LockKeyhole className="h-4 w-4" strokeWidth={1.7} /></span>
              <div><dd className="clinical-figure text-lg font-semibold text-[var(--ink)]">{coveredPatients.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")}</dd><dt className="text-xs font-medium text-[var(--ink)]">{copy.metrics.coverage}</dt><p className="mt-0.5 text-[0.68rem] text-[var(--ink-faint)]">{copy.metrics.coverageNote}</p></div>
            </div>
          </dl>
        </section>

        <section className="surface-section p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
            <label className="min-w-0 flex-1">
              <span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--ink-soft)]">{copy.searchLabel}</span>
              <span className="relative block">
                <Search className="pointer-events-none absolute start-3.5 top-3.5 h-4 w-4 text-[var(--ink-faint)]" strokeWidth={1.8} aria-hidden="true" />
                <input className="h-11 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] pe-4 ps-10 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(8); }} placeholder={copy.searchPlaceholder} type="search" />
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button aria-pressed={showFilters} className={cn("rounded-[var(--radius-sm)] border-[var(--line)] bg-[var(--panel)] px-3.5 text-[var(--ink-soft)] shadow-none", showFilters && "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]")} variant="outline" onClick={() => setShowFilters((value) => !value)}><SlidersHorizontal className="h-4 w-4" strokeWidth={1.7} />{copy.actions.filters}{activeFilterCount ? <span className="clinical-figure rounded bg-[var(--accent)] px-1.5 py-0.5 text-[0.62rem] text-white">{activeFilterCount}</span> : null}</Button>
              <div className="relative">
                <Button aria-expanded={showColumns} className={cn("rounded-[var(--radius-sm)] border-[var(--line)] bg-[var(--panel)] px-3.5 text-[var(--ink-soft)] shadow-none", showColumns && "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]")} variant="outline" onClick={() => setShowColumns((value) => !value)}><Columns3 className="h-4 w-4" strokeWidth={1.7} />{copy.actions.columns}</Button>
                {showColumns ? (
                  <div className="absolute end-0 top-12 z-30 w-64 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)] p-2 shadow-[var(--shadow-raised)]">
                    {(Object.keys(initialColumns) as OptionalColumn[]).map((key) => (
                      <label key={key} className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm text-[var(--ink-soft)] hover:bg-[var(--panel-soft)]">
                        <input className="h-4 w-4 accent-[var(--accent)]" type="checkbox" checked={columns[key]} onChange={() => setColumns((current) => ({ ...current, [key]: !current[key] }))} />{copy.columns[key]}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-[var(--ink-faint)]"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--medical)]" strokeWidth={1.7} />{copy.searchHelp}</p>

          {showFilters ? (
            <div className="mt-5 border-t border-[var(--line)] pt-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]"><SlidersHorizontal className="h-4 w-4 text-[var(--medical)]" strokeWidth={1.8} />{copy.filterTitle}</div>
                <button className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] px-2.5 text-xs font-medium text-[var(--accent-dark)] hover:bg-[var(--accent-soft)]" type="button" onClick={resetFilters}><RotateCcw className="h-3.5 w-3.5" strokeWidth={1.7} />{copy.reset}</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <RegistrySelect label={t("patients.filters.gender")} value={filters.gender} onChange={(value) => updateFilter("gender", value)}><option value="">{t("patients.filters.all")}</option>{patientGenderValues.map((value) => <option key={value} value={value}>{t(`patients.genders.${value}`)}</option>)}</RegistrySelect>
                <RegistrySelect label={t("patients.filters.administrativeStatus")} value={filters.administrativeStatus} onChange={(value) => updateFilter("administrativeStatus", value)}><option value="">{t("patients.filters.all")}</option>{patientAdministrativeStatusValues.map((value) => <option key={value} value={value}>{t(`patients.administrativeStatuses.${value}`)}</option>)}</RegistrySelect>
                <RegistrySelect label={t("patients.filters.insurance")} value={filters.insurance} onChange={(value) => updateFilter("insurance", value)}><option value="">{t("patients.filters.all")}</option>{patientInsuranceValues.map((value) => <option key={value} value={value}>{t(`patients.insurances.${value}`)}</option>)}</RegistrySelect>
                <RegistrySelect label={t("patients.filters.sector")} value={filters.sector} onChange={(value) => updateFilter("sector", value)}><option value="">{t("patients.filters.all")}</option>{patientSectorValues.map((value) => <option key={value} value={value}>{t(`patients.sectors.${value}`)}</option>)}</RegistrySelect>
                <RegistrySelect label={t("patients.filters.wilaya")} value={filters.wilaya} onChange={(value) => updateFilter("wilaya", value)}><option value="">{t("patients.filters.all")}</option>{algerianWilayas.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}</RegistrySelect>
              </div>
            </div>
          ) : null}
        </section>

        {isLoading ? (
          <div className="surface-section px-6 py-20 text-center text-sm text-[var(--ink-faint)]">{t("patients.states.loading")}</div>
        ) : isError ? (
          isVerificationRequiredError(error) ? (
            <VerificationRequiredNotice accountType={accountType} t={t} />
          ) : (
            <div className="rounded-[var(--radius-md)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-6 py-20 text-center text-sm text-[var(--danger-ink)]">{t("patients.states.error")}</div>
          )
        ) : (
        <section className="surface-section overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]"><UsersRound className="h-4 w-4" strokeWidth={1.8} /></span>
              <div><h2 className="text-base font-semibold text-[var(--ink)]">{copy.results}</h2><p className="mt-0.5 text-xs text-[var(--ink-faint)]">{copy.loaded(Math.min(visiblePatients.length, filteredPatients.length), filteredPatients.length)}</p></div>
            </div>
            <span className="clinical-figure rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 py-1.5 text-[0.68rem] font-medium text-[var(--ink-soft)]">{filteredPatients.length} {t("patients.states.resultsLabel")}</span>
          </header>

          {visiblePatients.length === 0 ? <div className="px-6 py-16 text-center text-sm text-[var(--ink-faint)]">{copy.empty}</div> : null}

          <div className="divide-y divide-[var(--line)] xl:hidden">
            {visiblePatients.map((patient) => (
              <article key={patient.id} className="cursor-pointer p-5 transition hover:bg-[var(--panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]" role="link" tabIndex={0} onClick={() => openPatient(patient)} onKeyDown={(event) => openPatientFromKeyboard(event, patient)}>
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent-dark)]">{getInitials(patient, locale)}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[var(--ink)]">{getDisplayName(patient, locale)}</p><p className="clinical-figure mt-1 text-[0.66rem] text-[var(--ink-faint)]" dir="ltr">{patient.id}</p></div>
                  <span className={cn("rounded-full border px-2.5 py-1 text-[0.65rem] font-medium", statusClass(patient.administrativeStatus))}>{t(`patients.administrativeStatuses.${patient.administrativeStatus}`)}</span>
                  <PatientActions direction={direction} patient={patient} label={t("patients.actions.viewRecord")} onOpen={() => openPatient(patient)} />
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-[var(--radius-sm)] bg-[var(--panel-soft)] p-3"><span className="block text-[0.68rem] font-medium text-[var(--ink-faint)]">{t("patients.table.columns.ageBirth")}</span><span className="mt-1 block text-[var(--ink-soft)]">{getPatientAge(patient.birthDate)} {t("patients.common.years")} · {formatPatientDate(patient.birthDate, locale)}</span></div>
                  <div className="rounded-[var(--radius-sm)] bg-[var(--panel-soft)] p-3"><span className="block text-[0.68rem] font-medium text-[var(--ink-faint)]">{t("patients.table.columns.phone")}</span><span className="mt-1 flex items-center gap-1.5 text-[var(--ink-soft)]" dir="ltr"><Phone className="h-3.5 w-3.5" strokeWidth={1.7} />{formatAlgerianPhone(patient.phone)}{patient.smsEnabled ? <MessageSquareText className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={1.7} /> : null}</span></div>
                  <div className="rounded-[var(--radius-sm)] bg-[var(--panel-soft)] p-3"><span className="block text-[0.68rem] font-medium text-[var(--ink-faint)]">{t("patients.table.columns.location")}</span><span className="mt-1 block text-[var(--ink-soft)]">{patient.wilaya} · {patient.commune}</span></div>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[1320px] text-[0.78rem]">
              <thead><tr className="border-b border-[var(--line)] bg-[var(--panel-soft)] text-[0.7rem] text-[var(--ink-soft)]">
                <th className="px-4 py-3.5 text-start font-semibold">{t("patients.table.columns.patient")}</th><th className="px-4 py-3.5 text-start font-semibold">{t("patients.table.columns.id")}</th>
                {columns.nin ? <th className="px-4 py-3.5 text-start font-semibold">{copy.columns.nin}</th> : null}
                <th className="px-4 py-3.5 text-start font-semibold">{t("patients.table.columns.ageBirth")}</th>
                {columns.gender ? <th className="px-4 py-3.5 text-start font-semibold">{copy.columns.gender}</th> : null}
                <th className="px-4 py-3.5 text-start font-semibold">{t("patients.table.columns.phone")}</th>
                {columns.insurance ? <th className="px-4 py-3.5 text-start font-semibold">{copy.columns.insurance}</th> : null}
                {columns.location ? <th className="px-4 py-3.5 text-start font-semibold">{copy.columns.location}</th> : null}
                {columns.doctor ? <th className="px-4 py-3.5 text-start font-semibold">{copy.columns.doctor}</th> : null}
                {columns.visits ? <th className="px-4 py-3.5 text-start font-semibold">{copy.columns.visits}</th> : null}
                <th className="px-4 py-3.5 text-start font-semibold">{t("patients.table.columns.administrativeStatus")}</th><th className="px-4 py-3.5 text-end font-semibold">{t("patients.table.columns.actions")}</th>
              </tr></thead>
              <tbody>
                {visiblePatients.map((patient) => (
                  <tr key={patient.id} className="group cursor-pointer border-b border-[var(--line-soft)] align-middle transition last:border-0 hover:bg-[var(--panel-soft)] focus-visible:bg-[var(--panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]" tabIndex={0} onClick={() => openPatient(patient)} onKeyDown={(event) => openPatientFromKeyboard(event, patient)}>
                    <td className="px-4 py-3.5"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-dark)] transition group-hover:border-[var(--accent)]">{getInitials(patient, locale)}</span><div><p className="whitespace-nowrap font-semibold text-[var(--ink)]">{getDisplayName(patient, locale)}</p><p className="mt-0.5 whitespace-nowrap text-[0.68rem] text-[var(--ink-faint)]" lang={locale === "ar" ? "fr" : "ar"}>{locale === "ar" ? `${patient.firstName} ${patient.lastName}` : `${patient.firstNameAr} ${patient.lastNameAr}`}</p></div></div></td>
                    <td className="clinical-figure whitespace-nowrap px-4 py-3.5 text-[0.66rem] text-[var(--ink-soft)]" dir="ltr">{patient.id}</td>
                    {columns.nin ? <td className="clinical-figure whitespace-nowrap px-4 py-3.5 text-[0.66rem] text-[var(--ink-soft)]" dir="ltr">{patient.nationalId || "—"}</td> : null}
                    <td className="whitespace-nowrap px-4 py-4 text-[var(--ink-soft)]"><span className="font-medium text-[var(--ink)]">{getPatientAge(patient.birthDate)} {t("patients.common.years")}</span><span className="mt-0.5 block text-[0.68rem] text-[var(--ink-faint)]">{formatPatientDate(patient.birthDate, locale)}</span></td>
                    {columns.gender ? <td className="px-4 py-4 text-[var(--ink-soft)]">{t(`patients.genders.${patient.gender}`)}</td> : null}
                    <td className="whitespace-nowrap px-4 py-4"><span className="flex items-center gap-1.5 text-[var(--ink-soft)]" dir="ltr"><Phone className="h-3.5 w-3.5 text-[var(--ink-faint)]" strokeWidth={1.7} />{formatAlgerianPhone(patient.phone)}</span><span className={cn("mt-1 inline-flex items-center gap-1 font-[var(--font-auth-mono)] text-[0.58rem]", patient.smsEnabled ? "text-[var(--accent)]" : "text-[var(--ink-faint)]")}><MessageSquareText className="h-3 w-3" strokeWidth={1.7} />{patient.smsEnabled ? t("patients.sms.enabled") : t("patients.sms.disabled")}</span></td>
                    {columns.insurance ? <td className="px-4 py-4"><span className="rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2.5 py-1 text-[0.65rem] font-medium text-[var(--accent-dark)]">{t(`patients.insurances.${patient.insurance}`)}</span><span className="mt-1 block text-[0.64rem] text-[var(--ink-faint)]">{t(`patients.sectors.${patient.sector}`)}</span></td> : null}
                    {columns.location ? <td className="whitespace-nowrap px-4 py-4 text-[var(--ink-soft)]"><span className="font-medium text-[var(--ink)]">{patient.wilayaCode} · {patient.wilaya}</span><span className="mt-0.5 block text-[0.68rem] text-[var(--ink-faint)]">{patient.commune}</span></td> : null}
                    {columns.doctor ? <td className="whitespace-nowrap px-4 py-4 text-[var(--ink-soft)]"><span className="font-medium text-[var(--ink)]">{patient.assignedDoctor}</span><span className="mt-0.5 block font-[var(--font-auth-mono)] text-[0.6rem] text-[var(--ink-faint)]">{patient.doctorRegistrationNumber}</span></td> : null}
                    {columns.visits ? <td className="whitespace-nowrap px-4 py-4 text-[var(--ink-soft)]"><span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-[var(--ink-faint)]" strokeWidth={1.7} />{formatPatientDate(patient.lastVisit, locale, t("patients.common.none"))}</span><span className="mt-1 block text-[0.64rem] text-[var(--ink-faint)]">{t("patients.table.nextShort")} · {formatPatientDate(patient.nextVisit, locale, t("patients.common.none"))}</span></td> : null}
                    <td className="px-4 py-4"><span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.65rem] font-medium", statusClass(patient.administrativeStatus))}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{t(`patients.administrativeStatuses.${patient.administrativeStatus}`)}</span></td>
                    <td className="px-4 py-4 text-end"><PatientActions direction={direction} patient={patient} label={t("patients.actions.viewRecord")} onOpen={() => openPatient(patient)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visibleCount < filteredPatients.length ? <div className="border-t border-[var(--line)] bg-[var(--panel-soft)] p-4 text-center"><Button className="rounded-[var(--radius-sm)] border-[var(--accent-line)] bg-[var(--panel)] px-5 text-[var(--accent-dark)] shadow-none hover:bg-[var(--accent-soft)]" variant="outline" onClick={() => setVisibleCount((count) => count + 8)}>{copy.loadMore}</Button></div> : null}
        </section>
        )}

        <aside className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2.5 text-[0.7rem] leading-5 text-[var(--ink-faint)]"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--medical)]" strokeWidth={1.7} />{copy.demo}</aside>
      </div>

      <AddPatientModal direction={direction} isOpen={isAddOpen} locale={locale} onClose={() => setAddOpen(false)} onCreate={() => { setNotice(t("patients.states.patientAdded")); window.setTimeout(() => setNotice(""), 3200); }} onOpenPatient={openPatient} t={t} />
    </DashboardShell>
  );
}
