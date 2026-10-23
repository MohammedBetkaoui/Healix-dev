import { ClinicalReportCategory, ClinicalReportSource } from '@prisma/client';

/** Sections of a written report, in the order they are printed. */
export const REPORT_SECTIONS = [
  { id: 'reason', title: 'Motif' },
  { id: 'context', title: 'Contexte' },
  { id: 'findings', title: 'Constatations' },
  { id: 'results', title: 'Résultats' },
  { id: 'interpretation', title: 'Interprétation' },
  { id: 'recommendations', title: 'Recommandations' },
] as const;

export const REPORT_SECTION_IDS: string[] = REPORT_SECTIONS.map(
  (section) => section.id,
);

export const sectionTitle = (id: string) =>
  REPORT_SECTIONS.find((section) => section.id === id)?.title ?? id;

/** Categories a physician can write a report in. */
export const WRITTEN_CATEGORIES = [
  ClinicalReportCategory.CONSULTATION_NOTE,
  ClinicalReportCategory.RADIOLOGY,
  ClinicalReportCategory.LABORATORY_RESULT,
  ClinicalReportCategory.OTHER_CLINICAL,
] as const;

/** Categories of an imported document. */
export const IMPORT_CATEGORIES = [
  ClinicalReportCategory.EXTERNAL_MEDICAL,
  ClinicalReportCategory.RADIOLOGY,
  ClinicalReportCategory.OTHER_CLINICAL,
] as const;

export const sourceForCategory = (
  category: ClinicalReportCategory,
): ClinicalReportSource => {
  switch (category) {
    case ClinicalReportCategory.RADIOLOGY:
      return ClinicalReportSource.IMAGING;
    case ClinicalReportCategory.LABORATORY_RESULT:
      return ClinicalReportSource.LABORATORY;
    case ClinicalReportCategory.CONSULTATION_NOTE:
      return ClinicalReportSource.CONSULTATION;
    case ClinicalReportCategory.EXTERNAL_MEDICAL:
      return ClinicalReportSource.EXTERNAL_DOCUMENT;
    default:
      return ClinicalReportSource.OTHER;
  }
};
