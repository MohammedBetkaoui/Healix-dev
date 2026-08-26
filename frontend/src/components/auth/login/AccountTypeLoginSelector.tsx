"use client";

import { cn } from "@/lib/utils";
import { type LoginAccountType } from "@/types/auth";

import styles from "./LoginPage.module.css";

type AccountTypeLoginSelectorProps = {
  error?: string;
  selectedType: LoginAccountType | "";
  onSelect: (type: LoginAccountType) => void;
  t: (key: string) => string;
};

const options = [
  {
    type: "ESTABLISHMENT" as const,
    labelKey: "login.accountType.establishment",
    descriptionKey: "login.accountType.establishmentDescription",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 21V8l8-4.5L20 8v13M9 21v-6h6v6M8 10h1M12 10h1M16 10h1" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    type: "INDEPENDENT_DOCTOR" as const,
    labelKey: "login.accountType.doctor",
    descriptionKey: "login.accountType.doctorDescription",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.65" />
        <path d="M5 21c.5-5 3-8 7-8s6.5 3 7 8M9 14.5l3 3 3-3" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function AccountTypeLoginSelector({
  error,
  onSelect,
  selectedType,
  t,
}: AccountTypeLoginSelectorProps) {
  const selectedHint =
    selectedType === "INDEPENDENT_DOCTOR" ? "doctor" : "establishment";

  return (
    <div>
      <div className={styles.sectionLabel}>
        <span>{t("login.form.accountTypeLabel")}</span>
        <span className={styles.optionalLabel}>{t("login.form.optional")}</span>
      </div>
      <div
        className={styles.profileList}
        role="radiogroup"
        aria-label={t("login.form.accountTypeLabel")}
        aria-describedby={error ? "loginAccountType-error" : undefined}
      >
        {options.map(({ type, icon, labelKey, descriptionKey }) => {
          const isSelected = selectedType === type;

          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(type)}
              className={cn(
                styles.profileOption,
                isSelected && styles.profileOptionSelected,
              )}
            >
              <span className={styles.profileIcon}>{icon}</span>
              <span>
                <span className={styles.profileTitle}>{t(labelKey)}</span>
                <span className={styles.profileDescription}>
                  {t(descriptionKey)}
                </span>
              </span>
              <span
                className={cn(styles.radio, isSelected && styles.radioSelected)}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
      {error ? (
        <p id="loginAccountType-error" className={styles.fieldError}>
          {error}
        </p>
      ) : null}
      <div className={styles.profileHint} aria-live="polite">
        <p className={styles.profileHintTitle}>
          {t(`login.accountType.${selectedHint}HintTitle`)}
        </p>
        <p className={styles.profileHintDescription}>
          {t(`login.accountType.${selectedHint}HintDescription`)}
        </p>
      </div>
    </div>
  );
}
