import { type RegisterI18nProps } from "./RegisterPage";
import styles from "./RegisterPage.module.css";

export function SecurityNotice({ t }: RegisterI18nProps) {
  return (
    <section
      className={styles.securityNotice}
      aria-labelledby="security-notice-title"
    >
      <span className={styles.securityIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 2.5 5 5.3v5.4c0 4.6 2.9 8 7 10.5 4.1-2.5 7-5.9 7-10.5V5.3L12 2.5Z" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
          <path d="m9.3 11.5 1.8 1.8 3.8-4" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div>
        <h3 id="security-notice-title" className={styles.securityTitle}>
          {t("register.security.title")}
        </h3>
        <p className={styles.securityBody}>{t("register.security.body")}</p>
      </div>
    </section>
  );
}
