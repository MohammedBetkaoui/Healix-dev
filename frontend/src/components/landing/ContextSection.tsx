"use client";

import { useRef } from "react";
import Image from "next/image";
import { ArrowDown, CheckCircle2 } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

import { HealixLogo } from "@/components/shared/HealixLogo";

import { ScrollWordReveal, TextReveal } from "./landing-motion";
import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

export function ContextSection({ context }: { context: LandingContent["context"] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const backgroundY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 20]);
  const backgroundScale = useTransform(scrollYProgress, [0, 1], [1, reduceMotion ? 1 : 1.02]);

  return (
    <section ref={sectionRef} id="plateforme" className={styles.contextSection} aria-labelledby="context-title">
      <motion.div
        className={styles.contextBackground}
        aria-hidden="true"
        style={{ y: backgroundY, scale: backgroundScale }}
      >
        <Image
          src="/landing/base-clinique-background.png"
          alt=""
          fill
          quality={90}
          sizes="100vw"
          className={styles.contextBackgroundImage}
        />
      </motion.div>
      <div className={styles.contextBackgroundOverlay} aria-hidden="true" />

      <SectionReveal className={styles.contextGrid}>
        <div className={styles.contextCopy}>
          <p className={styles.eyebrow}>{context.eyebrow}</p>
          <TextReveal text={context.title} id="context-title" />
        </div>
        <div className={styles.contextNarrative}>
          <ScrollWordReveal text={context.paragraph} />
          <p>{context.paragraph2}</p>
          <strong><CheckCircle2 aria-hidden="true" />{context.finalLine}</strong>
        </div>
      </SectionReveal>

      <SectionReveal className={styles.contextSystem} delay={0.08}>
        <div className={styles.contextSystemSource}>
          {context.fragments.map((fragment) => <span key={fragment}>{fragment}</span>)}
        </div>
        <ArrowDown aria-hidden="true" />
        <div className={styles.contextSystemCore}>
          <HealixLogo variant="mark" className={styles.contextLogo} />
          <div><small>{context.systemLabel}</small><strong>HealixDz</strong></div>
        </div>
      </SectionReveal>
    </section>
  );
}
