"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FilePlus2,
  Files,
  FilterX,
  LockKeyhole,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { DemoModuleBanner } from "@/components/dashboard/shared/DemoModule";
import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { MedicalRecordDetail } from "@/components/medical-records/MedicalRecordDetail";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { medicalRecordsCopy } from "@/features/medical-records/medical-records.copy";
import { mockMedicalRecords } from "@/features/medical-records/medical-records.mock";
import {
  type LocalizedClinicalText,
  type MedicalRecordCoverage,
  type MedicalRecordPatient,
  type MedicalRecordSex,
  type MedicalRecordStatus,
} from "@/features/medical-records/medical-records.types";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { type Locale } from "@/i18n";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type DashboardStatusTone } from "@/types/dashboard";

const fieldClassName = "h-11 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

const statusTone: Record<MedicalRecordStatus, DashboardStatusTone> = {
  ACTIVE: "success",
  FOLLOW_UP: "info",
  URGENT: "danger",
};

function localized(value: LocalizedClinicalText, locale: Locale) {
  return value[locale];
}

function getAge(birthDate: string) {
  const today = new Date();
  const birth = new Date(`${birthDate}T00:00:00`);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDifference = today.getMonth() - birth.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getStatusLabel(status: MedicalRecordStatus, locale: Locale) {
  const copy = medicalRecordsCopy[locale];
  if (status === "URGENT") return copy.urgent;
  if (status === "FOLLOW_UP") return copy.followUp;
  return copy.active;
}

function getCoverageLabel(coverage: MedicalRecordCoverage, locale: Locale) {
  const copy = medicalRecordsCopy[locale];
  if (coverage === "UNINSURED") return copy.uninsured;
  if (coverage === "PRIVATE") return copy.private;
  return coverage;
}

function getSexLabel(sex: MedicalRecordSex, locale: Locale) {
  return sex === "FEMALE" ? medicalRecordsCopy[locale].female : medicalRecordsCopy[locale].male;
}

type NewRecordModalProps = {
  doctors: LocalizedClinicalText[];
  locale: Locale;
  onClose: () => void;
  onCreate: (patient: MedicalRecordPatient) => void;
  wilayas: LocalizedClinicalText[];
  authorName: string;
};

function NewRecordModal({ authorName, doctors, locale, onClose, onCreate, wilayas }: NewRecordModalProps) {
  const copy = medicalRecordsCopy[locale];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const selectedWilaya = wilayas.find((wilaya) => wilaya.fr === data.get("wilaya")) ?? wilayas[0];
    const selectedDoctor = doctors.find((doctor) => doctor.fr === data.get("doctor")) ?? doctors[0];
    const now = new Date().toISOString();
    const firstName = String(data.get("firstName") || "").trim();
    const lastName = String(data.get("lastName") || "").trim();
    const firstNameAr = String(data.get("firstNameAr") || "").trim();
    const lastNameAr = String(data.get("lastNameAr") || "").trim();

    onCreate({
      accessHistory: [
        {
          author: { ar: authorName, fr: authorName },
          date: now,
          detail: {
            ar: "إنشاء ملف داخلي جديد في وضع العرض التجريبي.",
            fr: "Création d’un nouveau dossier interne en mode démonstration.",
          },
          id: `access-${Date.now()}`,
          title: { ar: "تم إنشاء الملف", fr: "Dossier créé" },
        },
      ],
      alerts: [],
      allergies: [],
      birthDate: String(data.get("birthDate")),
      bloodGroup: String(data.get("bloodGroup") || "—"),
      chronicConditions: [],
      commune: { ar: copy.none, fr: copy.none },
      consents: [],
      consultations: [],
      coverage: String(data.get("coverage")) as MedicalRecordCoverage,
      coverageNumber: String(data.get("coverageNumber") || "").trim() || null,
      currentMedications: [],
      doctor: selectedDoctor ?? { ar: copy.none, fr: copy.none },
      documents: [],
      emergencyContact: {
        name: { ar: copy.none, fr: copy.none },
        phone: "—",
        relationship: { ar: copy.none, fr: copy.none },
      },
      examinations: [],
      firstName,
      firstNameAr,
      id: `record-local-${Date.now()}`,
      imaging: [],
      internalRecordNumber: String(data.get("internalRecordNumber")).trim(),
      lastConsultation: null,
      lastName,
      lastNameAr,
      lastUpdated: now,
      nin: String(data.get("nin")).trim(),
      sex: String(data.get("sex")) as MedicalRecordSex,
      status: "ACTIVE",
      treatments: [],
      wilaya: selectedWilaya ?? { ar: copy.none, fr: copy.none },
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="surface-section surface-raised max-h-[94vh] w-full max-w-3xl overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="new-record-title">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--panel-soft)] px-5 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[var(--medical)]">
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.confidential}
            </div>
            <h2 id="new-record-title" className="mt-1 text-lg font-semibold text-[var(--ink)]">{copy.newRecord}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--ink-soft)]">{copy.newRecordDescription}</p>
          </div>
          <button type="button" className="clinical-icon-button shrink-0" onClick={onClose} aria-label={copy.cancel}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form className="max-h-[calc(94vh-7rem)] overflow-y-auto" onSubmit={submit}>
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)]">
              <span>{copy.firstName}</span>
              <input className={fieldClassName} name="firstName" autoComplete="given-name" required />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)]">
              <span>{copy.lastName}</span>
              <input className={fieldClassName} name="lastName" autoComplete="family-name" required />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)]">
              <span>{copy.firstNameAr}</span>
              <input className={fieldClassName} name="firstNameAr" dir="rtl" required />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)]">
              <span>{copy.lastNameAr}</span>
              <input className={fieldClassName} name="lastNameAr" dir="rtl" required />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)]">
              <span>{copy.nin}</span>
              <input className={fieldClassName} name="nin" inputMode="numeric" minLength={18} maxLength={18} pattern="[0-9]{18}" dir="ltr" required />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)]">
              <span>{copy.internalRecord}</span>
              <input className={fieldClassName} name="internalRecordNumber" placeholder="HZD-EST-2026-00000" dir="ltr" required />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)]">
              <span>{copy.birthDate}</span>
              <input className={fieldClassName} name="birthDate" type="date" required />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)]">
              <span>{copy.sex}</span>
              <select className={fieldClassName} name="sex" defaultValue="FEMALE">
                <option value="FEMALE">{copy.female}</option>
                <option value="MALE">{copy.male}</option>
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)]">
              <span>{copy.coverage}</span>
              <select className={fieldClassName} name="coverage" defaultValue="CNAS">
                <option value="CNAS">CNAS</option>
                <option value="CASNOS">CASNOS</option>
                <option value="UNINSURED">{copy.uninsured}</option>
                <option value="PRIVATE">{copy.private}</option>
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)]">
              <span>{copy.coverageNumber}</span>
              <input className={fieldClassName} name="coverageNumber" dir="ltr" />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)]">
              <span>{copy.wilaya}</span>
              <select className={fieldClassName} name="wilaya" defaultValue={wilayas[0]?.fr}>
                {wilayas.map((wilaya) => <option key={wilaya.fr} value={wilaya.fr}>{localized(wilaya, locale)}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)]">
              <span>{copy.doctor}</span>
              <select className={fieldClassName} name="doctor" defaultValue={doctors[0]?.fr}>
                {doctors.map((doctor) => <option key={doctor.fr} value={doctor.fr}>{localized(doctor, locale)}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)] sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
              <span>{copy.bloodGroup}</span>
              <select className={fieldClassName} name="bloodGroup" defaultValue="O+" dir="ltr">
                {["O+", "O−", "A+", "A−", "B+", "B−", "AB+", "AB−"].map((group) => <option key={group}>{group}</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--line)] bg-[var(--panel-soft)] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <Button type="button" variant="outline" onClick={onClose}>{copy.cancel}</Button>
            <Button type="submit"><FilePlus2 className="h-4 w-4" aria-hidden="true" />{copy.save}</Button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function MedicalRecordsPage() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const copy = medicalRecordsCopy[locale];
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const prefill = useEstablishmentVerificationPrefill();
  const [records, setRecords] = useState<MedicalRecordPatient[]>(mockMedicalRecords);
  const [selectedId, setSelectedId] = useState(mockMedicalRecords[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [wilayaFilter, setWilayaFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [coverageFilter, setCoverageFilter] = useState("");
  const [isNewRecordOpen, setNewRecordOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const doctors = useMemo(
    () => Array.from(new Map(records.map((record) => [record.doctor.fr, record.doctor])).values()),
    [records],
  );
  const wilayas = useMemo(
    () => Array.from(new Map(records.map((record) => [record.wilaya.fr, record.wilaya])).values()),
    [records],
  );

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return records.filter((record) => {
      if (doctorFilter && record.doctor.fr !== doctorFilter) return false;
      if (wilayaFilter && record.wilaya.fr !== wilayaFilter) return false;
      if (statusFilter && record.status !== statusFilter) return false;
      if (coverageFilter && record.coverage !== coverageFilter) return false;
      if (!query) return true;
      return [
        record.firstName,
        record.lastName,
        record.firstNameAr,
        record.lastNameAr,
        `${record.firstName} ${record.lastName}`,
        `${record.firstNameAr} ${record.lastNameAr}`,
        record.nin,
        record.internalRecordNumber,
      ].some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [coverageFilter, doctorFilter, records, search, statusFilter, wilayaFilter]);

  const selectedPatient = records.find((record) => record.id === selectedId) ?? filteredRecords[0] ?? records[0];
  const hasFilters = Boolean(search.trim() || doctorFilter || wilayaFilter || statusFilter || coverageFilter);
  const urgentCount = records.filter((record) => record.status === "URGENT").length;
  const followUpCount = records.filter((record) => record.status === "FOLLOW_UP").length;
  const initials = getAccountInitials(currentUser.data?.fullName);

  const resetFilters = () => {
    setSearch("");
    setDoctorFilter("");
    setWilayaFilter("");
    setStatusFilter("");
    setCoverageFilter("");
  };

  const createRecord = (patient: MedicalRecordPatient) => {
    setRecords((current) => [patient, ...current]);
    setSelectedId(patient.id);
    resetFilters();
    setNewRecordOpen(false);
    setNotice(copy.recordCreated);
    window.setTimeout(() => setNotice(""), 3500);
  };

  const shellProps = {
    accountType: "ESTABLISHMENT" as const,
    navSections: establishmentNavSections,
    titleKey: "dashboard.clinical.nav.records",
    user: {
      accountType: "ESTABLISHMENT" as const,
      footerSubtitle: t("dashboard.clinical.administration"),
      initials,
      name: currentUser.data?.fullName || t("dashboard.clinical.administration"),
      roleKey: "dashboard.common.roles.establishment",
      workspaceSubtitle: prefill.data?.establishment.name || t("dashboard.clinical.workspace"),
    },
  };

  return (
    <DashboardShell {...shellProps} activeKey="records">
      <div className="space-y-6">
        <DemoModuleBanner t={t} />
        {notice ? (
          <div className="surface-raised fixed end-6 top-24 z-40 flex items-center gap-2.5 border-[var(--success-line)] px-4 py-3 text-sm font-medium text-[var(--ink)]" role="status">
            <CheckCircle2 className="h-4 w-4 text-[var(--success-ink)]" strokeWidth={1.8} aria-hidden="true" />
            {notice}
          </div>
        ) : null}

        <section className="surface-section surface-raised relative overflow-hidden border-t-2 border-t-[var(--medical)]">
          <div className="grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-7">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--medical-soft)] text-[var(--medical)] ring-1 ring-[var(--accent-line)]">
                <Files className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--medical)]">
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                  {copy.confidential}
                </span>
                <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-[1.75rem]">{copy.title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">{copy.description}</p>
              </div>
            </div>
            <Button className="lg:justify-self-end" onClick={() => setNewRecordOpen(true)}>
              <FilePlus2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              {copy.newRecord}
            </Button>
          </div>

          <dl className="grid border-t border-[var(--line)] bg-[var(--panel-soft)] sm:grid-cols-3">
            <div className="flex items-center gap-3 px-5 py-4 sm:border-e sm:border-[var(--line)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--panel)] text-[var(--medical)] ring-1 ring-[var(--line)]"><Files className="h-4 w-4" /></span>
              <div><dt className="text-xs text-[var(--ink-faint)]">{copy.list}</dt><dd className="clinical-figure mt-0.5 text-lg font-semibold text-[var(--ink)]">{records.length}</dd></div>
            </div>
            <div className="flex items-center gap-3 border-t border-[var(--line)] px-5 py-4 sm:border-e sm:border-t-0">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--panel)] text-[var(--accent-dark)] ring-1 ring-[var(--line)]"><Stethoscope className="h-4 w-4" /></span>
              <div><dt className="text-xs text-[var(--ink-faint)]">{copy.followUp}</dt><dd className="clinical-figure mt-0.5 text-lg font-semibold text-[var(--ink)]">{followUpCount}</dd></div>
            </div>
            <div className="flex items-center gap-3 border-t border-[var(--line)] px-5 py-4 sm:border-t-0">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--danger-soft)] text-[var(--danger-ink)] ring-1 ring-[var(--danger-line)]"><AlertTriangle className="h-4 w-4" /></span>
              <div><dt className="text-xs text-[var(--ink-faint)]">{copy.urgent}</dt><dd className="clinical-figure mt-0.5 text-lg font-semibold text-[var(--ink)]">{urgentCount}</dd></div>
            </div>
          </dl>
        </section>

        <section className="surface-section p-4 sm:p-5" aria-labelledby="record-filters-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />
              <h2 id="record-filters-title" className="text-sm font-semibold text-[var(--ink)]">{copy.filters}</h2>
            </div>
            {hasFilters ? (
              <button type="button" className="clinical-button h-9 bg-[var(--panel)] text-xs" onClick={resetFilters}>
                <FilterX className="h-3.5 w-3.5" aria-hidden="true" />{copy.reset}
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1.6fr)_repeat(4,minmax(9rem,1fr))]">
            <label className="relative block">
              <span className="sr-only">{copy.search}</span>
              <Search className="pointer-events-none absolute start-3 top-3.5 h-4 w-4 text-[var(--ink-faint)]" strokeWidth={1.8} aria-hidden="true" />
              <input type="search" className={cn(fieldClassName, "ps-10")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.searchPlaceholder} />
            </label>
            <label>
              <span className="sr-only">{copy.doctor}</span>
              <select className={fieldClassName} value={doctorFilter} onChange={(event) => setDoctorFilter(event.target.value)}>
                <option value="">{copy.allDoctors}</option>
                {doctors.map((doctor) => <option key={doctor.fr} value={doctor.fr}>{localized(doctor, locale)}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">{copy.wilaya}</span>
              <select className={fieldClassName} value={wilayaFilter} onChange={(event) => setWilayaFilter(event.target.value)}>
                <option value="">{copy.allWilayas}</option>
                {wilayas.map((wilaya) => <option key={wilaya.fr} value={wilaya.fr}>{localized(wilaya, locale)}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">{copy.status}</span>
              <select className={fieldClassName} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">{copy.allStatuses}</option>
                <option value="ACTIVE">{copy.active}</option>
                <option value="FOLLOW_UP">{copy.followUp}</option>
                <option value="URGENT">{copy.urgent}</option>
              </select>
            </label>
            <label>
              <span className="sr-only">{copy.coverage}</span>
              <select className={fieldClassName} value={coverageFilter} onChange={(event) => setCoverageFilter(event.target.value)}>
                <option value="">{copy.allCoverages}</option>
                <option value="CNAS">CNAS</option>
                <option value="CASNOS">CASNOS</option>
                <option value="UNINSURED">{copy.uninsured}</option>
                <option value="PRIVATE">{copy.private}</option>
              </select>
            </label>
          </div>
        </section>

        <section className="surface-section overflow-hidden" aria-labelledby="record-list-title">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]"><UserRound className="h-4 w-4" strokeWidth={1.8} /></span>
              <div>
                <h2 id="record-list-title" className="text-sm font-semibold text-[var(--ink)]">{copy.list}</h2>
                <p className="mt-0.5 text-xs text-[var(--ink-faint)]">{copy.confidentialNotice}</p>
              </div>
            </div>
            <span className="clinical-figure rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 py-1.5 text-[0.68rem] font-medium text-[var(--ink-soft)]">
              {filteredRecords.length} {copy.results}
            </span>
          </div>

          {filteredRecords.length ? (
            <>
              <div className="divide-y divide-[var(--line)] lg:hidden">
                {filteredRecords.map((patient) => {
                  const isSelected = selectedId === patient.id;
                  const primaryName = locale === "ar" ? `${patient.firstNameAr} ${patient.lastNameAr}` : `${patient.firstName} ${patient.lastName}`;
                  const secondaryName = locale === "ar" ? `${patient.firstName} ${patient.lastName}` : `${patient.firstNameAr} ${patient.lastNameAr}`;
                  return (
                    <button key={patient.id} type="button" aria-current={isSelected ? "true" : undefined} className={cn("block w-full p-4 text-start transition hover:bg-[var(--panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]", isSelected && "bg-[var(--accent-soft)]")} onClick={() => setSelectedId(patient.id)}>
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block font-semibold text-[var(--ink)]">{primaryName}</span>
                          <span className="mt-0.5 block text-sm text-[var(--ink-soft)]" dir={locale === "ar" ? "ltr" : "rtl"}>{secondaryName}</span>
                        </span>
                        <StatusBadge label={getStatusLabel(patient.status, locale)} tone={statusTone[patient.status]} />
                      </span>
                      <span className="mt-3 grid gap-2 text-xs text-[var(--ink-soft)] sm:grid-cols-2">
                        <span className="rounded-[var(--radius-xs)] bg-[var(--panel-soft)] px-3 py-2" dir="ltr">{patient.internalRecordNumber}</span>
                        <span className="rounded-[var(--radius-xs)] bg-[var(--panel-soft)] px-3 py-2">{getAge(patient.birthDate)} {copy.years} · {getSexLabel(patient.sex, locale)} · {getCoverageLabel(patient.coverage, locale)}</span>
                        <span className="rounded-[var(--radius-xs)] bg-[var(--panel-soft)] px-3 py-2">{localized(patient.doctor, locale)}</span>
                        <span className="rounded-[var(--radius-xs)] bg-[var(--panel-soft)] px-3 py-2">{copy.lastConsultation}: {patient.lastConsultation ? formatDate(patient.lastConsultation, locale) : copy.none}</span>
                      </span>
                      {patient.alerts.length ? <span className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[var(--danger-ink)]"><AlertTriangle className="h-3.5 w-3.5" />{localized(patient.alerts[0], locale)}</span> : null}
                    </button>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1040px] border-collapse text-sm">
                  <thead className="bg-[var(--panel-soft)]">
                    <tr className="border-b border-[var(--line)] text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-[var(--ink-faint)]">
                      <th scope="col" className="px-5 py-3 text-start">{copy.list}</th>
                      <th scope="col" className="px-4 py-3 text-start">{copy.ageSex}</th>
                      <th scope="col" className="px-4 py-3 text-start">{copy.recordNumber}</th>
                      <th scope="col" className="px-4 py-3 text-start">{copy.coverage}</th>
                      <th scope="col" className="px-4 py-3 text-start">{copy.doctor}</th>
                      <th scope="col" className="px-4 py-3 text-start">{copy.lastConsultation}</th>
                      <th scope="col" className="px-4 py-3 text-start">{copy.status}</th>
                      <th scope="col" className="px-5 py-3 text-end"><span className="sr-only">{copy.openRecord}</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {filteredRecords.map((patient) => {
                      const isSelected = selectedId === patient.id;
                      const primaryName = locale === "ar" ? `${patient.firstNameAr} ${patient.lastNameAr}` : `${patient.firstName} ${patient.lastName}`;
                      const secondaryName = locale === "ar" ? `${patient.firstName} ${patient.lastName}` : `${patient.firstNameAr} ${patient.lastNameAr}`;
                      return (
                        <tr key={patient.id} className={cn("transition hover:bg-[var(--panel-soft)]", isSelected && "bg-[var(--accent-soft)]")}>
                          <th scope="row" className="px-5 py-4 text-start font-normal">
                            <button type="button" className="group flex items-center gap-3 text-start" onClick={() => setSelectedId(patient.id)} aria-current={isSelected ? "true" : undefined}>
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--medical-soft)] text-[0.68rem] font-semibold text-[var(--medical)] ring-1 ring-[var(--accent-line)]">{patient.firstName.charAt(0)}{patient.lastName.charAt(0)}</span>
                              <span className="min-w-0">
                                <span className="block font-semibold text-[var(--ink)] group-hover:text-[var(--medical)]">{primaryName}</span>
                                <span className="mt-0.5 block text-xs text-[var(--ink-soft)]" dir={locale === "ar" ? "ltr" : "rtl"}>{secondaryName}</span>
                                {patient.alerts.length ? <span className="mt-1 flex items-center gap-1 text-[0.68rem] text-[var(--danger-ink)]"><AlertTriangle className="h-3 w-3" />{localized(patient.alerts[0], locale)}</span> : null}
                              </span>
                            </button>
                          </th>
                          <td className="px-4 py-4 text-[var(--ink-soft)]">{getAge(patient.birthDate)} {copy.years}<span className="block text-xs text-[var(--ink-faint)]">{getSexLabel(patient.sex, locale)}</span></td>
                          <td className="clinical-figure px-4 py-4 text-xs text-[var(--ink-soft)]" dir="ltr">{patient.internalRecordNumber}<span className="mt-1 block text-[0.65rem] text-[var(--ink-faint)]">NIN {patient.nin}</span></td>
                          <td className="px-4 py-4"><span className="rounded-full border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 py-1 text-xs font-medium text-[var(--ink-soft)]">{getCoverageLabel(patient.coverage, locale)}</span></td>
                          <td className="max-w-[15rem] px-4 py-4 text-xs leading-5 text-[var(--ink-soft)]">{localized(patient.doctor, locale)}</td>
                          <td className="px-4 py-4 text-xs text-[var(--ink-soft)]">{patient.lastConsultation ? formatDate(patient.lastConsultation, locale) : copy.none}</td>
                          <td className="px-4 py-4"><StatusBadge label={getStatusLabel(patient.status, locale)} tone={statusTone[patient.status]} /></td>
                          <td className="px-5 py-4 text-end">
                            <button type="button" className="clinical-icon-button" onClick={() => setSelectedId(patient.id)} aria-label={`${copy.openRecord} — ${primaryName}`}>
                              <ChevronRight className="clinical-directional h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="px-6 py-14 text-center">
              <Search className="mx-auto h-7 w-7 text-[var(--ink-faint)]" strokeWidth={1.5} aria-hidden="true" />
              <p className="mt-3 text-sm text-[var(--ink-soft)]">{copy.empty}</p>
              <button type="button" className="clinical-button mt-4 bg-[var(--panel)]" onClick={resetFilters}>{copy.reset}</button>
            </div>
          )}
        </section>

        {selectedPatient ? <MedicalRecordDetail key={selectedPatient.id} locale={locale} patient={selectedPatient} /> : (
          <div className="surface-section px-6 py-12 text-center text-sm text-[var(--ink-faint)]">{copy.selectRecord}</div>
        )}
      </div>

      {isNewRecordOpen ? (
        <NewRecordModal
          authorName={currentUser.data?.fullName || t("dashboard.clinical.administration")}
          doctors={doctors}
          locale={locale}
          onClose={() => setNewRecordOpen(false)}
          onCreate={createRecord}
          wilayas={wilayas}
        />
      ) : null}
    </DashboardShell>
  );
}
