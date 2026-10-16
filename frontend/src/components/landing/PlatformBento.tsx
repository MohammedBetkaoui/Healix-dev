import {
  Bot,
  CalendarDays,
  FileStack,
  FlaskConical,
  FolderHeart,
  ScrollText,
  Stethoscope,
  UsersRound,
} from "lucide-react";

import { ProductScreen } from "./ProductScreen";
import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const moduleIcons = [CalendarDays, Stethoscope, FlaskConical, FileStack, UsersRound, ScrollText, Bot];

type PlatformBentoProps = {
  context: LandingContent["context"];
  features: LandingContent["features"];
  record: LandingContent["patientRecord"];
  screenUi: LandingContent["showcase"]["ui"];
};

export function PlatformBento({ context, features, record, screenUi }: PlatformBentoProps) {
  return (
    <section id="plateforme" className={styles.platformSection} aria-labelledby="platform-title">
      <SectionReveal className={styles.sectionIntroSplit}>
        <div>
          <p className={styles.eyebrow}>{context.eyebrow}</p>
          <h2 id="platform-title">{context.title}</h2>
        </div>
        <div>
          <p>{context.paragraph}</p>
          <strong>{context.finalLine}</strong>
        </div>
      </SectionReveal>

      <div className={styles.platformBento}>
        <SectionReveal className={styles.patientModule}>
          <div className={styles.moduleCardHeader}>
            <span><FolderHeart aria-hidden="true" /></span>
            <div>
              <small>{record.label}</small>
              <h3>{record.patientName}</h3>
            </div>
          </div>
          <p>{record.text}</p>
          <div className={styles.patientModuleScreen}>
            <ProductScreen
              compact
              data={{
                id: "patient",
                label: record.patientName,
                title: record.medicalSummary,
                stat: record.title,
                annotation: record.status,
                rows: record.annotations.slice(0, 4),
              }}
              ui={screenUi}
            />
          </div>
        </SectionReveal>

        {features.items.map((item, index) => {
          const Icon = moduleIcons[index] ?? FolderHeart;
          return (
            <SectionReveal key={item.title} className={styles.moduleCard} delay={index * 0.035}>
              <div className={styles.moduleCardHeader}>
                <span><Icon aria-hidden="true" /></span>
                <small>{String(index + 2).padStart(2, "0")}</small>
              </div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <div className={styles.moduleMicroUi} aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
            </SectionReveal>
          );
        })}
      </div>
    </section>
  );
}
