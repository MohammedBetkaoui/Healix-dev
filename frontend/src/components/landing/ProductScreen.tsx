import {
  Activity,
  CalendarDays,
  CheckCircle2,
  FileText,
  FlaskConical,
  FolderHeart,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";

import { HealixLogo } from "@/components/shared/HealixLogo";

import styles from "./landing.module.css";

export type ProductScreenData = {
  id: string;
  label: string;
  title: string;
  stat: string;
  annotation: string;
  rows: readonly string[];
};

export type ProductScreenUi = {
  action: string;
  navigation: string;
  panel: string;
  search: string;
  verified: string;
};

type ProductScreenProps = {
  compact?: boolean;
  data: ProductScreenData;
  ui: ProductScreenUi;
};

const screenIcons = {
  ai: Sparkles,
  appointments: CalendarDays,
  dashboard: Activity,
  laboratory: FlaskConical,
  patient: FolderHeart,
  team: UsersRound,
} as const;

export function ProductScreen({ compact = false, data, ui }: ProductScreenProps) {
  const ScreenIcon = screenIcons[data.id as keyof typeof screenIcons] ?? FolderHeart;

  return (
    <div
      className={`${styles.productScreen} ${compact ? styles.productScreenCompact : ""}`}
      data-screen={data.id}
      role="img"
      aria-label={`${data.label} — ${data.title}`}
    >
      <aside className={styles.productScreenSidebar} aria-hidden="true">
        <HealixLogo variant="mark" className={styles.productScreenLogo} />
        <span className={styles.productScreenNavActive}><Activity /></span>
        <span><FolderHeart /></span>
        <span><CalendarDays /></span>
        <span><FileText /></span>
        <span><FlaskConical /></span>
      </aside>

      <div className={styles.productScreenMain}>
        <header className={styles.productScreenHeader}>
          <div>
            <small>HealixDz / {data.label}</small>
            <strong>{data.title}</strong>
          </div>
          <div className={styles.productScreenSearch} aria-hidden="true">
            <Search />
            <span>{ui.search}</span>
          </div>
          <span className={styles.productScreenProfile} aria-hidden="true"><UserRound /></span>
        </header>

        <div className={styles.productScreenContent}>
          <div className={styles.productScreenTitleRow}>
            <div>
              <span><ScreenIcon />{data.annotation}</span>
              <h3>{data.stat}</h3>
            </div>
            <span className={styles.productScreenAction}><ShieldCheck />{ui.action}</span>
          </div>

          <div className={styles.productScreenModules}>
            {data.rows.slice(0, 3).map((row, index) => (
              <article key={row}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <ScreenIcon aria-hidden="true" />
                <strong>{row}</strong>
              </article>
            ))}
          </div>

          <div className={styles.productScreenPanel}>
            <div className={styles.productScreenPanelHead}>
              <strong>{ui.panel}</strong>
              <small><CheckCircle2 />{ui.verified}</small>
            </div>
            {data.rows.map((row, index) => (
              <div className={styles.productScreenRow} key={`${row}-${index}`}>
                <span><CheckCircle2 /></span>
                <strong>{row}</strong>
                <i aria-hidden="true" />
                <FileText aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
