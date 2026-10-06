import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";

import { getVerificationHref } from "@/lib/auth/auth-routes";
import { type TranslationFunction } from "@/lib/i18n";

type VerificationRequiredNoticeProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT" | "INDEPENDENT_DOCTOR";
  t: TranslationFunction;
};

// Shown instead of a generic error when the backend refuses a medical feature
// with VERIFICATION_REQUIRED (see isVerificationRequiredError). Same notice
// layout as VerificationAccessBanner's "unverified" state.
export function VerificationRequiredNotice({
  accountType,
  t,
}: VerificationRequiredNoticeProps) {
  return (
    <section
      role="status"
      className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-s-[3px] border-[var(--border)] border-s-[color:var(--warning)] bg-[var(--surface)] px-5 py-4 md:flex-row md:items-center md:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--warning-soft)] text-[var(--warning-ink)]">
          <ShieldAlert size={18} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {t("common.verificationRequired.title")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
            {t("common.verificationRequired.description")}
          </p>
        </div>
      </div>
      <Link
        href={getVerificationHref(accountType)}
        className="clinical-button clinical-button-primary shrink-0 px-4"
      >
        {t("common.verificationRequired.action")}
        <ArrowRight
          size={16}
          strokeWidth={1.8}
          aria-hidden="true"
          className="rtl:rotate-180"
        />
      </Link>
    </section>
  );
}
