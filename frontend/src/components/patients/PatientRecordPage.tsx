"use client";

import {
  AlertTriangle,
  BrainCircuit,
  CalendarPlus,
  ClipboardPlus,
  FilePlus2,
  History,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { doctorNavSections, establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { Button } from "@/components/ui/button";
import { getMockPatientById } from "@/data/patients.mock";
import { formatPatientDate, formatPatientDateTime, getPatientAge } from "@/features/patients/patient-registry";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type PatientRecordPageProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  patientId: string;
};

type RecordTab =
  | "summary" | "timeline" | "consultations" | "diagnostics" | "allergies"
  | "medications" | "vitals" | "labs" | "imaging" | "documents"
  | "appointments" | "careTeam" | "consents" | "audit";

const copy = {
  fr: {
    actions: { appointment: "Rendez-vous", consultation: "Nouvelle consultation", document: "Ajouter document" },
    aiDisclaimer: "Aide à la décision, non substitutive à l’avis médical. Toute conclusion diagnostique doit être validée par un praticien habilité.",
    aiKicker: "Sortie IA · séparée du diagnostic médical",
    allergyNone: "Aucune allergie documentée",
    allergyTitle: "Allergies",
    auditTitle: "Audit / Historique non désactivable",
    consentTitle: "Consentements Loi 18-07",
    notFound: "Ce dossier patient est introuvable.",
    record: "Dossier patient longitudinal",
    tabs: {
      summary: "Résumé", timeline: "Chronologie", consultations: "Consultations", diagnostics: "Diagnostics",
      allergies: "Allergies", medications: "Médicaments", vitals: "Constantes", labs: "Examens / Analyses",
      imaging: "Imagerie / Pathologie", documents: "Documents", appointments: "Rendez-vous",
      careTeam: "Équipe médicale", consents: "Consentements", audit: "Audit",
    },
  },
  ar: {
    actions: { appointment: "موعد", consultation: "استشارة جديدة", document: "إضافة وثيقة" },
    aiDisclaimer: "أداة مساعدة للقرار ولا تعوّض الرأي الطبي. يجب أن يصادق طبيب مؤهل على كل استنتاج تشخيصي.",
    aiKicker: "نتيجة الذكاء الاصطناعي · منفصلة عن التشخيص الطبي",
    allergyNone: "لا توجد حساسية موثقة",
    allergyTitle: "الحساسية",
    auditTitle: "التدقيق / السجل غير القابل للتعطيل",
    consentTitle: "الموافقات وفق القانون 18-07",
    notFound: "تعذر العثور على ملف المريض.",
    record: "ملف المريض الطولي",
    tabs: {
      summary: "الملخص", timeline: "التسلسل الزمني", consultations: "الاستشارات", diagnostics: "التشخيصات",
      allergies: "الحساسية", medications: "الأدوية", vitals: "المؤشرات", labs: "الفحوصات / التحاليل",
      imaging: "التصوير / علم الأمراض", documents: "الوثائق", appointments: "المواعيد",
      careTeam: "الفريق الطبي", consents: "الموافقات", audit: "التدقيق",
    },
  },
} as const;

const tabs: RecordTab[] = [
  "summary", "timeline", "consultations", "diagnostics", "allergies", "medications",
  "vitals", "labs", "imaging", "documents", "appointments", "careTeam", "consents", "audit",
];

function EmptyTab({ label }: { label: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] px-6 py-14 text-center">
      <svg className="mx-auto h-10 w-32 text-[var(--line)]" viewBox="0 0 128 40" fill="none" aria-hidden="true"><path d="M0 21h35l5-13 8 27 8-20 7 12 6-6h59" stroke="currentColor" strokeWidth="1.5" /></svg>
      <p className="mt-4 text-sm text-[var(--ink-faint)]">{label}</p>
    </div>
  );
}

export function PatientRecordPage({ accountType, patientId }: PatientRecordPageProps) {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const localized = copy[locale];
  const patient = useMemo(() => getMockPatientById(patientId, locale), [locale, patientId]);
  const [activeTab, setActiveTab] = useState<RecordTab>("summary");

  const shellProps = accountType === "ESTABLISHMENT"
    ? {
        accountType: "ESTABLISHMENT" as const,
        navSections: establishmentNavSections,
        user: { accountType: "ESTABLISHMENT" as const, footerSubtitle: "Administration", initials: "HE", name: "Healix Clinique", roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: "Clinique El Shifa" },
      }
    : {
        accountType: "INDEPENDENT_DOCTOR" as const,
        navSections: doctorNavSections,
        user: { accountType: "INDEPENDENT_DOCTOR" as const, footerSubtitle: "Neurologie", initials: "SB", name: "Dr Samir Benali", roleKey: "dashboard.common.roles.doctor", workspaceSubtitle: "Cabinet HealixDZ" },
      };

  if (!patient) {
    return (
      <DashboardShell {...shellProps} activeKey="patients" breadcrumbLabel={t("patients.page.breadcrumb")} titleKey={accountType === "ESTABLISHMENT" ? "patients.page.title" : "patients.page.doctorTitle"}>
        <EmptyTab label={localized.notFound} />
      </DashboardShell>
    );
  }

  const name = locale === "ar" ? `${patient.firstNameAr} ${patient.lastNameAr}` : `${patient.firstName} ${patient.lastName}`;
  const secondaryName = locale === "ar" ? `${patient.firstName} ${patient.lastName}` : `${patient.firstNameAr} ${patient.lastNameAr}`;

  return (
    <DashboardShell {...shellProps} activeKey="patients" breadcrumbLabel={name} titleKey={accountType === "ESTABLISHMENT" ? "patients.page.title" : "patients.page.doctorTitle"}>
      <div className="space-y-5">
        <section className="sticky top-3 z-20 rounded-xl border border-[var(--line)] bg-card p-4 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.8rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]"><UserRound className="h-5 w-5" strokeWidth={1.7} /></span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h1 className="font-[var(--font-auth-display)] text-2xl font-medium text-[var(--ink)]">{name}</h1><span className="rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2.5 py-1 font-[var(--font-auth-mono)] text-[0.58rem] text-[var(--accent-dark)]">{localized.record}</span></div>
                <p className="mt-0.5 text-sm text-[var(--ink-faint)]" lang={locale === "ar" ? "fr" : "ar"}>{secondaryName}</p>
                <p className="mt-1 font-[var(--font-auth-mono)] text-[0.62rem] text-[var(--ink-soft)]" dir="ltr">{patient.id} · {getPatientAge(patient.birthDate)} {t("patients.common.years")} · {formatPatientDate(patient.birthDate, locale)}</p>
              </div>
            </div>

            <div className={cn("rounded-[0.75rem] border px-3 py-2", patient.medicalSummary.allergies.length ? "border-[var(--warning-line)] bg-[var(--warning-soft)]" : "border-[var(--line)] bg-muted")}>
              <div className="flex items-center gap-2"><AlertTriangle className={cn("h-4 w-4", patient.medicalSummary.allergies.length ? "text-[var(--warning-ink)]" : "text-[var(--ink-faint)]")} strokeWidth={1.7} /><span className="font-[var(--font-auth-mono)] text-[0.6rem] uppercase tracking-[0.1em] text-[var(--ink-soft)]">{localized.allergyTitle}</span></div>
              <p className="mt-1 text-xs font-medium text-[var(--ink)]">{patient.medicalSummary.allergies.join(" · ") || localized.allergyNone}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button className="rounded-full px-4"><ClipboardPlus className="me-2 h-4 w-4" strokeWidth={1.7} />{localized.actions.consultation}</Button>
              <Button variant="outline" className="rounded-full border-[var(--line)] bg-[var(--panel)] text-[var(--ink-soft)]"><CalendarPlus className="me-2 h-4 w-4" strokeWidth={1.7} />{localized.actions.appointment}</Button>
              <Button variant="outline" className="rounded-full border-[var(--line)] bg-[var(--panel)] text-[var(--ink-soft)]"><FilePlus2 className="me-2 h-4 w-4" strokeWidth={1.7} />{localized.actions.document}</Button>
            </div>
          </div>
        </section>

        <nav className="overflow-x-auto rounded-[0.9rem] border border-[var(--line)] bg-[var(--panel)] p-1.5" aria-label={localized.record}>
          <div className="flex min-w-max gap-1">
            {tabs.map((tab) => <button key={tab} className={cn("rounded-[0.6rem] px-3 py-2 text-xs font-medium text-[var(--ink-soft)] transition", activeTab === tab && "bg-[var(--accent-soft)] text-[var(--accent-dark)]")} type="button" onClick={() => setActiveTab(tab)}>{localized.tabs[tab]}</button>)}
          </div>
        </nav>

        {activeTab === "summary" ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
            <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-[0.72rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]"><Stethoscope className="h-4 w-4" strokeWidth={1.7} /></span><div><p className="font-[var(--font-auth-mono)] text-[0.62rem] uppercase tracking-[0.11em] text-[var(--ink-faint)]">{localized.tabs.consultations}</p><h2 className="mt-1 font-[var(--font-auth-display)] text-xl font-medium text-[var(--ink)]">{patient.assignedDoctor}</h2></div></div>
              <dl className="mt-5 grid gap-4 border-t border-[var(--line)] pt-5 sm:grid-cols-2">
                <div><dt className="font-[var(--font-auth-mono)] text-[0.6rem] uppercase tracking-[0.1em] text-[var(--ink-faint)]">{t("patients.table.columns.lastVisit")}</dt><dd className="mt-1 text-sm text-[var(--ink)]">{formatPatientDate(patient.lastVisit, locale)}</dd></div>
                <div><dt className="font-[var(--font-auth-mono)] text-[0.6rem] uppercase tracking-[0.1em] text-[var(--ink-faint)]">{t("patients.table.nextShort")}</dt><dd className="mt-1 text-sm text-[var(--ink)]">{formatPatientDate(patient.nextVisit, locale, t("patients.common.none"))}</dd></div>
              </dl>
            </section>

            <section className="rounded-xl border border-[var(--accent-line)] bg-muted p-5">
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-[0.72rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]"><BrainCircuit className="h-4 w-4" strokeWidth={1.7} /></span><div><p className="font-[var(--font-auth-mono)] text-[0.6rem] uppercase tracking-[0.1em] text-[var(--accent)]">{localized.aiKicker}</p><p className="mt-1 text-sm font-medium text-[var(--ink)]">IRM · Healix Vision 2.1 · {patient.aiAnalyses[0]?.score ?? 0}%</p></div></div>
              <p className="mt-4 border-s-2 border-[var(--specialty-brain)] ps-3 text-xs leading-5 text-[var(--ink-soft)]">{localized.aiDisclaimer}</p>
            </section>
          </div>
        ) : null}

        {activeTab === "consents" ? (
          <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
            <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-[var(--accent-dark)]" strokeWidth={1.7} /><h2 className="font-[var(--font-auth-display)] text-xl font-medium text-[var(--ink)]">{localized.consentTitle}</h2></div>
            <div className="mt-5 divide-y divide-[var(--line)]">{patient.consents.map((consent) => <div key={consent.type} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><p className="text-sm font-medium text-[var(--ink)]">{consent.type.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-[var(--ink-faint)]">{consent.documentName || t("patients.common.none")}</p></div><div className="sm:text-end"><span className={cn("rounded-full border px-2.5 py-1 font-[var(--font-auth-mono)] text-[0.6rem]", consent.status === "SIGNED" ? "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]" : "border-[var(--line)] bg-muted text-[var(--ink-soft)]")}>{consent.status}</span><p className="mt-2 text-xs text-[var(--ink-faint)]">{formatPatientDateTime(consent.recordedAt, locale)}</p></div></div>)}</div>
          </section>
        ) : null}

        {activeTab === "audit" ? (
          <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
            <div className="flex items-center gap-3"><History className="h-5 w-5 text-[var(--accent-dark)]" strokeWidth={1.7} /><h2 className="font-[var(--font-auth-display)] text-xl font-medium text-[var(--ink)]">{localized.auditTitle}</h2></div>
            <div className="mt-5 divide-y divide-[var(--line)]">{patient.audit.map((entry) => <article key={entry.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto]"><div><p className="text-sm font-medium text-[var(--ink)]">{entry.action}</p><p className="mt-1 text-xs text-[var(--ink-soft)]">{entry.actor} · {entry.organization}</p></div><time className="font-[var(--font-auth-mono)] text-[0.62rem] text-[var(--ink-faint)]">{formatPatientDateTime(entry.at, locale)}</time></article>)}</div>
          </section>
        ) : null}

        {activeTab !== "summary" && activeTab !== "consents" && activeTab !== "audit" ? <EmptyTab label={localized.tabs[activeTab]} /> : null}
      </div>
    </DashboardShell>
  );
}
