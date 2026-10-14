import { Fingerprint, History, Link2, ShieldCheck } from "lucide-react";

import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const trustIcons = [ShieldCheck, History, Link2, Fingerprint];

export function TrustBar({ trust }: { trust: LandingContent["trustBar"] }) {
  return (
    <section className={styles.trustBar} aria-label={trust.title}>
      <SectionReveal className={styles.trustBarInner}>
        <p>{trust.title}</p>
        <div>
          {trust.items.map((item, index) => {
            const Icon = trustIcons[index];
            return <span key={item}><Icon aria-hidden="true" />{item}</span>;
          })}
        </div>
      </SectionReveal>
    </section>
  );
}
