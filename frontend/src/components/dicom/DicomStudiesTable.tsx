"use client";

import { Eye, Trash2 } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import { dicomStudyPagePath, formatBytes } from "@/features/dicom/dicom-import";
import { type DicomStudy } from "@/features/dicom/dicom.types";
import { formatPatientDate } from "@/features/patients/patient-registry";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

type DicomStudiesTableProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  /** Deleting is a write: off on a read-only account. */
  canDelete: boolean;
  deleteTitle?: string;
  locale: Locale;
  onDelete: (study: DicomStudy) => void;
  patientId: string;
  studies: readonly DicomStudy[];
  t: TranslationFunction;
};

// The studies of the record. What the DICOM header says that the record does
// not (name, birth date, sex) is listed in orange under the study: the
// physician looks at it before trusting the images to be this patient's.
export function DicomStudiesTable({
  accountType,
  canDelete,
  deleteTitle,
  locale,
  onDelete,
  patientId,
  studies,
  t,
}: DicomStudiesTableProps) {
  const units: [string, string, string, string] = [
    t("dicom.units.b"),
    t("dicom.units.kb"),
    t("dicom.units.mb"),
    t("dicom.units.gb"),
  ];
  const number = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ");

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[46rem] text-sm">
        <caption className="sr-only">{t("dicom.studies.title")}</caption>
        <thead>
          <tr className="border-b border-[var(--line)] text-start font-[var(--font-auth-mono)] text-[0.6rem] uppercase tracking-[0.1em] text-[var(--ink-faint)]">
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t("dicom.studies.columns.date")}</th>
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t("dicom.studies.columns.modality")}</th>
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t("dicom.studies.columns.description")}</th>
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t("dicom.studies.columns.series")}</th>
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t("dicom.studies.columns.images")}</th>
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t("dicom.studies.columns.size")}</th>
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t("dicom.studies.columns.identity")}</th>
            <th scope="col" className="py-2 text-end font-medium">{t("dicom.studies.columns.actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          {studies.map((study) => (
            <tr key={study.id} className="align-top" data-study={study.id}>
              <td className="py-3 pe-3 text-[var(--ink-soft)]">
                {study.studyDate ? <time dateTime={study.studyDate}>{formatPatientDate(study.studyDate, locale)}</time> : "—"}
              </td>
              <td className="py-3 pe-3 font-[var(--font-auth-mono)] text-xs text-[var(--ink)]"><bdi dir="ltr">{study.modalities.join(", ") || "—"}</bdi></td>
              <td className="py-3 pe-3 text-[var(--ink)]">{study.studyDescription || <span className="text-[var(--ink-faint)]">{t("dicom.studies.noDescription")}</span>}</td>
              <td className="py-3 pe-3 text-[var(--ink-soft)]">{number.format(study.seriesCount)}</td>
              <td className="py-3 pe-3 text-[var(--ink-soft)]">{number.format(study.instancesCount)}</td>
              <td className="py-3 pe-3 text-[var(--ink-soft)]"><bdi dir="ltr">{formatBytes(study.sizeBytes, units)}</bdi></td>
              <td className="py-3 pe-3">
                {study.identityWarnings.length === 0 ? (
                  <StatusBadge label={t("dicom.studies.identityOk")} tone="success" />
                ) : (
                  <div data-identity-warning="true">
                    <StatusBadge label={t("dicom.studies.identityWarning")} tone="warning" />
                    <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--warning-ink)]">
                      {study.identityWarnings.map((warning) => (
                        <li key={warning.field}>
                          {t("dicom.studies.warningDetail", {
                            field: t(`dicom.studies.warningFields.${warning.field}`),
                            value: warning.dicomValue,
                          })}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </td>
              <td className="py-3 text-end">
                <div className="flex flex-wrap justify-end gap-2">
                  <Link className="clinical-button" href={dicomStudyPagePath(accountType, patientId, study.id)}>
                    <Eye size={15} strokeWidth={1.8} aria-hidden="true" />
                    {t("dicom.studies.open")}
                  </Link>
                  <button
                    type="button"
                    className="clinical-button text-[var(--danger-ink)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!canDelete}
                    title={deleteTitle}
                    onClick={() => onDelete(study)}
                  >
                    <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
                    {t("dicom.studies.delete")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
