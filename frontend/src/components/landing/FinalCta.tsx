import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { HealixPulse } from "./HealixPulse";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

export function FinalCta({ cta }: { cta: LandingContent["finalCta"] }) {
  return (
    <section className={styles.finalCta} aria-labelledby="final-cta-title">
      <HealixPulse tone="light" className={styles.finalPulse} />
      <div>
        <h2 id="final-cta-title">{cta.title}</h2>
        <p>{cta.text}</p>
        <div><Link href="/register">{cta.primary}<ArrowUpRight aria-hidden="true" /></Link><Link href="/login">{cta.secondary}</Link></div>
        <small>{cta.profiles}</small>
      </div>
    </section>
  );
}

