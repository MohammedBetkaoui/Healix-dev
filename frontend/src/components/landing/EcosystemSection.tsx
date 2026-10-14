"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll } from "framer-motion";

import { AnimatedLine, premiumEase } from "./landing-motion";
import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const ECOSYSTEM_PATH =
  "M500 310C420 310 312 118 164 106M500 310C580 310 688 118 836 106M500 310C398 320 280 236 116 260M500 310C602 320 720 236 884 260M500 310C398 300 280 394 116 378M500 310C602 300 720 394 884 378M500 310C420 310 312 502 164 514M500 310C580 310 688 502 836 514";

export function EcosystemSection({ ecosystem }: { ecosystem: LandingContent["ecosystem"] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 80%", "end 25%"],
  });

  return (
    <section ref={sectionRef} className={styles.ecosystemSection} aria-labelledby="ecosystem-title">
      <SectionReveal className={styles.sectionHeadingCentered}>
        <p className={styles.eyebrow}>{ecosystem.eyebrow}</p>
        <h2 id="ecosystem-title">{ecosystem.title}</h2>
        <p>{ecosystem.description}</p>
      </SectionReveal>
      <div className={styles.ecosystemMap}>
        <svg viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
          {reduceMotion ? (
            <path d={ECOSYSTEM_PATH} />
          ) : (
            <AnimatedLine d={ECOSYSTEM_PATH} progress={scrollYProgress} range={[0.08, 0.68]} />
          )}
        </svg>
        <div className={styles.ecosystemCenter}>
          <span>{ecosystem.center}</span>
          <i aria-hidden="true" />
        </div>
        {ecosystem.nodes.map((node, index) => (
          <motion.div
            key={node}
            className={styles.ecosystemNode}
            data-index={index}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ amount: 0.4, once: false }}
            transition={{ duration: reduceMotion ? 0.2 : 0.45, delay: reduceMotion ? 0 : index * 0.035, ease: premiumEase }}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {node}
          </motion.div>
        ))}
      </div>
    </section>
  );
}
