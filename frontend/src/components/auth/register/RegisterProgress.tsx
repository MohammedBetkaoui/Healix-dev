import { type RegisterI18nProps } from "./RegisterPage";
import styles from "./RegisterPage.module.css";

const steps = [
  "account",
  "verification",
  "subscription",
  "activation",
] as const;

export function RegisterProgress({ t }: RegisterI18nProps) {
  return (
    <nav aria-label={t("register.progress.ariaLabel")} className={styles.progressNav}>
      <ol className={styles.progressList}>
        {steps.map((step, index) => {
          const isActive = index === 0;

          return (
            <li
              key={step}
              className={isActive ? `${styles.progressStep} ${styles.progressActive}` : styles.progressStep}
              aria-current={isActive ? "step" : undefined}
            >
              <span className={styles.progressNumber}>{index + 1}</span>
              <span className={styles.progressLabel}>
                {t(`register.progress.steps.${step}`)}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
