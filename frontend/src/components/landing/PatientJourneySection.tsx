"use client";

import { useRef } from "react";
import { CalendarCheck, FileCheck2, FolderPlus, HeartPulse, Stethoscope } from "lucide-react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";

import { smoothSpring, useIsMobile } from "./landing-motion";
import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const journeyIcons = [FolderPlus, CalendarCheck, Stethoscope, FileCheck2, HeartPulse];

export function PatientJourneySection({ journey }: { journey: LandingContent["journey"] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const isMobile = useIsMobile();
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start 75%", "end 28%"] });
  const rawFill = useTransform(scrollYProgress, [0.08, 0.72], [reduceMotion ? 1 : 0, 1]);
  const fill = useSpring(rawFill, smoothSpring);

  /* Major section transition: deep ecosystem green → light journey tint. */
  const backgroundColor = useTransform(scrollYProgress, [0, 0.3], ["#102f2b", "#eef4f1"]);

  return (
    <motion.section
      ref={sectionRef}
      className={styles.journeySection}
      aria-labelledby="journey-title"
      style={reduceMotion ? undefined : { backgroundColor }}
    >
      <SectionReveal className={styles.sectionHeadingCentered}>
        <p className={styles.eyebrow}>{journey.eyebrow}</p>
        <h2 id="journey-title">{journey.title}</h2>
        <p>{journey.description}</p>
      </SectionReveal>
      <div className={styles.journeyTrack}>
        <div className={styles.journeyLine} aria-hidden="true">
          {isMobile ? <motion.i style={{ scaleY: fill }} /> : <motion.i style={{ scaleX: fill }} />}
        </div>
        {journey.steps.map((step, index) => {
          const Icon = journeyIcons[index];
          return (
            <motion.div
              key={step}
              className={styles.journeyStep}
              initial={{ opacity: 0.35, y: reduceMotion ? 0 : 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ amount: 0.65, once: false }}
              transition={{ duration: reduceMotion ? 0.2 : 0.45 }}
            >
              <span><Icon aria-hidden="true" /></span>
              <small>{String(index + 1).padStart(2, "0")}</small>
              <strong>{step}</strong>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
