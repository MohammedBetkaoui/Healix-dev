"use client";

import { BadgeCheck, BrainCircuit, CalendarCheck, FolderHeart } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { premiumEase } from "./landing-motion";
import { ProductScreen } from "./ProductScreen";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

type ProductShowcaseProps = {
  hero: LandingContent["hero"];
  showcase: LandingContent["showcase"];
};

const panelIcons = [CalendarCheck, FolderHeart, BrainCircuit];

export function ProductShowcase({ hero, showcase }: ProductShowcaseProps) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      className={styles.heroProduct}
      initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: reduceMotion ? 0 : 0.28, duration: reduceMotion ? 0 : 0.72, ease: premiumEase }}
    >
      <div className={styles.heroProductChrome} aria-hidden="true">
        <span /><span /><span />
        <small>app.healixdz.com</small>
      </div>
      <div className={styles.heroProductMain}>
        <ProductScreen data={showcase.preview} ui={showcase.ui} />
      </div>
      <div className={styles.heroVerifiedCard}>
        <span><BadgeCheck aria-hidden="true" /></span>
        <div><small>{hero.verifiedLabel}</small><strong>{hero.verified}</strong></div>
      </div>
      <div className={styles.heroMicroPanels} aria-hidden="true">
        {hero.annotations.slice(0, 3).map((annotation, index) => {
          const Icon = panelIcons[index] ?? FolderHeart;
          return <span key={annotation}><Icon />{annotation}</span>;
        })}
      </div>
    </motion.div>
  );
}
