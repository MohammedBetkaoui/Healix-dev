import { ActivationTimeline } from "./hero/ActivationTimeline";
import { DemoModeCard } from "./hero/DemoModeCard";
import { type RegisterI18nProps } from "./RegisterPage";
import styles from "./RegisterPage.module.css";

const valuePoints = [
  {
    textKey: "register.hero.valuePoints.patientRecords",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 5h14v15H5zM8 3h8v4H8zM9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    textKey: "register.hero.valuePoints.medicalAi",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3v18M8 6a3 3 0 0 0-3 3c0 1 .5 1.8 1.2 2.4A3.5 3.5 0 0 0 8 18M16 6a3 3 0 0 1 3 3c0 1-.5 1.8-1.2 2.4A3.5 3.5 0 0 1 16 18M8 6c0-1.7 1.2-3 4-3M16 6c0-1.7-1.2-3-4-3M8 18c0 1.7 1.2 3 4 3M16 18c0 1.7-1.2 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    textKey: "register.hero.valuePoints.workflow",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 12h4l2-5 4 10 2-6 2 3h2" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function HeroValuePoints({ t }: RegisterI18nProps) {
  return (
    <div className={styles.valuePoints}>
      {valuePoints.map(({ icon, textKey }) => (
        <div key={textKey} className={styles.valuePoint}>
          <span className={styles.valuePointIcon}>{icon}</span>
          <span>{t(textKey)}</span>
        </div>
      ))}
    </div>
  );
}

export function RegisterHeroPanel(props: RegisterI18nProps) {
  const { t } = props;

  return (
    <aside className={styles.heroPanel}>
      <div className={styles.brand} aria-label="HealixDz">
        <span className={styles.brandMark} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M2 12h4l2-7 4 14 3-9 2 4h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <p className={styles.brandName}>
            Healix<span className={styles.brandNameAccent}>Dz</span>
          </p>
          <p className={styles.brandSubtitle}>{t("register.brandSubtitle")}</p>
        </div>
      </div>

      <div className={styles.heroCopy}>
        <span className={styles.heroBadge}>{t("register.hero.demoBadge")}</span>
        <h1 className={styles.heroTitle}>
          {t("register.hero.titleLead")} {" "}
          <em>{t("register.hero.titleAccent")}</em>{" "}
          {t("register.hero.titleEnd")}
        </h1>
        <p className={styles.heroSubtitle}>{t("register.hero.subtitle")}</p>
        <HeroValuePoints {...props} />
      </div>

      <ActivationTimeline {...props} />
      <DemoModeCard {...props} />
    </aside>
  );
}
