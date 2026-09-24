import { HealixLogo } from "@/components/shared/HealixLogo";
import styles from "./LoginPage.module.css";

const trustItems = [
  {
    key: "sessions",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "availability",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 12h4l2-5 4 10 2.5-7 2 3H21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: "audit",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 6h14v14H5zM4 3h16v3H4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M9 10h6M9 14h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
] as const;

type LoginHeroPanelProps = {
  t: (key: string) => string;
};

export function LoginHeroPanel({ t }: LoginHeroPanelProps) {
  return (
    <aside className={styles.heroPanel}>
      <div className={styles.brand} aria-label="HealixDz">
        <HealixLogo variant="full" priority />
        <p className={styles.brandSubtitle}>
          {t("login.brandSubtitle")}
        </p>
      </div>

      <div className={styles.heroCopy}>
        <div className={styles.compliance}>
          <span className={styles.complianceDot} aria-hidden="true" />
          {t("login.hero.compliance")}
        </div>

        <h1 className={styles.heroTitle}>
          {t("login.hero.titleLead")} {" "}
          <em className={styles.heroTitleAccent}>
            {t("login.hero.titleAccent")}
          </em>{" "}
          {t("login.hero.titleEnd")}
        </h1>

        <p className={styles.heroDescription}>
          {t("login.hero.description")}
        </p>
      </div>

      <dl className={styles.trustRail}>
        {trustItems.map(({ icon, key }) => (
          <div className={styles.trustItem} key={key}>
            <span className={styles.trustIcon}>{icon}</span>
            <div>
              <dt className={styles.trustLabel}>
                {t(`login.hero.stats.${key}.label`)}
              </dt>
              <dd className={styles.trustValue}>
                {t(`login.hero.stats.${key}.value`)}
              </dd>
              <dd className={styles.trustDescription}>
                {t(`login.hero.stats.${key}.description`)}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </aside>
  );
}
