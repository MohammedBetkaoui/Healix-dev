"use client";

import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { doctorNavSections, establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

import {
  mockEncounters,
  mockMedications,
  mockPractitioners,
  mockPrescriptionPatients,
  mockPrescriptions,
} from "../mock-data/prescriptions.mock";
import { type Prescription } from "../types/prescription.types";
import { matchesPrescriptionSearch } from "../utils/prescription-format";
import { mockPrescriptionGrants, resolvePrescriptionCapabilities } from "../utils/prescription-permissions";
import { NewPrescriptionDrawer } from "./NewPrescriptionDrawer";
import { PrescriptionDetail } from "./PrescriptionDetail";
import { PrescriptionFilters, type PrescriptionFilterState } from "./PrescriptionFilters";
import { PrescriptionStats } from "./PrescriptionStats";
import { PrescriptionsHeader } from "./PrescriptionsHeader";
import { PrescriptionsTable } from "./PrescriptionsTable";

type PrescriptionsPageProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
};

type DetailState = {
  action?: "cancel" | "preview";
  id: string;
};

const initialFilters: PrescriptionFilterState = {
  medicationId: "",
  patientId: "",
  period: "",
  prescriberId: "",
  query: "",
  status: "",
  type: "",
};

const referenceDate = new Date("2026-10-19T12:00:00+01:00");

export function PrescriptionsPage({ accountType }: PrescriptionsPageProps) {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const prefill = useEstablishmentVerificationPrefill({ enabled: accountType === "ESTABLISHMENT" });
  const initials = getAccountInitials(currentUser.data?.fullName);
  const capabilities = resolvePrescriptionCapabilities(mockPrescriptionGrants[accountType]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(mockPrescriptions);
  const [filters, setFilters] = useState<PrescriptionFilterState>(initialFilters);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [renewalSource, setRenewalSource] = useState<Prescription | undefined>();
  const [notice, setNotice] = useState("");

  const selectedPrescription = detail ? prescriptions.find((prescription) => prescription.id === detail.id) : undefined;
  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3800);
  };

  const filtered = useMemo(() => prescriptions.filter((prescription) => {
    if (!matchesPrescriptionSearch(prescription, filters.query)) return false;
    if (filters.status && prescription.status !== filters.status) return false;
    if (filters.type && prescription.type !== filters.type) return false;
    if (filters.prescriberId && prescription.prescriber.id !== filters.prescriberId) return false;
    if (filters.patientId && prescription.patient.id !== filters.patientId) return false;
    if (filters.medicationId && !prescription.items.some((item) => item.medication.id === filters.medicationId)) return false;
    if (filters.period) {
      const since = new Date(referenceDate);
      since.setDate(since.getDate() - Number(filters.period));
      if (new Date(prescription.prescribedAt) < since) return false;
    }
    return true;
  }), [filters, prescriptions]);

  const stats = useMemo(() => {
    const month = prescriptions.filter((prescription) => {
      const date = new Date(prescription.prescribedAt);
      return date.getFullYear() === 2026 && date.getMonth() === 9;
    }).length;
    const renewBoundary = new Date(referenceDate);
    renewBoundary.setDate(renewBoundary.getDate() + 14);
    return {
      alerts: prescriptions.reduce((count, prescription) => count + prescription.alerts.filter((alert) => !alert.resolved).length, 0),
      canceled: prescriptions.filter((prescription) => prescription.status === "CANCELED").length,
      drafts: prescriptions.filter((prescription) => prescription.status === "DRAFT").length,
      month,
      renewSoon: prescriptions.filter((prescription) => prescription.validUntil && new Date(prescription.validUntil) >= referenceDate && new Date(prescription.validUntil) <= renewBoundary).length,
    };
  }, [prescriptions]);

  const shellProps = accountType === "ESTABLISHMENT"
    ? {
        accountType: "ESTABLISHMENT" as const,
        navSections: establishmentNavSections,
        titleKey: "dashboard.sidebar.establishment.prescriptions",
        user: { accountType: "ESTABLISHMENT" as const, footerSubtitle: t("dashboard.clinical.administration"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.administration"), roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: prefill.data?.establishment.name || t("dashboard.clinical.workspace") },
      }
    : {
        accountType: "INDEPENDENT_DOCTOR" as const,
        navSections: doctorNavSections,
        titleKey: "dashboard.sidebar.doctor.prescriptions",
        user: { accountType: "INDEPENDENT_DOCTOR" as const, footerSubtitle: t("dashboard.clinical.doctor.practice"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.doctor.workspace"), roleKey: "dashboard.common.roles.doctor", workspaceSubtitle: t("dashboard.clinical.doctor.workspace") },
      };

  const openBuilder = (source?: Prescription) => {
    setRenewalSource(source);
    setBuilderOpen(true);
    setDetail(null);
  };

  const savePrescription = (prescription: Prescription, validated: boolean) => {
    setPrescriptions((current) => [prescription, ...current]);
    setBuilderOpen(false);
    setRenewalSource(undefined);
    if (validated) {
      const at = prescription.validatedAt ? new Date(prescription.validatedAt) : referenceDate;
      const date = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ").format(at);
      const time = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { hour: "2-digit", hourCycle: "h23", minute: "2-digit" }).format(at);
      showNotice(t("prescriptions.notices.validated", { doctor: `Dr. ${prescription.prescriber.firstName} ${prescription.prescriber.lastName}`, date, time }));
    } else {
      showNotice(renewalSource ? t("prescriptions.notices.renewal") : t("prescriptions.notices.draftSaved"));
    }
  };

  const cancelPrescription = (prescription: Prescription, reason: string) => {
    const at = "2026-10-19T11:52:00+01:00";
    const actor = `Dr. ${mockPractitioners[0].firstName} ${mockPractitioners[0].lastName}`;
    setPrescriptions((current) => current.map((candidate) => candidate.id === prescription.id ? {
      ...candidate,
      status: "CANCELED",
      canceledAt: at,
      canceledBy: actor,
      cancellationReason: reason,
      auditTrail: [...candidate.auditTrail, { id: `cancel-${Date.now()}`, at, actor, label: { fr: `Ordonnance annulée — ${reason}`, ar: `ألغيت الوصفة — ${reason}` } }],
    } : candidate));
    setDetail(null);
    showNotice(t("prescriptions.notices.canceled"));
  };

  return (
    <DashboardShell {...shellProps} activeKey="prescriptions" breadcrumbLabel={t("prescriptions.page.breadcrumb")}>
      <div className="workspace-stack">
        <PrescriptionsHeader capabilities={capabilities} onNew={() => openBuilder()} onTemplates={() => showNotice(t("prescriptions.notices.templates"))} t={t} />

        <section className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-4 py-3 text-[var(--accent-dark)]">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} strokeWidth={1.8} aria-hidden="true" />
          <div><h2 className="text-sm font-semibold">{t("prescriptions.security.title")}</h2><p className="mt-1 text-[.72rem] leading-5">{t("prescriptions.security.description")}</p></div>
        </section>

        <PrescriptionStats {...stats} t={t} />
        <PrescriptionFilters filters={filters} locale={locale} medications={mockMedications} onChange={setFilters} onReset={() => setFilters(initialFilters)} patients={mockPrescriptionPatients} practitioners={mockPractitioners} resultCount={filtered.length} t={t} />
        <PrescriptionsTable capabilities={capabilities} locale={locale} onCancel={(prescription) => setDetail({ id: prescription.id, action: "cancel" })} onOpen={(prescription) => setDetail({ id: prescription.id })} onPrint={(prescription) => setDetail({ id: prescription.id, action: "preview" })} onRenew={openBuilder} prescriptions={filtered} t={t} />
      </div>

      {notice ? <div className="surface-raised fixed bottom-6 end-6 z-[80] flex max-w-[min(420px,calc(100vw-32px))] items-center gap-2.5 border-[var(--success-line)] px-4 py-3 text-sm font-medium text-[var(--text-primary)]" role="status"><CheckCircle2 size={17} className="shrink-0 text-[var(--success-ink)]" aria-hidden="true" />{notice}</div> : null}

      {builderOpen ? <NewPrescriptionDrawer capabilities={capabilities} encounters={mockEncounters} locale={locale} medications={mockMedications} onClose={() => { setBuilderOpen(false); setRenewalSource(undefined); }} onSave={(prescription) => savePrescription(prescription, false)} onValidate={(prescription) => savePrescription(prescription, true)} patients={mockPrescriptionPatients} prescriber={mockPractitioners[0]} source={renewalSource} t={t} /> : null}
      {selectedPrescription ? <PrescriptionDetail capabilities={capabilities} initialAction={detail?.action} locale={locale} onCancel={(reason) => cancelPrescription(selectedPrescription, reason)} onClose={() => setDetail(null)} onPrint={() => { showNotice(t("prescriptions.notices.printed")); window.print(); }} onRenew={() => openBuilder(selectedPrescription)} prescription={selectedPrescription} t={t} /> : null}
    </DashboardShell>
  );
}

