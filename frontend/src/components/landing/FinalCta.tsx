import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { SectionReveal } from "./SectionReveal";
import { editorialCopy } from "./editorial-copy";
import styles from "./landing.module.css";

export function FinalCta({ locale }: { locale: "fr" | "ar" }) {
  const cta = editorialCopy[locale].cta;
  return (
    <section className={styles.finalCta} aria-labelledby="final-cta-title">
      <div className={styles.finalCtaPattern} aria-hidden="true" />
      <SectionReveal className={styles.finalCtaInner}>
        <p className={styles.finalCtaEyebrow}>{cta.eyebrow}</p>
        <h2 id="final-cta-title">{cta.title}</h2>
        <p>{cta.text}</p>
        <div>
          <Link href="/register">{cta.primary}<ArrowUpRight aria-hidden="true" /></Link>
          <Link href="/login">{cta.secondary}</Link>
        </div>
        <small>{cta.profiles}</small>
      </SectionReveal>
    </section>
  );
}
