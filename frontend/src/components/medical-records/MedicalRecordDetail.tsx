"use client";

import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CalendarDays,
  ClipboardList,
  ContactRound,
  Droplets,
  FileCheck2,
  FileText,
  HeartPulse,
  History,
  LockKeyhole,
  Pill,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import { medicalRecordsCopy } from "@/features/medical-records/medical-records.copy";
import {
  type LocalizedClinicalText,
  type MedicalRecordEvent,
  type MedicalRecordPatient,
  type MedicalRecordTab,
} from "@/features/medical-records/medical-records.types";
import { type Locale } from "@/i18n";
import { cn } from "@/lib/utils";
import { type DashboardStatusTone } from "@/types/dashboard";

type MedicalRecordDetailProps = {
  locale: Locale;
  patient: MedicalRecordPatient;
};

const tabOrder: MedicalRecordTab[] = [
  "summary",
  "consultations",
  "history",
  "treatments",
  "documents",
  "imaging",
  "consents",
  "access",
];

const tabIcons = {
  access: History,
  consents: FileCheck2,
  consultations: Stethoscope,
  documents: FileText,
  history: ClipboardList,
  imaging: BrainCircuit,
  summary: HeartPulse,
  treatments: Pill,
} as const;

const statusTone: Record<MedicalRecordPatient["status"], DashboardStatusTone> = {
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

function formatDate(value: string, locale: Locale, withTime = false) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    day: "2-digit",
    hour: withTime ? "2-digit" : undefined,
    minute: withTime ? "2-digit" : undefined,
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function DetailCard({ children, icon, label }: { children: ReactNode; icon: ReactNode; label: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)] p-4">
      <dt className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--ink-faint)]">
        <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--panel-soft)] text-[var(--medical)] ring-1 ring-[var(--line)]">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="mt-3 text-sm leading-6 text-[var(--ink)]">{children}</dd>
    </div>
  );
}

function ClinicalList({
  empty,
  items,
  locale,
  tone = "default",
}: {
  empty: string;
  items: LocalizedClinicalText[];
  locale: Locale;
  tone?: "danger" | "default";
}) {
  if (!items.length) return <p className="text-sm text-[var(--ink-faint)]">{empty}</p>;

  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li
          key={`${item.fr}-${index}`}
          className={cn(
            "flex items-start gap-2 rounded-[var(--radius-sm)] border px-3 py-2.5 text-sm leading-5",
            tone === "danger"
              ? "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]"
              : "border-[var(--line)] bg-[var(--panel-soft)] text-[var(--ink-soft)]",
          )}
        >
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
          {localized(item, locale)}
        </li>
      ))}
    </ul>
  );
}

function EventList({
  empty,
  events,
  locale,
}: {
  empty: string;
  events: MedicalRecordEvent[];
  locale: Locale;
}) {
  if (!events.length) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--line)] bg-[var(--panel-soft)] px-5 py-10 text-center text-sm text-[var(--ink-faint)]">
        {empty}
      </div>
    );
  }

  return (
    <ol className="divide-y divide-[var(--line)] rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)]">
      {events.map((event) => (
        <li key={event.id} className="grid gap-3 p-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:p-5">
          <time className="clinical-figure text-xs font-medium text-[var(--ink-faint)]" dateTime={event.date}>
            {formatDate(event.date, locale, true)}
          </time>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-[var(--ink)]">{localized(event.title, locale)}</h4>
            <p className="mt-1.5 text-sm leading-6 text-[var(--ink-soft)]">{localized(event.detail, locale)}</p>
            {event.author ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[var(--medical)]">
                <UserRound className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                {localized(event.author, locale)}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function SectionHeading({ description, icon, title }: { description: string; icon: ReactNode; title: string }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)] ring-1 ring-[var(--accent-line)]">
        {icon}
      </span>
      <div>
        <h3 className="text-base font-semibold text-[var(--ink)]">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">{description}</p>
      </div>
    </div>
  );
}

export function MedicalRecordDetail({ locale, patient }: MedicalRecordDetailProps) {
  const copy = medicalRecordsCopy[locale];
  const [activeTab, setActiveTab] = useState<MedicalRecordTab>("summary");
  const primaryName = locale === "ar"
    ? `${patient.firstNameAr} ${patient.lastNameAr}`
    : `${patient.firstName} ${patient.lastName}`;
  const secondaryName = locale === "ar"
    ? `${patient.firstName} ${patient.lastName}`
    : `${patient.firstNameAr} ${patient.lastNameAr}`;
  const statusLabel = patient.status === "URGENT" ? copy.urgent : patient.status === "FOLLOW_UP" ? copy.followUp : copy.active;
  const sexLabel = patient.sex === "FEMALE" ? copy.female : copy.male;
  const coverageLabel = patient.coverage === "UNINSURED" ? copy.uninsured : patient.coverage === "PRIVATE" ? copy.private : patient.coverage;

  return (
    <section className="space-y-4" aria-labelledby="selected-record-title">
      <div className="surface-section surface-raised overflow-hidden border-t-2 border-t-[var(--medical)]">
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--medical-soft)] text-sm font-semibold text-[var(--medical)] ring-1 ring-[var(--accent-line)]">
              {patient.firstName.charAt(0)}{patient.lastName.charAt(0)}
            </span>
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[var(--medical)]">
                <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                {copy.patientHeader}
              </span>
              <h2 id="selected-record-title" className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-2xl">
                {primaryName}
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]" dir={locale === "ar" ? "ltr" : "rtl"}>{secondaryName}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge label={statusLabel} tone={statusTone[patient.status]} />
                <span className="clinical-figure rounded-full border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 py-1 text-[0.68rem] text-[var(--ink-soft)]" dir="ltr">
                  {patient.internalRecordNumber}
                </span>
                <span className="clinical-figure rounded-full border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 py-1 text-[0.68rem] text-[var(--ink-soft)]" dir="ltr">
                  NIN {patient.nin}
                </span>
              </div>
            </div>
          </div>

          <dl className="grid shrink-0 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:max-w-xl">
            <div>
              <dt className="text-xs text-[var(--ink-faint)]">{copy.ageSex}</dt>
              <dd className="mt-0.5 font-medium text-[var(--ink)]">{getAge(patient.birthDate)} {copy.years} · {sexLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ink-faint)]">{copy.coverage}</dt>
              <dd className="mt-0.5 font-medium text-[var(--ink)]">{coverageLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ink-faint)]">{copy.wilaya}</dt>
              <dd className="mt-0.5 font-medium text-[var(--ink)]">{localized(patient.wilaya, locale)} · {localized(patient.commune, locale)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ink-faint)]">{copy.lastUpdate}</dt>
              <dd className="mt-0.5 font-medium text-[var(--ink)]">{formatDate(patient.lastUpdated, locale, true)}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--line)] bg-[var(--panel-soft)] px-5 py-3.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="flex items-center gap-2 font-medium text-[var(--ink-soft)]">
            <LockKeyhole className="h-4 w-4 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />
            {copy.confidentialNotice}
          </p>
          <p className="text-[var(--ink-faint)]">{copy.noNationalRegistry}</p>
        </div>
      </div>

      {patient.alerts.length ? (
        <aside className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-4 py-3" aria-label={copy.alerts}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger-ink)]" strokeWidth={1.8} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--danger-ink)]">{copy.alerts}</p>
            <p className="mt-1 text-sm text-[var(--ink)]">{patient.alerts.map((item) => localized(item, locale)).join(" · ")}</p>
          </div>
        </aside>
      ) : null}

      <nav className="surface-section overflow-hidden" aria-label={copy.clinicalSummary}>
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-1 p-1.5" role="tablist">
            {tabOrder.map((tab) => {
              const Icon = tabIcons[tab];
              const label = tab === "summary"
                ? copy.clinicalSummary
                : tab === "consultations"
                  ? copy.consultations
                  : tab === "history"
                    ? copy.history
                    : tab === "treatments"
                      ? copy.treatments
                      : tab === "documents"
                        ? copy.documents
                        : tab === "imaging"
                          ? copy.imaging
                          : tab === "consents"
                            ? copy.consent
                            : copy.access;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls={`record-panel-${tab}`}
                  id={`record-tab-${tab}`}
                  className={cn(
                    "flex items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2.5 text-xs font-medium transition",
                    activeTab === tab
                      ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)] shadow-[inset_0_-2px_0_var(--accent)]"
                      : "border-transparent text-[var(--ink-soft)] hover:border-[var(--line)] hover:bg-[var(--panel-soft)] hover:text-[var(--ink)]",
                  )}
                  onClick={() => setActiveTab(tab)}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <div role="tabpanel" id={`record-panel-${activeTab}`} aria-labelledby={`record-tab-${activeTab}`} tabIndex={0}>
        {activeTab === "summary" ? (
          <section className="surface-section p-5 sm:p-6">
            <SectionHeading title={copy.clinicalSummary} description={copy.lastUpdate + " · " + formatDate(patient.lastUpdated, locale, true)} icon={<HeartPulse className="h-4 w-4" strokeWidth={1.8} />} />
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DetailCard label={copy.allergies} icon={<AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.8} />}>
                <ClinicalList items={patient.allergies} empty={copy.noKnownAllergy} locale={locale} tone={patient.allergies.length ? "danger" : "default"} />
              </DetailCard>
              <DetailCard label={copy.medicalHistory} icon={<Activity className="h-3.5 w-3.5" strokeWidth={1.8} />}>
                <ClinicalList items={patient.chronicConditions} empty={copy.none} locale={locale} />
              </DetailCard>
              <DetailCard label={copy.currentMedication} icon={<Pill className="h-3.5 w-3.5" strokeWidth={1.8} />}>
                <ClinicalList items={patient.currentMedications} empty={copy.noMedication} locale={locale} />
              </DetailCard>
              <DetailCard label={copy.bloodGroup} icon={<Droplets className="h-3.5 w-3.5" strokeWidth={1.8} />}>
                <strong className="clinical-figure text-xl text-[var(--ink)]" dir="ltr">{patient.bloodGroup}</strong>
              </DetailCard>
              <DetailCard label={copy.emergencyContact} icon={<ContactRound className="h-3.5 w-3.5" strokeWidth={1.8} />}>
                <p className="font-semibold">{localized(patient.emergencyContact.name, locale)}</p>
                <p className="text-[var(--ink-soft)]">{localized(patient.emergencyContact.relationship, locale)}</p>
                <a className="mt-1 inline-block text-[var(--medical)]" href={`tel:${patient.emergencyContact.phone.replaceAll(" ", "")}`} dir="ltr">{patient.emergencyContact.phone}</a>
              </DetailCard>
              <DetailCard label={copy.coverage} icon={<ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} />}>
                <p className="font-semibold">{coverageLabel}</p>
                <p className="clinical-figure mt-1 text-xs text-[var(--ink-soft)]" dir="ltr">{patient.coverageNumber || copy.none}</p>
              </DetailCard>
              <DetailCard label={copy.responsibleDoctor} icon={<Stethoscope className="h-3.5 w-3.5" strokeWidth={1.8} />}>
                <p className="font-semibold">{localized(patient.doctor, locale)}</p>
              </DetailCard>
              <DetailCard label={copy.lastUpdate} icon={<CalendarDays className="h-3.5 w-3.5" strokeWidth={1.8} />}>
                <time dateTime={patient.lastUpdated}>{formatDate(patient.lastUpdated, locale, true)}</time>
              </DetailCard>
            </dl>
          </section>
        ) : null}

        {activeTab === "consultations" ? (
          <section className="surface-section p-5 sm:p-6">
            <SectionHeading title={copy.consultationHistory} description={localized(patient.doctor, locale)} icon={<Stethoscope className="h-4 w-4" strokeWidth={1.8} />} />
            <EventList events={patient.consultations} empty={copy.emptyEvents} locale={locale} />
          </section>
        ) : null}

        {activeTab === "history" ? (
          <section className="surface-section p-5 sm:p-6">
            <SectionHeading title={copy.history} description={copy.clinicalSummary} icon={<ClipboardList className="h-4 w-4" strokeWidth={1.8} />} />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[var(--radius-md)] border border-[var(--line)] p-4">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--ink)]"><Activity className="h-4 w-4 text-[var(--medical)]" />{copy.medicalHistory}</h4>
                <ClinicalList items={patient.chronicConditions} empty={copy.none} locale={locale} />
              </div>
              <div className="rounded-[var(--radius-md)] border border-[var(--danger-line)] p-4">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--danger-ink)]"><AlertTriangle className="h-4 w-4" />{copy.allergies}</h4>
                <ClinicalList items={patient.allergies} empty={copy.noKnownAllergy} locale={locale} tone={patient.allergies.length ? "danger" : "default"} />
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "treatments" ? (
          <section className="surface-section p-5 sm:p-6">
            <SectionHeading title={copy.treatments} description={copy.prescriptionsDescription} icon={<Pill className="h-4 w-4" strokeWidth={1.8} />} />
            <EventList events={patient.treatments} empty={copy.emptyEvents} locale={locale} />
          </section>
        ) : null}

        {activeTab === "documents" ? (
          <section className="surface-section p-5 sm:p-6">
            <SectionHeading title={copy.documents} description={copy.documentsDescription} icon={<FileText className="h-4 w-4" strokeWidth={1.8} />} />
            <div className="grid gap-5 xl:grid-cols-2">
              <div>
                <h4 className="mb-3 text-sm font-semibold text-[var(--ink)]">{copy.examinations}</h4>
                <EventList events={patient.examinations} empty={copy.emptyEvents} locale={locale} />
              </div>
              <div>
                <h4 className="mb-3 text-sm font-semibold text-[var(--ink)]">{copy.documents}</h4>
                <EventList events={patient.documents} empty={copy.emptyEvents} locale={locale} />
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "imaging" ? (
          <section className="surface-section p-5 sm:p-6">
            <SectionHeading title={copy.imaging} description={copy.imagingDescription} icon={<BrainCircuit className="h-4 w-4" strokeWidth={1.8} />} />
            <div className="mb-4 flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-4 py-3 text-xs leading-5 text-[var(--accent-dark)]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
              {copy.aiNotice}
            </div>
            <EventList events={patient.imaging} empty={copy.emptyEvents} locale={locale} />
          </section>
        ) : null}

        {activeTab === "consents" ? (
          <section className="surface-section p-5 sm:p-6">
            <SectionHeading title={copy.consent} description={copy.consentDescription} icon={<FileCheck2 className="h-4 w-4" strokeWidth={1.8} />} />
            <EventList events={patient.consents} empty={copy.emptyEvents} locale={locale} />
          </section>
        ) : null}

        {activeTab === "access" ? (
          <section className="surface-section border-t-2 border-t-[var(--medical)] p-5 sm:p-6">
            <SectionHeading title={copy.access} description={copy.accessDescription} icon={<LockKeyhole className="h-4 w-4" strokeWidth={1.8} />} />
            <EventList events={patient.accessHistory} empty={copy.emptyEvents} locale={locale} />
          </section>
        ) : null}
      </div>
    </section>
  );
}
