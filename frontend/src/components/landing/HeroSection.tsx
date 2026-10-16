"use client";

import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { premiumEase } from "./landing-motion";
import { ProductShowcase } from "./ProductShowcase";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

type HeroSectionProps = {
  hero: LandingContent["hero"];
  showcase: LandingContent["showcase"];
};

export function HeroSection({ hero, showcase }: HeroSectionProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const reveal = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 18 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <video
        className={styles.heroVideo}
        autoPlay={!reduceMotion}
        muted
        loop
        playsInline
        preload={reduceMotion ? "metadata" : "auto"}
        aria-hidden="true"
        tabIndex={-1}
      >
        <source src="/landing/49809-458438857.mp4" type="video/mp4" />
      </video>
      <div className={styles.heroBackdrop} aria-hidden="true" />
      <div className={styles.heroGrid}>
        <motion.div
          className={styles.heroCopy}
          initial="hidden"
          animate="visible"
          transition={{ staggerChildren: reduceMotion ? 0 : 0.08, delayChildren: 0.08 }}
        >
          <motion.p className={styles.eyebrow} variants={reveal} transition={{ duration: 0.55, ease: premiumEase }}>
            {hero.eyebrow}
          </motion.p>
          <motion.h1 id="hero-title" variants={reveal} transition={{ duration: 0.72, ease: premiumEase }}>
            <span>{hero.titleLine1}</span>
            <span><em>{hero.titleAccent}</em>{hero.titleLine2 ? ` ${hero.titleLine2}` : ""}</span>
            <span>{hero.titleLine3}</span>
          </motion.h1>
          <motion.p className={styles.heroLead} variants={reveal} transition={{ duration: 0.62, ease: premiumEase }}>
            {hero.lead}
          </motion.p>
          <motion.div className={styles.heroCtas} variants={reveal} transition={{ duration: 0.62, ease: premiumEase }}>
            <Link href="/register" className={styles.primaryButton}>
              {hero.primaryCta}<ArrowUpRight aria-hidden="true" />
            </Link>
            <a href="#product" className={styles.secondaryButton}>
              {hero.secondaryCta}<ArrowDown aria-hidden="true" />
            </a>
          </motion.div>
          <motion.ul className={styles.heroProofs} variants={reveal} transition={{ duration: 0.62, ease: premiumEase }}>
            {hero.modules.map((item) => <li key={item}><Check aria-hidden="true" />{item}</li>)}
          </motion.ul>
        </motion.div>

        <div className={styles.heroVisual}>
          <ProductShowcase hero={hero} showcase={showcase} />
        </div>
      </div>
    </section>
  );
}
