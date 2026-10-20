import { BadgeDollarSign, CreditCard } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

import { type Medication, type PrescriptionPatient, type VerificationState } from "../types/prescription.types";

type InsuranceContextProps = {
  medications: Medication[];
  patient: PrescriptionPatient;
  t: TranslationFunction;
};

function aggregate(values: VerificationState[]): VerificationState {
  if (values.includes("YES")) return "YES";
  if (values.includes("UNKNOWN") || values.length === 0) return "UNKNOWN";
  return "NO";
}

export function InsuranceContext({ medications, patient, t }: InsuranceContextProps) {
  const missing = t("prescriptions.common.notProvided");
  const reimbursable = aggregate(medications.map((medication) => medication.reimbursable));
  const priorApproval = aggregate(medications.map((medication) => medication.requiresPriorApproval));
  const verificationLabel = (state: VerificationState) => state === "YES" ? t("prescriptions.common.yes") : state === "NO" ? t("prescriptions.common.no") : t("prescriptions.common.unknown");
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><CreditCard size={16} className="text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />{t("prescriptions.insurance.title")}</h3>
      <dl className="mt-3 grid gap-x-4 gap-y-3 text-[.72rem] sm:grid-cols-2">
        <div><dt className="text-[var(--text-muted)]">{t("prescriptions.insurance.organization")}</dt><dd className="mt-0.5 font-semibold">{patient.insurance.organization === "UNKNOWN" ? missing : patient.insurance.organization}</dd></div>
        <div><dt className="text-[var(--text-muted)]">{t("prescriptions.insurance.beneficiary")}</dt><dd className="mt-0.5 font-semibold">{patient.insurance.beneficiaryType === "INSURED" ? t("prescriptions.insurance.insured") : patient.insurance.beneficiaryType === "BENEFICIARY" ? t("prescriptions.insurance.dependent") : missing}</dd></div>
        <div><dt className="text-[var(--text-muted)]">{t("prescriptions.insurance.insuredNumber")}</dt><dd className="mt-0.5 font-semibold" dir="ltr">{patient.insurance.maskedInsuredNumber ?? missing}</dd></div>
        <div><dt className="text-[var(--text-muted)]">{t("prescriptions.insurance.coverageKnown")}</dt><dd className="mt-0.5 font-semibold">{patient.insurance.coverageKnown ? t("prescriptions.common.yes") : missing}</dd></div>
        <div><dt className="text-[var(--text-muted)]">{t("prescriptions.insurance.reimbursable")}</dt><dd className="mt-0.5 font-semibold">{verificationLabel(reimbursable)}</dd></div>
        <div><dt className="text-[var(--text-muted)]">{t("prescriptions.insurance.priorApproval")}</dt><dd className="mt-0.5 font-semibold">{priorApproval === "YES" ? t("prescriptions.insurance.required") : priorApproval === "NO" ? t("prescriptions.insurance.notRequired") : t("prescriptions.common.unknown")}</dd></div>
      </dl>
      <p className="mt-3 flex items-start gap-2 border-t border-[var(--line-soft)] pt-3 text-[.66rem] leading-5 text-[var(--text-secondary)]"><BadgeDollarSign size={14} className="mt-0.5 shrink-0 text-[var(--medical)]" aria-hidden="true" />{t("prescriptions.insurance.notice")}</p>
    </section>
  );
}

