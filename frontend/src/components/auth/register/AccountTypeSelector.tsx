"use client";

import { cn } from "@/lib/utils";
import { type AccountType } from "@/types/auth";

import { type RegisterI18nProps } from "./RegisterPage";
import styles from "./RegisterPage.module.css";

type AccountTypeSelectorProps = RegisterI18nProps & {
  selectedType: AccountType | null;
  onSelect: (type: AccountType) => void;
};

const accountTypes = [
  {
    type: "ESTABLISHMENT" as const,
    titleKey: "register.accountType.establishment.title",
    descriptionKey: "register.accountType.establishment.description",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 21V8l8-4.5L20 8v13M9 21v-6h6v6M8 10h1M12 10h1M16 10h1" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    type: "INDEPENDENT_DOCTOR" as const,
    titleKey: "register.accountType.independentDoctor.title",
    descriptionKey: "register.accountType.independentDoctor.description",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.65" />
        <path d="M5 21c.5-5 3-8 7-8s6.5 3 7 8M9 14.5l3 3 3-3" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function AccountTypeSelector({
  selectedType,
  onSelect,
  t,
}: AccountTypeSelectorProps) {
  return (
    <section aria-labelledby="account-type-title" className={styles.accountSection}>
      <div>
        <p className={styles.sectionEyebrow}>
          {t("register.accountType.eyebrow")}
        </p>
        <h2
          id="account-type-title"
          className={styles.sectionTitle}
        >
          {t("register.accountType.title")}
        </h2>
        <p className={styles.sectionDescription}>
          {t("register.accountType.description")}
        </p>
      </div>

      <div className={styles.accountGrid} role="radiogroup" aria-label={t("register.accountType.title")}>
        {accountTypes.map(({ type, titleKey, descriptionKey, icon }) => {
          const isSelected = selectedType === type;

          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(type)}
              className={cn(
                styles.accountOption,
                isSelected && styles.accountOptionSelected,
              )}
            >
              <span className={styles.accountIcon}>{icon}</span>
              <span>
                <span className={styles.accountTitle}>{t(titleKey)}</span>
                <span className={styles.accountDescription}>
                  {t(descriptionKey)}
                </span>
              </span>
              <span
                className={cn(
                  styles.accountRadio,
                  isSelected && styles.accountRadioSelected,
                )}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
