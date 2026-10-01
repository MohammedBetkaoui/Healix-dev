import { Cookie, Fingerprint, Gauge, KeyRound, ScrollText, ShieldCheck } from "lucide-react";

import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const securityIcons = [KeyRound, Cookie, ShieldCheck, Gauge, ScrollText, Fingerprint];

export function SecuritySection({ security }: { security: LandingContent["security"] }) {
  return (
    <section className={styles.securitySection} aria-labelledby="security-title">
      <div className={styles.securityIntro}>
        <p className={styles.darkEyebrow}>{security.eyebrow}</p>
        <h2 id="security-title">{security.title}</h2>
        <p>{security.text}</p>
        <small>{security.note}</small>
      </div>
      <div className={styles.securityGrid}>
        {security.items.map((item, index) => {
          const Icon = securityIcons[index];
          return <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><Icon aria-hidden="true" /><strong>{item}</strong></div>;
        })}
      </div>
    </section>
  );
}

