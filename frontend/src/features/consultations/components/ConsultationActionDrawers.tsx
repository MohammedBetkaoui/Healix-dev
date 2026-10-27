"use client";

import { CreateReportDrawer, type ReportContext, type ReportDraftResult } from "@/features/reports/components/CreateReportDrawer";
import { type ReportCapabilities } from "@/features/reports/types/report.types";
import { NewPrescriptionDrawer, type BuilderResult, type PrescriptionContext } from "@/features/prescriptions/components/NewPrescriptionDrawer";
import { getPatientDisplayName } from "@/features/prescriptions/utils/prescription-format";
import { type PrescriptionCapabilities } from "@/features/prescriptions/types/prescription.types";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type ConsultationDetail } from "../types/consultation.types";
import { consultationLabel } from "../utils/consultation-utils";

/** The patient and the consultation a prescription or a report written from this consultation is about. */
export function consultationContext(consultation: ConsultationDetail, locale: Locale): PrescriptionContext & ReportContext {
  const record = consultation.patient.hospitalRecordNumber;
  return {
    encounterId: consultation.id,
    encounterLabel: consultationLabel(consultation.startedAt ?? consultation.createdAt, consultation.chiefComplaint, locale),
    patient: {
      id: consultation.patient.id,
      label: `${getPatientDisplayName(consultation.patient, locale)}${record ? ` · ${record}` : ""}`,
    },
  };
}

type PrescribeProps = {
  capabilities: PrescriptionCapabilities;
  consultation: ConsultationDetail;
  locale: Locale;
  onClose: () => void;
  onDone: (result: BuilderResult) => void;
  t: TranslationFunction;
};

// The prescription builder, opened for this patient and this consultation.
export function ConsultationPrescribeDrawer({ capabilities, consultation, locale, onClose, onDone, t }: PrescribeProps) {
  return <NewPrescriptionDrawer capabilities={capabilities} context={consultationContext(consultation, locale)} locale={locale} onClose={onClose} onDone={onDone} t={t} />;
}

type ReportProps = {
  capabilities: ReportCapabilities;
  consultation: ConsultationDetail;
  locale: Locale;
  onClose: () => void;
  onDone: (result: ReportDraftResult) => void;
  t: TranslationFunction;
};

// The report editor, opened for this patient and this consultation.
export function ConsultationReportDrawer({ capabilities, consultation, locale, onClose, onDone, t }: ReportProps) {
  return <CreateReportDrawer capabilities={capabilities} context={consultationContext(consultation, locale)} locale={locale} onClose={onClose} onDone={onDone} t={t} />;
}
