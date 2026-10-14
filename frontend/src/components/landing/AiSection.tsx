"use client";

import { useRef } from "react";
import { ArrowRight, BrainCircuit, FileText, ListChecks, UserCheck, Scale } from "lucide-react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";

import { TextReveal, smoothSpring, useIsMobile } from "./landing-motion";
import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const aiIcons = [FileText, BrainCircuit, ListChecks, UserCheck, Scale];

function AiStep({
  icon: Icon,
  step,
  index,
  total,
  isLast,
  progress,
  calm,
}: {
  icon: typeof FileText;
  step: string;
  index: number;
  total: number;
  isLast: boolean;
  progress: MotionValue<number>;
  calm: boolean;
}) {
  const start = (index / total) * 0.7;
  const opacity = useTransform(progress, [start, start + 0.14], [0, 1]);
  const y = useTransform(progress, [start, start + 0.14], [15, 0]);
  const arrowOpacity = useTransform(progress, [start + 0.1, start + 0.18], [0, 1]);

  if (calm) {
    return (
      <SectionReveal className={styles.aiFlowStep}>
        <span><Icon aria-hidden="true" /></span>
        <small>{String(index + 1).padStart(2, "0")}</small>
        <strong>{step}</strong>
        {!isLast ? <ArrowRight className={styles.aiArrow} aria-hidden="true" /> : null}
      </SectionReveal>
    );
  }

  return (
    <motion.div className={styles.aiFlowStep} style={{ opacity, y }}>
      <span><Icon aria-hidden="true" /></span>
      <small>{String(index + 1).padStart(2, "0")}</small>
      <strong>{step}</strong>
      {!isLast ? (
        <motion.span className={styles.aiArrow} style={{ opacity: arrowOpacity }} aria-hidden="true">
          <ArrowRight aria-hidden="true" />
        </motion.span>
      ) : null}
    </motion.div>
  );
}

export function AiSection({ ai }: { ai: LandingContent["ai"] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const isMobile = useIsMobile();
  const calm = reduceMotion || isMobile;

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start 0.8", "end 0.45"] });
  const progress = useSpring(scrollYProgress, smoothSpring);
  const lineScale = useTransform(progress, [0.05, 0.85], [0, 1]);

  return (
    <section ref={sectionRef} id="healix-ai" className={styles.aiSection} aria-labelledby="ai-title">
      <SectionReveal className={styles.aiHeader}>
        <div className={styles.aiTitleBlock}>
          <p className={styles.aiEyebrow}>{ai.eyebrow}</p>
          <span className={styles.roadmapLabel}>{ai.label}</span>
          <TextReveal text={ai.title} id="ai-title" />
        </div>
        <div className={styles.aiCopy}>
          <p>{ai.text}</p>
          <strong>{ai.caution}</strong>
        </div>
      </SectionReveal>

      {!calm ? (
        <div className={styles.aiProgress} aria-hidden="true">
          <motion.i style={{ scaleX: lineScale }} />
        </div>
      ) : null}

      <div className={styles.aiFlow}>
        {ai.flow.map((step, index) => {
          const Icon = aiIcons[index] ?? FileText;
          return (
            <AiStep
              key={step}
              icon={Icon}
              step={step}
              index={index}
              total={ai.flow.length}
              isLast={index === ai.flow.length - 1}
              progress={progress}
              calm={calm}
            />
          );
        })}
      </div>
    </section>
  );
}
