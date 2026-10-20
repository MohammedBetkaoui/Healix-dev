import { Printer, ShieldAlert, X } from "lucide-react";

import { HealixLogo } from "@/components/shared/HealixLogo";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { localize } from "../prescriptions.copy";
import { type Prescription } from "../types/prescription.types";
import { formatPrescriptionDate, getPatientAge, getPatientDisplayName } from "../utils/prescription-format";

type PrescriptionPreviewProps = {
  locale: Locale;
  onClose: () => void;
  onPrint: () => void;
  prescription: Prescription;
  t: TranslationFunction;
};

export function PrescriptionPreview({ locale, onClose, onPrint, prescription, t }: PrescriptionPreviewProps) {
  const isRegulated = prescription.type !== "STANDARD";
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-[var(--scrim)] p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={t("prescriptions.preview.title")}>
      <div className="mx-auto mb-3 flex w-full max-w-[900px] items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--surface-elevated)] p-3 text-[var(--text-primary)] shadow-[var(--shadow-raised)]">
        <h2 className="text-sm font-semibold">{t("prescriptions.preview.title")}</h2>
        <div className="flex gap-2"><button type="button" className="clinical-button clinical-button-primary" onClick={onPrint}><Printer size={15} aria-hidden="true" />{t("prescriptions.actions.print")}</button><button type="button" className="clinical-icon-button" onClick={onClose} aria-label={t("prescriptions.actions.close")}><X size={18} aria-hidden="true" /></button></div>
      </div>
      <article className="prescription-print-root mx-auto min-h-[1120px] w-full max-w-[794px] bg-white px-10 py-12 text-[#17211d] shadow-2xl sm:px-14 sm:py-14" dir={locale === "ar" ? "rtl" : "ltr"}>
        <header className="grid grid-cols-2 gap-8 border-b-2 border-[#1b7765] pb-6">
          <div><div className="mb-3 w-fit text-[#1b7765]"><HealixLogo className="h-10 max-w-44" /></div><p className="text-sm font-bold">{localize(prescription.prescriber.organization, locale)}</p><p className="mt-1 text-xs leading-5 text-[#52655d]">{localize(prescription.prescriber.professionalAddress, locale)}<br /><bdi dir="ltr">{prescription.prescriber.phone}</bdi></p></div>
          <div className="text-end"><p className="text-base font-bold">Dr. {prescription.prescriber.firstName} {prescription.prescriber.lastName}</p><p className="mt-1 text-sm text-[#52655d]">{localize(prescription.prescriber.specialty, locale)}</p><p className="mt-2 text-xs text-[#52655d]">{t("prescriptions.detail.orderNumber")}<br /><bdi dir="ltr" className="font-semibold text-[#17211d]">{prescription.prescriber.registrationNumber}</bdi></p></div>
        </header>
        {isRegulated ? <div className="mt-5 flex items-start gap-3 border border-[#d6b979] bg-[#fff9ed] p-4 text-[#77531d]"><ShieldAlert className="mt-0.5 shrink-0" size={18} aria-hidden="true" /><div><p className="text-sm font-bold">{t("prescriptions.regulated.title")}</p><p className="mt-1 text-xs leading-5">{prescription.type === "NARCOTIC" ? t("prescriptions.regulated.narcotic") : t("prescriptions.regulated.psychotropic")}</p><p className="mt-1 text-xs font-semibold">{t("prescriptions.regulated.support")}</p></div></div> : null}
        <section className="mt-6 grid grid-cols-[1fr_auto] gap-6 border border-[#d8e2de] bg-[#f5f8f7] p-4 text-xs">
          <div><p><span className="text-[#60736b]">{t("prescriptions.preview.patient")} : </span><strong>{getPatientDisplayName(prescription.patient, locale)}</strong></p><p className="mt-2"><span className="text-[#60736b]">{t("prescriptions.preview.birthDate")} : </span>{formatPrescriptionDate(prescription.patient.birthDate, locale)} · {getPatientAge(prescription.patient.birthDate)} {t("prescriptions.common.years")}</p><p className="mt-2"><span className="text-[#60736b]">{t("prescriptions.preview.file")} : </span><bdi dir="ltr">{prescription.patient.fileNumber}</bdi></p></div>
          <p className="text-end"><span className="text-[#60736b]">{t("prescriptions.preview.date")} : </span><strong>{formatPrescriptionDate(prescription.prescribedAt, locale)}</strong></p>
        </section>
        <h1 className="my-8 text-center text-xl font-bold tracking-[.14em] text-[#123f37]">{t("prescriptions.preview.prescription")}</h1>
        <ol className="space-y-6">
          {prescription.items.map((item, index) => <li key={item.id} className="grid grid-cols-[2rem_1fr] gap-3 border-b border-[#e2e9e6] pb-5"><span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#8fbab0] text-xs font-bold text-[#1b7765]">{index + 1}</span><div><p className="text-sm font-bold">{item.medication.dci}{item.medication.brandName ? <span className="font-normal text-[#52655d]"> / {item.medication.brandName}</span> : null}</p><p className="mt-1 text-xs font-semibold">{item.medication.strength} — {t(`prescriptions.forms.${item.medication.pharmaceuticalForm}`)}</p><div className="mt-3 border-s-2 border-[#9ac7bc] ps-3 text-xs leading-6"><p className="font-semibold">{localize(item.dosePerIntake, locale)}, {localize(item.frequency, locale)}, {localize(item.intakeMoment, locale)}, {item.durationDays} {t("prescriptions.common.days")}</p><p>{t(`prescriptions.routes.${item.medication.route}`)}</p><p>{t("prescriptions.preview.quantity")} : {localize(item.quantity, locale)}</p><p className="mt-1 text-[#52655d]">{localize(item.patientInstructions, locale)}</p></div></div></li>)}
        </ol>
        <footer className="mt-14 grid grid-cols-[1fr_220px] gap-8 text-xs"><div><p>{t("prescriptions.preview.madeAt")} {formatPrescriptionDate(prescription.prescribedAt, locale)}</p><p className="mt-8 text-[#52655d]">{t("prescriptions.preview.reference")} : <bdi dir="ltr" className="font-semibold text-[#17211d]">{prescription.number}</bdi></p></div><div className="h-28 border border-dashed border-[#aebdb7] p-3 text-center text-[#60736b]"><p className="font-semibold">{t("prescriptions.preview.stamp")}</p></div></footer>
        <div className="mt-8 flex h-16 items-center justify-center border border-dashed border-[#c4cfcb] text-center text-[10px] text-[#71837b]">{t("prescriptions.preview.futureVerification")}</div>
      </article>
    </div>
  );
}

