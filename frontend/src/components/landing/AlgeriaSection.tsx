import {
  BadgeCheck,
  Building2,
  FileHeart,
  Languages,
  MapPinned,
  Network,
  Route,
  Sparkles,
  Stethoscope,
} from "lucide-react";

import { AlgeriaMap } from "./AlgeriaMap";
import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const proofIcons = [FileHeart, Network, Route, BadgeCheck, Sparkles];

export function AlgeriaSection({ algeria }: { algeria: LandingContent["algeria"] }) {
  return (
    <section className={styles.algeriaSection} aria-labelledby="algeria-title">
      <div className={styles.algeriaMain}>
        <SectionReveal className={styles.algeriaCopy}>
          <p className={styles.eyebrow}>{algeria.eyebrow}</p>
          <h2 id="algeria-title">{algeria.title}</h2>
          <p>{algeria.text}</p>
          <div className={styles.algeriaFacts}>
            <span><Languages aria-hidden="true" /><strong>{algeria.languages.join(" + ")}</strong></span>
            <span><MapPinned aria-hidden="true" /><strong>{algeria.wilayas}</strong></span>
            <span><Building2 aria-hidden="true" /><strong>{algeria.profiles[0]}</strong></span>
            <span><Stethoscope aria-hidden="true" /><strong>{algeria.profiles[1]}</strong></span>
            <span><BadgeCheck aria-hidden="true" /><strong>{algeria.verification}</strong></span>
          </div>
          <small>{algeria.caption}</small>
        </SectionReveal>
        <SectionReveal className={styles.algeriaVisual} delay={0.08}>
          <AlgeriaMap label={algeria.mapLabel} />
          <span>{algeria.wilayas}</span>
        </SectionReveal>
      </div>

      <SectionReveal className={styles.workflowProof}>
        <div>
          <p className={styles.eyebrow}>{algeria.proof.eyebrow}</p>
          <h3>{algeria.proof.title}</h3>
        </div>
        <div>
          {algeria.proof.items.map((item, index) => {
            const Icon = proofIcons[index] ?? FileHeart;
            return <span key={item}><Icon aria-hidden="true" />{item}</span>;
          })}
        </div>
      </SectionReveal>
    </section>
  );
}
