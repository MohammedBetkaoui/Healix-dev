"use client";

import { ArrowRight, BrainCircuit, FileText, ListChecks, Scale, ShieldCheck, UserCheck } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { SectionReveal } from "./SectionReveal";
import { premiumEase } from "./landing-motion";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const aiIcons = [FileText, BrainCircuit, ListChecks, UserCheck, Scale];

export function AiSection({ ai }: { ai: LandingContent["ai"] }) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <section id="healix-ai" className={styles.aiSection} aria-labelledby="ai-title">
      <SectionReveal className={styles.aiHeader}>
        <div>
          <p className={styles.aiEyebrow}>{ai.eyebrow}</p>
          <span className={styles.roadmapLabel}>{ai.label}</span>
          <h2 id="ai-title">{ai.title}</h2>
        </div>
        <div className={styles.aiCopy}>
          <p>{ai.text}</p>
          <strong><ShieldCheck aria-hidden="true" />{ai.caution}</strong>
        </div>
      </SectionReveal>

      <SectionReveal className={styles.aiWorkspace} delay={0.08}>
        <div className={styles.aiDocument} aria-hidden="true">
          <div className={styles.aiDocumentTop}><span /><span /><small>{ai.flow[0]}</small></div>
          <div className={styles.aiDocumentBody}>
            <i /><i /><i /><i />
            <span><BrainCircuit /></span>
          </div>
        </div>
        <div className={styles.aiStructuredResult}>
          <span><BrainCircuit aria-hidden="true" />Healix AI</span>
          <h3>{ai.flow[2]}</h3>
          <div aria-hidden="true"><i /><i /><i /><i /></div>
          <strong><UserCheck aria-hidden="true" />{ai.flow[3]}</strong>
        </div>
      </SectionReveal>

      <div className={styles.aiFlow}>
        {ai.flow.map((step, index) => {
          const Icon = aiIcons[index] ?? FileText;
          return (
            <motion.div
              key={step}
              className={styles.aiFlowStep}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.45 }}
              transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : index * 0.055, ease: premiumEase }}
            >
              <span><Icon aria-hidden="true" /></span>
              <small>{String(index + 1).padStart(2, "0")}</small>
              <strong>{step}</strong>
              {index < ai.flow.length - 1 ? <ArrowRight className={styles.aiArrow} aria-hidden="true" /> : null}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
