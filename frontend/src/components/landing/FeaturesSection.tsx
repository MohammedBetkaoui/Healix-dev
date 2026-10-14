import {
  CalendarDays,
  ClipboardList,
  FileStack,
  FolderHeart,
  ScrollText,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const featureIcons = [FolderHeart, CalendarDays, ClipboardList, FileStack, ShieldCheck, UsersRound, ScrollText];

export function FeaturesSection({ features }: { features: LandingContent["features"] }) {
  return (
    <section className={styles.featuresSection} aria-labelledby="features-title">
      <SectionReveal className={styles.featuresHeading}>
        <div>
          <p className={styles.eyebrow}>{features.label}</p>
          <h2 id="features-title">{features.title}</h2>
        </div>
        <p>{features.description}</p>
      </SectionReveal>
      <div className={styles.featureList}>
        {features.items.map((item, index) => {
          const Icon = featureIcons[index];
          return (
            <SectionReveal key={item.title} className={styles.featureItem} delay={index * 0.045}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <Icon aria-hidden="true" />
              <div><h3>{item.title}</h3><p>{item.text}</p></div>
            </SectionReveal>
          );
        })}
      </div>
    </section>
  );
}
