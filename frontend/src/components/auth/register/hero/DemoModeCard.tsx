import { type RegisterI18nProps } from "../RegisterPage";
import styles from "../RegisterPage.module.css";

export function DemoModeCard({ t }: RegisterI18nProps) {
  return (
    <section className={styles.demoCard}>
      <span className={styles.demoBadge}>
        {t("register.hero.demoMode.badge")}
      </span>
      <p>{t("register.hero.demoMode.text")}</p>
    </section>
  );
}
