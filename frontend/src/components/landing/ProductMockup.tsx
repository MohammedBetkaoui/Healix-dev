import { CalendarClock, CircleCheck, FileText, Search, Stethoscope, UserRound, UsersRound } from "lucide-react";

import styles from "./landing.module.css";

type ProductMockupProps = {
  points: readonly string[];
  title: string;
  variant?: "doctor" | "establishment" | "patient";
};

export function ProductMockup({ points, title, variant = "establishment" }: ProductMockupProps) {
  const profileIcon = variant === "establishment" ? UsersRound : variant === "doctor" ? Stethoscope : UserRound;
  const ProfileIcon = profileIcon;

  return (
    <div className={styles.productMockup} data-variant={variant}>
      <aside className={styles.mockSidebar} aria-hidden="true">
        <span className={styles.mockMark}>H</span>
        <i className={styles.mockNavActive} />
        <i /><i /><i />
      </aside>
      <div className={styles.mockMain}>
        <header className={styles.mockHeader}>
          <div>
            <small>HealixDz</small>
            <strong>{title}</strong>
          </div>
          <div className={styles.mockSearch}><Search aria-hidden="true" /><span /></div>
          <span className={styles.mockAvatar}><ProfileIcon aria-hidden="true" /></span>
        </header>
        <div className={styles.mockMetrics} aria-hidden="true">
          <div><CalendarClock /><span><i /><i /></span></div>
          <div><UserRound /><span><i /><i /></span></div>
          <div><FileText /><span><i /><i /></span></div>
        </div>
        <div className={styles.mockContent}>
          <div className={styles.mockTable}>
            {points.slice(0, 4).map((point, index) => (
              <div key={point}>
                <span className={styles.mockStatus}><CircleCheck aria-hidden="true" /></span>
                <strong>{point}</strong>
                <i style={{ inlineSize: `${52 + index * 8}%` }} />
              </div>
            ))}
          </div>
          <aside className={styles.mockAside}>
            <span />
            {points.slice(4).map((point) => <strong key={point}>{point}</strong>)}
            <i /><i /><i />
          </aside>
        </div>
      </div>
    </div>
  );
}

