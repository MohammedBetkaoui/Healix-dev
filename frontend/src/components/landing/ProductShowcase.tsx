"use client";

import { BadgeCheck } from "lucide-react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";

import { useIsMobile, premiumEase, smoothSpring } from "./landing-motion";
import { ProductScreen } from "./ProductScreen";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

type ProductShowcaseProps = {
  hero: LandingContent["hero"];
  showcase: LandingContent["showcase"];
};

export function ProductShowcase({ hero, showcase }: ProductShowcaseProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const isMobile = useIsMobile();
  const calm = reduceMotion || isMobile;
  const { scrollY } = useScroll();

  /* Midground layer: drifts slightly more than the foreground visual. */
  const rearY = useSpring(useTransform(scrollY, [0, 800], [0, calm ? 0 : 16]), smoothSpring);

  return (
    <motion.div
      className={styles.heroProduct}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.98, clipPath: "inset(8% 0 0 0 round 12px)" }}
      animate={{ opacity: 1, scale: 1, clipPath: "inset(0% 0 0 0 round 12px)" }}
      transition={{ delay: reduceMotion ? 0 : 0.35, duration: reduceMotion ? 0 : 0.8, ease: premiumEase }}
    >
      <motion.div className={styles.heroProductRear} aria-hidden="true" style={{ y: rearY }}>
        <ProductScreen compact data={showcase.tabs[0]} ui={showcase.ui} />
      </motion.div>
      <div className={styles.heroProductMain}>
        <ProductScreen data={showcase.preview} ui={showcase.ui} />
      </div>
      <div className={styles.heroVerifiedCard}>
        <span><BadgeCheck aria-hidden="true" /></span>
        <div><small>{hero.verifiedLabel}</small><strong>{hero.verified}</strong></div>
      </div>
      <div className={styles.heroAnnotations} aria-hidden="true">
        {hero.annotations.map((annotation) => <span key={annotation}>{annotation}</span>)}
      </div>
    </motion.div>
  );
}
