import {
  ArrowUpRight,
  BrainCircuit,
  CalendarDays,
  FileStack,
  FlaskConical,
  ScrollText,
  Stethoscope,
  UsersRound,
} from "lucide-react";

import { PlatformWorkspace } from "./PlatformWorkspace";
import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const moduleIcons = [CalendarDays, Stethoscope, FlaskConical, FileStack, UsersRound, ScrollText, BrainCircuit];

type PlatformBentoProps = {
  context: LandingContent["context"];
  features: LandingContent["features"];
};

export function PlatformBento({ context, features }: PlatformBentoProps) {
  return (
    <section id="plateforme" className={styles.platformSection} aria-labelledby="platform-title">
      <SectionReveal className={styles.platformIntro}>
        <div>
          <p className={styles.eyebrow}>{context.eyebrow}</p>
          <h2 id="platform-title">{context.title}<em>{context.titleAccent}</em></h2>
        </div>
        <div>
          <p>{context.paragraph}</p>
          <a href="#product" className={styles.platformExplore}>
            {context.exploreLabel}<ArrowUpRight aria-hidden="true" />
          </a>
        </div>
      </SectionReveal>

      <SectionReveal className={styles.platformWorkspaceReveal}>
        <PlatformWorkspace content={context.workspace} />
      </SectionReveal>

      <SectionReveal className={styles.platformModules}>
        <p>{context.modulesLabel}</p>
        <ul>
          {features.items.map((item, index) => {
            const Icon = moduleIcons[index];
            return (
              <li key={item.title}><Icon aria-hidden="true" />{item.title}</li>
            );
          })}
        </ul>
      </SectionReveal>
    </section>
  );
}
