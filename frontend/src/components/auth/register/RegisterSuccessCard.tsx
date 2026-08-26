"use client";

import Link from "next/link";

import { type AccountType } from "@/types/auth";

import { type RegisterI18nProps } from "./RegisterPage";
import styles from "./RegisterPage.module.css";

type RegisterSuccessCardProps = RegisterI18nProps & {
  accountType?: AccountType;
};

export function RegisterSuccessCard({
  accountType = "ESTABLISHMENT",
  t,
}: RegisterSuccessCardProps) {
  const isDoctorAccount = accountType === "INDEPENDENT_DOCTOR";
  const titleKey = isDoctorAccount
    ? "register.feedback.successCard.doctorTitle"
    : "register.feedback.successCard.title";
  const descriptionKey = isDoctorAccount
    ? "register.feedback.successCard.doctorDescription"
    : "register.feedback.successCard.description";

  return (
    <div
      role="status"
      aria-live="polite"
      className={styles.successCard}
    >
      <div className={styles.successHeader}>
        <span className={styles.successIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
            <path d="m8 12 2.6 2.6L16.5 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <h2 className={styles.successTitle}>{t(titleKey)}</h2>
          <p className={styles.successDescription}>{t(descriptionKey)}</p>
        </div>
      </div>

      <div className={styles.successActions}>
        <Link
          href="/demo"
          className={styles.successPrimary}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("register.feedback.successCard.demoAction")}
        </Link>
        <Link
          href="/verification"
          className={styles.successSecondary}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2.5 5 5.3v5.4c0 4.6 2.9 8 7 10.5 4.1-2.5 7-5.9 7-10.5V5.3L12 2.5Z" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
          </svg>
          {t("register.feedback.successCard.verificationAction")}
        </Link>
      </div>
    </div>
  );
}
