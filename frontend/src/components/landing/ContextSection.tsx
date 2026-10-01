"use client";

import { useRef } from "react";
import { motion, type MotionValue, useReducedMotion, useScroll, useTransform } from "framer-motion";

import { HealixLogo } from "@/components/shared/HealixLogo";

import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const fragmentOffsets = [
  [-118, -72],
  [116, -54],
  [-150, 54],
  [138, 72],
  [0, 112],
] as const;

function ContextFragment({
  convergence,
  fragment,
  offsetX,
  offsetY,
  reduceMotion,
}: {
  convergence: MotionValue<number>;
  fragment: string;
  offsetX: number;
  offsetY: number;
  reduceMotion: boolean | null;
}) {
  const x = useTransform(convergence, [0, 1], [offsetX, offsetX * 0.34]);
  const y = useTransform(convergence, [0, 1], [offsetY, offsetY * 0.34]);

  return (
    <motion.span
      className={styles.fragment}
      style={{ x: reduceMotion ? 0 : x, y: reduceMotion ? 0 : y }}
    >
      {fragment}
    </motion.span>
  );
}

export function ContextSection({ context }: { context: LandingContent["context"] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const convergence = useTransform(scrollYProgress, [0.12, 0.55, 0.86], [0, 1, 0.9]);
  const logoOpacity = useTransform(scrollYProgress, [0.22, 0.52], [0.15, 1]);

  return (
    <section ref={sectionRef} id="plateforme" className={styles.contextSection} aria-labelledby="context-title">
      <div className={styles.sectionGrid}>
        <div className={styles.sectionCopy}>
          <p className={styles.eyebrow}>{context.eyebrow}</p>
          <h2 id="context-title">{context.title}</h2>
          <p className={styles.sectionLead}>{context.paragraph}</p>
          <p>{context.paragraph2}</p>
          <strong className={styles.contextFinal}>{context.finalLine}</strong>
        </div>

        <div className={styles.convergenceVisual} aria-label={context.finalLine}>
          <motion.div className={styles.convergenceCore} style={{ opacity: logoOpacity }}>
            <HealixLogo variant="mark" className={styles.convergenceLogo} />
            <span>HealixDz</span>
          </motion.div>
          {context.fragments.map((fragment, index) => {
            const [offsetX, offsetY] = fragmentOffsets[index];
            return (
              <ContextFragment
                key={fragment}
                convergence={convergence}
                fragment={fragment}
                offsetX={offsetX}
                offsetY={offsetY}
                reduceMotion={reduceMotion}
              />
            );
          })}
          <div className={styles.convergenceRings} aria-hidden="true"><i /><i /><i /></div>
        </div>
      </div>
    </section>
  );
}
