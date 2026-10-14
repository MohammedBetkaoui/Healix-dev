import { Cookie, Database, Fingerprint, Gauge, KeyRound, ScrollText, ShieldCheck } from "lucide-react";

import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const securityIcons = [KeyRound, Cookie, ShieldCheck, ScrollText, Database, Fingerprint, Gauge];

export function SecuritySection({ security }: { security: LandingContent["security"] }) {
  return (
    <section id="securite" className={styles.securitySection} aria-labelledby="security-title">
      <SectionReveal className={styles.securityIntro}>
        <p className={styles.darkEyebrow}>{security.eyebrow}</p>
        <h2 id="security-title">{security.title}</h2>
        <p>{security.text}</p>
        <small>{security.note}</small>
      </SectionReveal>
      <div className={styles.securityGrid}>
        {security.items.map((item, index) => {
          const Icon = securityIcons[index];
          return <SectionReveal key={item} className={styles.securityItem} delay={index * 0.04}><span>{String(index + 1).padStart(2, "0")}</span><Icon aria-hidden="true" /><strong>{item}</strong></SectionReveal>;
        })}
      </div>
    </section>
  );
}

