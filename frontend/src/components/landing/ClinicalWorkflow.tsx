"use client";

import { useRef } from "react";
import {
  CalendarCheck,
  FileCheck2,
  FolderPlus,
  HeartPulse,
  ScrollText,
  Stethoscope,
} from "lucide-react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";

import { SectionReveal } from "./SectionReveal";
import { smoothSpring, useIsMobile } from "./landing-motion";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const workflowIcons = [FolderPlus, CalendarCheck, Stethoscope, FileCheck2, ScrollText, HeartPulse];

export function ClinicalWorkflow({ journey }: { journey: LandingContent["journey"] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const isMobile = useIsMobile(760);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start 75%", "end 35%"] });
  const rawProgress = useTransform(scrollYProgress, [0.08, 0.78], [reduceMotion ? 1 : 0, 1]);
  const progress = useSpring(rawProgress, smoothSpring);

  return (
    <section ref={sectionRef} className={styles.workflowSection} aria-labelledby="workflow-title">
      <SectionReveal className={styles.sectionIntroCentered}>
        <p className={styles.eyebrow}>{journey.eyebrow}</p>
        <h2 id="workflow-title">{journey.title}</h2>
        <p>{journey.description}</p>
      </SectionReveal>

      <div className={styles.workflowTrack}>
        <div className={styles.workflowLine} aria-hidden="true">
          <motion.i style={isMobile ? { scaleY: progress } : { scaleX: progress }} />
        </div>
        {journey.steps.map((step, index) => {
          const Icon = workflowIcons[index] ?? HeartPulse;
          return (
            <SectionReveal key={step} className={styles.workflowStep} delay={index * 0.055}>
              <span className={styles.workflowIndex}>{String(index + 1).padStart(2, "0")}</span>
              <span className={styles.workflowIcon}><Icon aria-hidden="true" /></span>
              <h3>{step}</h3>
            </SectionReveal>
          );
        })}
      </div>
    </section>
  );
}
