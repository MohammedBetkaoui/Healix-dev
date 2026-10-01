import { CalendarDays, ClipboardList, FileStack, FolderHeart, ScrollText, ShieldCheck, UsersRound } from "lucide-react";

import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const featureIcons = [
  FolderHeart,
  CalendarDays,
  ClipboardList,
  FileStack,
  ShieldCheck,
  UsersRound,
  ScrollText,
];

export function FeaturesSection({ features }: { features: LandingContent["features"] }) {
  return (
    <section className={styles.featuresSection} aria-labelledby="features-title">
      <div className={styles.sectionHeadingRow}>
        <div>
          <span className={styles.availableLabel}>{features.label}</span>
          <h2 id="features-title">{features.title}</h2>
        </div>
        <span className={styles.featureIndex} aria-hidden="true">/ 07</span>
      </div>
      <div className={styles.featureList}>
        {features.items.map((item, index) => {
          const Icon = featureIcons[index];
          return (
            <article key={item.title} className={styles.featureItem}>
              <span className={styles.featureNumber}>{String(index + 1).padStart(2, "0")}</span>
              <Icon aria-hidden="true" />
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

