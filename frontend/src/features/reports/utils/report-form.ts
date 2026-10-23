import {
  type ClinicalReport,
  type ReportSectionId,
  type ReportSectionInput,
} from "../types/report.types";

export const REPORT_SECTION_FIELDS: ReportSectionId[] = ["reason", "context", "findings", "results", "interpretation", "recommendations"];

/** What the form of a written report holds (one text per section, plus the conclusion). */
export type ReportFormValues = Record<ReportSectionId, string> & { conclusion: string; title: string };

export const emptyReportForm: ReportFormValues = {
  conclusion: "",
  context: "",
  findings: "",
  interpretation: "",
  reason: "",
  recommendations: "",
  results: "",
  title: "",
};

/** The form of an existing draft. */
export function formFromReport(report: Pick<ClinicalReport, "conclusion" | "sections" | "title">): ReportFormValues {
  const form: ReportFormValues = { ...emptyReportForm, conclusion: report.conclusion ?? "", title: report.title };
  for (const section of report.sections) {
    if ((REPORT_SECTION_FIELDS as string[]).includes(section.id)) form[section.id as ReportSectionId] = section.body;
  }
  return form;
}

/** The sections to send: the filled ones only. */
export function sectionsFromForm(form: ReportFormValues): ReportSectionInput[] {
  return REPORT_SECTION_FIELDS.flatMap((id) => (form[id].trim() ? [{ body: form[id].trim(), id }] : []));
}

/** A report needs a title and some content (a section or a conclusion) to be finalized. */
export function canSaveReport(form: ReportFormValues) {
  return form.title.trim().length > 0;
}

export function canFinalizeForm(form: ReportFormValues) {
  return canSaveReport(form) && (sectionsFromForm(form).length > 0 || form.conclusion.trim().length > 0);
}
