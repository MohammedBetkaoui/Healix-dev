"use client";

import { useRef } from "react";
import { CalendarCheck, FileCheck2, FolderPlus, HeartPulse, Stethoscope } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const journeyIcons = [FolderPlus, CalendarCheck, Stethoscope, FileCheck2, HeartPulse];

export function PatientJourneySection({ journey }: { journey: LandingContent["journey"] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start 75%", "end 28%"] });
  const scaleX = useTransform(scrollYProgress, [0.08, 0.72], [reduceMotion ? 1 : 0, 1]);

  return (
    <section ref={sectionRef} className={styles.journeySection} aria-labelledby="journey-title">
      <div className={styles.sectionHeadingCentered}>
        <p className={styles.eyebrow}>{journey.eyebrow}</p>
        <h2 id="journey-title">{journey.title}</h2>
      </div>
      <div className={styles.journeyTrack}>
        <div className={styles.journeyLine} aria-hidden="true"><motion.i style={{ scaleX }} /></div>
        {journey.steps.map((step, index) => {
          const Icon = journeyIcons[index];
          return (
            <motion.div
              key={step}
              className={styles.journeyStep}
              initial={{ opacity: 0.35, y: reduceMotion ? 0 : 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ amount: 0.65 }}
            >
              <span><Icon aria-hidden="true" /></span>
              <small>{String(index + 1).padStart(2, "0")}</small>
              <strong>{step}</strong>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

