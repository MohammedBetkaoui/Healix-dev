"use client";

import {
  CalendarDays,
  Columns3,
  Download,
  Info,
  MessageSquareText,
  MoreHorizontal,
  Phone,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { AddPatientModal } from "@/components/patients/AddPatientModal";
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
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type Patient } from "@/types/patient";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
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
    count: "7 842 patients",
    demo: "Aperçu avec données fictives — les données réelles sont soumises aux autorisations et à la traçabilité Loi 18-07.",
    empty: "Aucun patient ne correspond à ces critères.",
    headerBadge: "Registre administratif",
    importReady: "Fichier prêt pour validation avant import.",
    loadMore: "Charger les patients suivants",
    loaded: (visible: number, total: number) => `${visible} sur ${total} lignes chargées progressivement`,
    newThisMonth: "124 nouveaux ce mois",
    reset: "Réinitialiser",
    searchHelp: "Tolérant aux variantes de translittération : Mohamed / Mohammed, Benali / Ben Ali. Recherche en arabe prise en charge.",
    searchPlaceholder: "Nom, ID patient, téléphone, NIN, naissance ou n° dossier hospitalier…",
    title: "Registre des patients",
  },
  ar: {
    actions: { columns: "الأعمدة", export: "تصدير", filters: "الفلاتر", import: "استيراد", new: "مريض جديد" },
    columns: { doctor: "الطبيب المرجعي", gender: "الجنس", insurance: "التأمين", location: "الولاية / البلدية", nin: "رقم التعريف الوطني", visits: "الزيارات" },
    count: "7 842 مريضاً",
    demo: "معاينة ببيانات تجريبية — تخضع البيانات الحقيقية للصلاحيات والتتبع وفق القانون 18-07.",
    empty: "لا يوجد مريض مطابق لهذه المعايير.",
    headerBadge: "السجل الإداري",
    importReady: "الملف جاهز للتحقق قبل الاستيراد.",
    loadMore: "تحميل المرضى التاليين",
    loaded: (visible: number, total: number) => `تم تحميل ${visible} من ${total} سطراً تدريجياً`,
    newThisMonth: "124 مريضاً جديداً هذا الشهر",
    reset: "إعادة الضبط",
    searchHelp: "يدعم اختلافات كتابة الأسماء بالحروف اللاتينية والبحث باللغة العربية.",
    searchPlaceholder: "الاسم، رقم المريض، الهاتف، رقم التعريف، الميلاد أو رقم الملف…",
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
    <label className="space-y-2">
      <span className="block font-[var(--font-auth-mono)] text-[0.62rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">{label}</span>
      <select className="h-10 w-full rounded-[0.65rem] border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink-soft)] outline-none focus:border-[var(--accent)]" value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
    </label>
  );
}

function PatientActions({ patient, onOpen, label }: { label: string; onOpen: () => void; patient: Patient }) {
  return (
    <details className="relative" onClick={(event) => event.stopPropagation()}>
      <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full text-[var(--ink-faint)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)]" aria-label={`${label} ${patient.id}`}>
        <MoreHorizontal className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
      </summary>
      <div className="absolute end-0 z-20 mt-1 w-44 rounded-[0.7rem] border border-[var(--line)] bg-[var(--panel)] p-1.5 shadow-sm">
        <button className="w-full rounded-[0.5rem] px-3 py-2 text-start text-sm text-[var(--ink-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)]" type="button" onClick={onOpen}>{label}</button>
      </div>
    </details>
  );
}

export function PatientRegistryPage({ accountType }: PatientRegistryPageProps) {
  const router = useRouter();
  const { locale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);
  const copy = registryCopy[locale];
  const { data, isError, isLoading } = usePatients({ limit: 100 });
  const patients = data?.data ?? [];
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
        user: { accountType: "ESTABLISHMENT" as const, footerSubtitle: "Administration", initials: "HE", name: "Healix Clinique", roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: "Clinique El Shifa" },
      }
    : {
        accountType: "INDEPENDENT_DOCTOR" as const,
        navSections: doctorNavSections,
        titleKey: "patients.page.doctorTitle",
        user: { accountType: "INDEPENDENT_DOCTOR" as const, footerSubtitle: "Neurologie", initials: "SB", name: "Dr Samir Benali", roleKey: "dashboard.common.roles.doctor", workspaceSubtitle: "Cabinet HealixDZ" },
      };

  return (
    <DashboardShell {...shellProps} activeKey="patients" breadcrumbLabel={t("patients.page.breadcrumb")}>
      <div className="space-y-5">
        {notice ? <div className="fixed end-6 top-24 z-40 rounded-[0.8rem] border border-[var(--accent-line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--accent-dark)] shadow-sm">{notice}</div> : null}

        <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 py-1.5 font-[var(--font-auth-mono)] text-[0.63rem] uppercase tracking-[0.08em] text-[var(--accent-dark)]">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.7} />{copy.headerBadge}
            </span>
            <h1 className="mt-3 font-[var(--font-auth-display)] text-[2rem] font-medium leading-tight text-[var(--ink)] sm:text-[2.35rem]">{copy.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--ink-soft)]">
              <span className="font-medium text-[var(--ink)]">{copy.count}</span><span aria-hidden="true" className="h-1 w-1 rounded-full bg-primary" /><span>{copy.newThisMonth}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={importRef} className="hidden" type="file" accept=".csv,.xlsx" onChange={() => { setNotice(copy.importReady); window.setTimeout(() => setNotice(""), 3200); }} />
            <Button className="rounded-full border-[var(--line)] bg-[var(--panel)] px-4 text-[var(--ink-soft)] shadow-none" variant="outline" onClick={() => importRef.current?.click()}><Upload className="me-2 h-4 w-4" strokeWidth={1.7} />{copy.actions.import}</Button>
            <Button className="rounded-full border-[var(--line)] bg-[var(--panel)] px-4 text-[var(--ink-soft)] shadow-none" variant="outline" onClick={exportRegistry}><Download className="me-2 h-4 w-4" strokeWidth={1.7} />{copy.actions.export}</Button>
            <Button className={cn("rounded-full border-[var(--line)] bg-[var(--panel)] px-4 text-[var(--ink-soft)] shadow-none", showFilters && "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]")} variant="outline" onClick={() => setShowFilters((value) => !value)}><SlidersHorizontal className="me-2 h-4 w-4" strokeWidth={1.7} />{copy.actions.filters}</Button>
            <div className="relative">
              <Button className={cn("rounded-full border-[var(--line)] bg-[var(--panel)] px-4 text-[var(--ink-soft)] shadow-none", showColumns && "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]")} variant="outline" onClick={() => setShowColumns((value) => !value)}><Columns3 className="me-2 h-4 w-4" strokeWidth={1.7} />{copy.actions.columns}</Button>
              {showColumns ? (
                <div className="absolute end-0 top-12 z-30 w-64 rounded-[0.85rem] border border-[var(--line)] bg-[var(--panel)] p-2 shadow-sm">
                  {(Object.keys(initialColumns) as OptionalColumn[]).map((key) => (
                    <label key={key} className="flex cursor-pointer items-center gap-3 rounded-[0.55rem] px-3 py-2 text-sm text-[var(--ink-soft)] hover:bg-[var(--accent-soft)]">
                      <input className="h-4 w-4 accent-[var(--accent)]" type="checkbox" checked={columns[key]} onChange={() => setColumns((current) => ({ ...current, [key]: !current[key] }))} />{copy.columns[key]}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            <Button className="rounded-full px-5" onClick={() => setAddOpen(true)}><UserPlus className="me-2 h-4 w-4" strokeWidth={1.7} />{copy.actions.new}</Button>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
          <div className="relative">
            <Search className="pointer-events-none absolute start-4 top-3.5 h-4 w-4 text-[var(--ink-faint)]" strokeWidth={1.7} aria-hidden="true" />
            <input className="h-11 w-full rounded-[0.7rem] border border-[var(--line)] bg-muted pe-4 ps-11 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(8); }} placeholder={copy.searchPlaceholder} type="search" />
          </div>
          <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-[var(--ink-faint)]"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" strokeWidth={1.7} />{copy.searchHelp}</p>
        </section>

        {showFilters ? (
          <section className="rounded-xl border border-[var(--line)] bg-muted p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <RegistrySelect label={t("patients.filters.gender")} value={filters.gender} onChange={(value) => updateFilter("gender", value)}><option value="">{t("patients.filters.all")}</option>{patientGenderValues.map((value) => <option key={value} value={value}>{t(`patients.genders.${value}`)}</option>)}</RegistrySelect>
              <RegistrySelect label={t("patients.filters.administrativeStatus")} value={filters.administrativeStatus} onChange={(value) => updateFilter("administrativeStatus", value)}><option value="">{t("patients.filters.all")}</option>{patientAdministrativeStatusValues.map((value) => <option key={value} value={value}>{t(`patients.administrativeStatuses.${value}`)}</option>)}</RegistrySelect>
              <RegistrySelect label={t("patients.filters.insurance")} value={filters.insurance} onChange={(value) => updateFilter("insurance", value)}><option value="">{t("patients.filters.all")}</option>{patientInsuranceValues.map((value) => <option key={value} value={value}>{t(`patients.insurances.${value}`)}</option>)}</RegistrySelect>
              <RegistrySelect label={t("patients.filters.sector")} value={filters.sector} onChange={(value) => updateFilter("sector", value)}><option value="">{t("patients.filters.all")}</option>{patientSectorValues.map((value) => <option key={value} value={value}>{t(`patients.sectors.${value}`)}</option>)}</RegistrySelect>
              <RegistrySelect label={t("patients.filters.wilaya")} value={filters.wilaya} onChange={(value) => updateFilter("wilaya", value)}><option value="">{t("patients.filters.all")}</option>{algerianWilayas.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}</RegistrySelect>
            </div>
            <button className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-[var(--accent-dark)]" type="button" onClick={resetFilters}><RotateCcw className="h-3.5 w-3.5" strokeWidth={1.7} />{copy.reset}</button>
          </section>
        ) : null}

        {isLoading ? (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-6 py-16 text-center text-sm text-[var(--ink-faint)]">{t("patients.states.loading")}</div>
        ) : isError ? (
          <div className="rounded-xl border border-[var(--danger-line)] bg-[var(--danger-soft)] px-6 py-16 text-center text-sm text-[var(--danger-ink)]">{t("patients.states.error")}</div>
        ) : (
        <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div><h2 className="font-[var(--font-auth-display)] text-xl font-medium text-[var(--ink)]">{copy.title}</h2><p className="mt-1 text-xs text-[var(--ink-faint)]">{copy.loaded(Math.min(visiblePatients.length, filteredPatients.length), filteredPatients.length)}</p></div>
            <span className="rounded-full border border-[var(--line)] bg-muted px-3 py-1.5 font-[var(--font-auth-mono)] text-[0.64rem] text-[var(--ink-soft)]">{filteredPatients.length} {t("patients.states.resultsLabel")}</span>
          </header>

          {visiblePatients.length === 0 ? <div className="px-6 py-16 text-center text-sm text-[var(--ink-faint)]">{copy.empty}</div> : null}

          <div className="divide-y divide-[var(--line)] xl:hidden">
            {visiblePatients.map((patient) => (
              <article key={patient.id} className="cursor-pointer p-5 transition hover:bg-muted" role="link" tabIndex={0} onClick={() => openPatient(patient)} onKeyDown={(event) => openPatientFromKeyboard(event, patient)}>
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.72rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] font-[var(--font-auth-display)] text-base font-medium text-[var(--accent-dark)]">{getInitials(patient, locale)}</span>
                  <div className="min-w-0 flex-1"><p className="truncate font-medium text-[var(--ink)]">{getDisplayName(patient, locale)}</p><p className="mt-1 font-[var(--font-auth-mono)] text-[0.66rem] text-[var(--ink-faint)]" dir="ltr">{patient.id}</p></div>
                  <span className={cn("rounded-full border px-2.5 py-1 font-[var(--font-auth-mono)] text-[0.6rem]", statusClass(patient.administrativeStatus))}>{t(`patients.administrativeStatuses.${patient.administrativeStatus}`)}</span>
                  <PatientActions patient={patient} label={t("patients.actions.viewRecord")} onOpen={() => openPatient(patient)} />
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div><span className="block text-xs text-[var(--ink-faint)]">{t("patients.table.columns.ageBirth")}</span><span className="mt-1 block text-[var(--ink-soft)]">{getPatientAge(patient.birthDate)} {t("patients.common.years")} · {formatPatientDate(patient.birthDate, locale)}</span></div>
                  <div><span className="block text-xs text-[var(--ink-faint)]">{t("patients.table.columns.phone")}</span><span className="mt-1 flex items-center gap-1.5 text-[var(--ink-soft)]" dir="ltr"><Phone className="h-3.5 w-3.5" strokeWidth={1.7} />{formatAlgerianPhone(patient.phone)}{patient.smsEnabled ? <MessageSquareText className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={1.7} /> : null}</span></div>
                  <div><span className="block text-xs text-[var(--ink-faint)]">{t("patients.table.columns.location")}</span><span className="mt-1 block text-[var(--ink-soft)]">{patient.wilaya} · {patient.commune}</span></div>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto xl:block">
            <table className="min-w-[1450px] w-full text-[0.78rem]">
              <thead><tr className="border-b border-[var(--line)] bg-muted font-[var(--font-auth-mono)] text-[0.6rem] uppercase tracking-[0.11em] text-[var(--ink-faint)]">
                <th className="px-4 py-3.5 text-start font-medium">{t("patients.table.columns.patient")}</th><th className="px-4 py-3.5 text-start font-medium">{t("patients.table.columns.id")}</th>
                {columns.nin ? <th className="px-4 py-3.5 text-start font-medium">{copy.columns.nin}</th> : null}
                <th className="px-4 py-3.5 text-start font-medium">{t("patients.table.columns.ageBirth")}</th>
                {columns.gender ? <th className="px-4 py-3.5 text-start font-medium">{copy.columns.gender}</th> : null}
                <th className="px-4 py-3.5 text-start font-medium">{t("patients.table.columns.phone")}</th>
                {columns.insurance ? <th className="px-4 py-3.5 text-start font-medium">{copy.columns.insurance}</th> : null}
                {columns.location ? <th className="px-4 py-3.5 text-start font-medium">{copy.columns.location}</th> : null}
                {columns.doctor ? <th className="px-4 py-3.5 text-start font-medium">{copy.columns.doctor}</th> : null}
                {columns.visits ? <th className="px-4 py-3.5 text-start font-medium">{copy.columns.visits}</th> : null}
                <th className="px-4 py-3.5 text-start font-medium">{t("patients.table.columns.administrativeStatus")}</th><th className="px-4 py-3.5 text-end font-medium">{t("patients.table.columns.actions")}</th>
              </tr></thead>
              <tbody>
                {visiblePatients.map((patient) => (
                  <tr key={patient.id} className="cursor-pointer border-b border-[var(--line-soft)] align-middle transition last:border-0 hover:bg-muted" tabIndex={0} onClick={() => openPatient(patient)} onKeyDown={(event) => openPatientFromKeyboard(event, patient)}>
                    <td className="px-4 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.62rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] font-[var(--font-auth-display)] text-sm font-medium text-[var(--accent-dark)]">{getInitials(patient, locale)}</span><div><p className="whitespace-nowrap font-medium text-[var(--ink)]">{getDisplayName(patient, locale)}</p><p className="mt-0.5 whitespace-nowrap text-[0.68rem] text-[var(--ink-faint)]" lang={locale === "ar" ? "fr" : "ar"}>{locale === "ar" ? `${patient.firstName} ${patient.lastName}` : `${patient.firstNameAr} ${patient.lastNameAr}`}</p></div></div></td>
                    <td className="whitespace-nowrap px-4 py-4 font-[var(--font-auth-mono)] text-[0.66rem] text-[var(--ink-soft)]" dir="ltr">{patient.id}</td>
                    {columns.nin ? <td className="whitespace-nowrap px-4 py-4 font-[var(--font-auth-mono)] text-[0.66rem] text-[var(--ink-soft)]" dir="ltr">{patient.nationalId || "—"}</td> : null}
                    <td className="whitespace-nowrap px-4 py-4 text-[var(--ink-soft)]"><span className="font-medium text-[var(--ink)]">{getPatientAge(patient.birthDate)} {t("patients.common.years")}</span><span className="mt-0.5 block text-[0.68rem] text-[var(--ink-faint)]">{formatPatientDate(patient.birthDate, locale)}</span></td>
                    {columns.gender ? <td className="px-4 py-4 text-[var(--ink-soft)]">{t(`patients.genders.${patient.gender}`)}</td> : null}
                    <td className="whitespace-nowrap px-4 py-4"><span className="flex items-center gap-1.5 text-[var(--ink-soft)]" dir="ltr"><Phone className="h-3.5 w-3.5 text-[var(--ink-faint)]" strokeWidth={1.7} />{formatAlgerianPhone(patient.phone)}</span><span className={cn("mt-1 inline-flex items-center gap-1 font-[var(--font-auth-mono)] text-[0.58rem]", patient.smsEnabled ? "text-[var(--accent)]" : "text-[var(--ink-faint)]")}><MessageSquareText className="h-3 w-3" strokeWidth={1.7} />{patient.smsEnabled ? t("patients.sms.enabled") : t("patients.sms.disabled")}</span></td>
                    {columns.insurance ? <td className="px-4 py-4"><span className="rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2.5 py-1 text-[0.65rem] font-medium text-[var(--accent-dark)]">{t(`patients.insurances.${patient.insurance}`)}</span><span className="mt-1 block text-[0.64rem] text-[var(--ink-faint)]">{t(`patients.sectors.${patient.sector}`)}</span></td> : null}
                    {columns.location ? <td className="whitespace-nowrap px-4 py-4 text-[var(--ink-soft)]"><span className="font-medium text-[var(--ink)]">{patient.wilayaCode} · {patient.wilaya}</span><span className="mt-0.5 block text-[0.68rem] text-[var(--ink-faint)]">{patient.commune}</span></td> : null}
                    {columns.doctor ? <td className="whitespace-nowrap px-4 py-4 text-[var(--ink-soft)]"><span className="font-medium text-[var(--ink)]">{patient.assignedDoctor}</span><span className="mt-0.5 block font-[var(--font-auth-mono)] text-[0.6rem] text-[var(--ink-faint)]">{patient.doctorRegistrationNumber}</span></td> : null}
                    {columns.visits ? <td className="whitespace-nowrap px-4 py-4 text-[var(--ink-soft)]"><span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-[var(--ink-faint)]" strokeWidth={1.7} />{formatPatientDate(patient.lastVisit, locale, t("patients.common.none"))}</span><span className="mt-1 block text-[0.64rem] text-[var(--ink-faint)]">{t("patients.table.nextShort")} · {formatPatientDate(patient.nextVisit, locale, t("patients.common.none"))}</span></td> : null}
                    <td className="px-4 py-4"><span className={cn("whitespace-nowrap rounded-full border px-2.5 py-1 font-[var(--font-auth-mono)] text-[0.6rem]", statusClass(patient.administrativeStatus))}>{t(`patients.administrativeStatuses.${patient.administrativeStatus}`)}</span></td>
                    <td className="px-4 py-4 text-end"><PatientActions patient={patient} label={t("patients.actions.viewRecord")} onOpen={() => openPatient(patient)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visibleCount < filteredPatients.length ? <div className="border-t border-[var(--line)] p-4 text-center"><Button className="rounded-full border-[var(--accent-line)] bg-[var(--accent-soft)] px-5 text-[var(--accent-dark)] shadow-none hover:bg-secondary" variant="outline" onClick={() => setVisibleCount((count) => count + 8)}>{copy.loadMore}</Button></div> : null}
        </section>
        )}

        <aside className="flex items-start gap-2 px-1 text-[0.7rem] leading-5 text-[var(--ink-faint)]"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" strokeWidth={1.7} />{copy.demo}</aside>
      </div>

      <AddPatientModal direction={direction} existingPatients={patients} isOpen={isAddOpen} locale={locale} onClose={() => setAddOpen(false)} onCreate={() => { setNotice(t("patients.states.patientAdded")); window.setTimeout(() => setNotice(""), 3200); }} onOpenPatient={openPatient} t={t} />
    </DashboardShell>
  );
}
