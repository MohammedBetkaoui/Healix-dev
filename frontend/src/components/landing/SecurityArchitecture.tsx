import {
  BadgeCheck,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Layers3,
  ScrollText,
  ShieldCheck,
} from "lucide-react";

import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const pillarIcons = [BadgeCheck, Layers3, ScrollText];
const capabilityIcons = [KeyRound, ShieldCheck, CheckCircle2, ScrollText, Layers3, Fingerprint, BadgeCheck];

type SecurityArchitectureProps = {
  verification: LandingContent["verification"];
  security: LandingContent["security"];
};

export function SecurityArchitecture({ verification, security }: SecurityArchitectureProps) {
  return (
    <section id="securite" className={styles.securityArchitecture} aria-labelledby="security-title">
      <SectionReveal className={styles.securityArchitectureIntro}>
        <div>
          <p className={styles.darkEyebrow}>{security.eyebrow}</p>
          <h2 id="security-title">{security.title}</h2>
        </div>
        <p>{security.text}</p>
      </SectionReveal>

      <div className={styles.securityPillars}>
        {security.pillars.map((pillar, index) => {
          const Icon = pillarIcons[index] ?? ShieldCheck;
          return (
            <SectionReveal key={pillar.title} className={styles.securityPillar} delay={index * 0.06}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <Icon aria-hidden="true" />
              <h3>{pillar.title}</h3>
              <p>{pillar.text}</p>
            </SectionReveal>
          );
        })}
      </div>

      <SectionReveal className={styles.verificationFlow}>
        <div>
          <p className={styles.darkEyebrow}>{verification.eyebrow}</p>
          <h3>{verification.title}</h3>
        </div>
        <ol>
          {verification.flow.map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
        <p>{verification.note}</p>
      </SectionReveal>

      <div className={styles.securityCapabilities}>
        {security.items.map((item, index) => {
          const Icon = capabilityIcons[index] ?? ShieldCheck;
          return <span key={item}><Icon aria-hidden="true" />{item}</span>;
        })}
      </div>
      <p className={styles.securityNote}>{security.note}</p>
    </section>
  );
}
