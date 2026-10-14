import { Building2, Languages, MapPinned, Stethoscope } from "lucide-react";

import { AlgeriaMap } from "./AlgeriaMap";
import { ScrollParallax } from "./landing-motion";
import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

export function AlgeriaSection({ algeria }: { algeria: LandingContent["algeria"] }) {
  return (
    <section className={styles.algeriaSection} aria-labelledby="algeria-title">
      <SectionReveal>
        <ScrollParallax className={styles.algeriaVisual} from={22} to={-22}>
          <AlgeriaMap />
          <strong><MapPinned aria-hidden="true" />{algeria.wilayas}</strong>
        </ScrollParallax>
      </SectionReveal>
      <SectionReveal className={styles.algeriaCopy} delay={0.08}>
        <p className={styles.eyebrow}>{algeria.eyebrow}</p>
        <h2 id="algeria-title">{algeria.title}</h2>
        <p>{algeria.text}</p>
        <div className={styles.algeriaFacts}>
          <div><Languages aria-hidden="true" />{algeria.languages.map((language) => <span key={language}>{language}</span>)}</div>
          <div><Building2 aria-hidden="true" /><span>{algeria.profiles[0]}</span><Stethoscope aria-hidden="true" /><span>{algeria.profiles[1]}</span></div>
        </div>
        <small>{algeria.caption}</small>
      </SectionReveal>
    </section>
  );
}
