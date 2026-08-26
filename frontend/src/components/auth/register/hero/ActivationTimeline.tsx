import { type RegisterI18nProps } from "../RegisterPage";
import styles from "../RegisterPage.module.css";

const activationSteps = [
  "accountCreated",
  "demoMode",
  "professionalVerification",
  "fullActivation",
] as const;

export function ActivationTimeline({ t }: RegisterI18nProps) {
  return (
    <section
      aria-labelledby="activation-timeline-title"
      className={styles.activationCard}
    >
      <h2
        id="activation-timeline-title"
        className={styles.activationTitle}
      >
        {t("register.hero.activation.title")}
      </h2>
      <ol className={styles.activationList}>
        {activationSteps.map((step, index) => {
          const isActive = index === 0;

          return (
            <li
              key={step}
              className={isActive ? `${styles.activationStep} ${styles.activationActive}` : styles.activationStep}
            >
              <span className={styles.activationNumber}>
                {index + 1}
              </span>
              <span>
                {t(`register.hero.activation.steps.${step}`)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
