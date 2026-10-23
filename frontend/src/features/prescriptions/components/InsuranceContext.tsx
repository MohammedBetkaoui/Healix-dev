import { BadgeDollarSign, CreditCard } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

import { type VerificationState } from "../types/prescription.types";
import { aggregateVerification } from "../utils/prescription-form";

type InsuranceContextProps = {
  /** CNAS, CASNOS, PRIVATE, UNINSURED as stored on the patient; null when unknown. */
  organization: string | null;
  maskedInsuredNumber: string | null;
  /** Verification state of each medication (reference data; UNKNOWN for a saved line). */
  reimbursable: VerificationState[];
  priorApproval: VerificationState[];
  t: TranslationFunction;
};

const knownOrganizations = new Set(["CNAS", "CASNOS", "PRIVATE", "UNINSURED"]);

export function InsuranceContext({ organization, maskedInsuredNumber, reimbursable, priorApproval, t }: InsuranceContextProps) {
  const missing = t("prescriptions.common.notProvided");
  const reimbursableState = aggregateVerification(reimbursable);
  const priorApprovalState = aggregateVerification(priorApproval);
  const verificationLabel = (state: VerificationState) => state === "YES" ? t("prescriptions.common.yes") : state === "NO" ? t("prescriptions.common.no") : t("prescriptions.common.unknown");
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><CreditCard size={16} className="text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />{t("prescriptions.insurance.title")}</h3>
      <dl className="mt-3 grid gap-x-4 gap-y-3 text-[.72rem] sm:grid-cols-2">
        <div><dt className="text-[var(--text-muted)]">{t("prescriptions.insurance.organization")}</dt><dd className="mt-0.5 font-semibold">{organization && knownOrganizations.has(organization) ? t(`prescriptions.insurance.organizations.${organization}`) : missing}</dd></div>
        <div><dt className="text-[var(--text-muted)]">{t("prescriptions.insurance.insuredNumber")}</dt><dd className="mt-0.5 font-semibold" dir="ltr">{maskedInsuredNumber ?? missing}</dd></div>
        <div><dt className="text-[var(--text-muted)]">{t("prescriptions.insurance.reimbursable")}</dt><dd className="mt-0.5 font-semibold">{verificationLabel(reimbursableState)}</dd></div>
        <div><dt className="text-[var(--text-muted)]">{t("prescriptions.insurance.priorApproval")}</dt><dd className="mt-0.5 font-semibold">{priorApprovalState === "YES" ? t("prescriptions.insurance.required") : priorApprovalState === "NO" ? t("prescriptions.insurance.notRequired") : t("prescriptions.common.unknown")}</dd></div>
      </dl>
      <p className="mt-3 flex items-start gap-2 border-t border-[var(--line-soft)] pt-3 text-[.66rem] leading-5 text-[var(--text-secondary)]"><BadgeDollarSign size={14} className="mt-0.5 shrink-0 text-[var(--medical)]" aria-hidden="true" />{t("prescriptions.insurance.notice")}</p>
    </section>
  );
}
