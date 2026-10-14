"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

import { ScrollWordReveal, TextReveal } from "./landing-motion";
import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

export function FinalCta({ cta }: { cta: LandingContent["finalCta"] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const backgroundY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 20]);
  const backgroundScale = useTransform(scrollYProgress, [0, 1], [1, reduceMotion ? 1 : 1.02]);

  return (
    <section ref={sectionRef} className={styles.finalCta} aria-labelledby="final-cta-title">
      <motion.div
        className={styles.finalCtaBackground}
        aria-hidden="true"
        style={{ y: backgroundY, scale: backgroundScale }}
      >
        <Image
          src="/landing/Fond médical futuriste vert canard.png"
          alt=""
          fill
          quality={90}
          sizes="100vw"
          className={styles.finalCtaBackgroundImage}
        />
      </motion.div>
      <div className={styles.finalCtaOverlay} aria-hidden="true" />

      <SectionReveal className={styles.finalCtaInner}>
        <p className={styles.finalCtaEyebrow}>{cta.eyebrow}</p>
        <TextReveal text={cta.title} id="final-cta-title" />
        <ScrollWordReveal text={cta.text} />
        <div><Link href="/register">{cta.primary}<ArrowUpRight aria-hidden="true" /></Link><Link href="/login">{cta.secondary}</Link></div>
        <small>{cta.profiles}</small>
      </SectionReveal>
    </section>
  );
}
