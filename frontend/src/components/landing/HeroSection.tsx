"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

import { premiumEase } from "./landing-motion";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

type HeroSectionProps = {
  hero: LandingContent["hero"];
  showcase: LandingContent["showcase"];
};

const lineInner = {
  hidden: { y: "110%", opacity: 0 },
  visible: { y: "0%", opacity: 1 },
};

const lineDelay = (index: number, reduceMotion: boolean) => (reduceMotion ? 0 : 0.14 + index * 0.09);

export function HeroSection({ hero }: HeroSectionProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const backgroundY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 18]);
  const backgroundScale = useTransform(scrollYProgress, [0, 1], [1, reduceMotion ? 1 : 1.025]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : -15]);

  const item = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 18 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <section ref={heroRef} className={styles.hero} aria-labelledby="hero-title">
      <motion.div
        className={styles.heroBackground}
        aria-hidden="true"
        style={{ y: backgroundY, scale: backgroundScale }}
      >
        <Image
          src="/landing/hero-background.png"
          alt=""
          fill
          priority
          quality={90}
          sizes="100vw"
          className={styles.heroBackgroundImage}
        />
      </motion.div>
      <div className={styles.heroBackgroundOverlay} aria-hidden="true" />
      <div className={styles.heroGrid}>
        <motion.div
          className={styles.heroCopy}
          style={{ y: copyY }}
          initial="hidden"
          animate="visible"
          transition={{ staggerChildren: reduceMotion ? 0 : 0.085, delayChildren: 0.08 }}
        >
          <motion.p className={styles.eyebrow} variants={item} transition={{ duration: 0.55, ease: premiumEase }}>
            {hero.eyebrow}
          </motion.p>
          <h1 id="hero-title">
            <span className={styles.heroLineMask}>
              <motion.span
                className={styles.heroLine}
                initial={reduceMotion ? { opacity: 0 } : "hidden"}
                animate="visible"
                variants={lineInner}
                transition={{ duration: 0.7, ease: premiumEase, delay: lineDelay(0, reduceMotion) }}
              >
                {hero.titleLine1}
              </motion.span>
            </span>
            <span className={styles.heroLineMask}>
              <motion.span
                className={styles.heroLine}
                initial={reduceMotion ? { opacity: 0 } : "hidden"}
                animate="visible"
                variants={lineInner}
                transition={{ duration: 0.7, ease: premiumEase, delay: lineDelay(1, reduceMotion) }}
              >
                <em>{hero.titleAccent}</em> {hero.titleLine2}
              </motion.span>
            </span>
            <span className={styles.heroLineMask}>
              <motion.span
                className={styles.heroLine}
                initial={reduceMotion ? { opacity: 0 } : "hidden"}
                animate="visible"
                variants={lineInner}
                transition={{ duration: 0.7, ease: premiumEase, delay: lineDelay(2, reduceMotion) }}
              >
                {hero.titleLine3}
              </motion.span>
            </span>
          </h1>
          <motion.p className={styles.heroLead} variants={item} transition={{ duration: 0.65, ease: premiumEase }}>
            {hero.lead}
          </motion.p>
          <motion.p className={styles.heroModules} variants={item} transition={{ duration: 0.65, ease: premiumEase }}>
            {hero.modules.join(" · ")}
          </motion.p>
          <motion.div className={styles.heroCtas} variants={item} transition={{ duration: 0.65, ease: premiumEase }}>
            <a href="#solutions" className={styles.primaryButton}>
              {hero.primaryCta}
              <ArrowDown aria-hidden="true" />
            </a>
            <Link href="/register" className={styles.secondaryButton}>
              {hero.secondaryCta}
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </motion.div>
          <motion.p className={styles.heroTrust} variants={item} transition={{ duration: 0.65, ease: premiumEase }}>
            <CheckCircle2 aria-hidden="true" />{hero.trust}
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
