"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { ProductScreen, type ProductScreenData } from "./ProductScreen";
import { SectionReveal } from "./SectionReveal";
import { premiumEase } from "./landing-motion";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

export function ProductTour({ showcase }: { showcase: LandingContent["showcase"] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const reduceMotion = useReducedMotion() ?? false;
  const screens: readonly ProductScreenData[] = [showcase.preview, ...showcase.tabs];
  const active = screens[activeIndex] ?? screens[0];

  return (
    <section id="product" className={styles.productTour} aria-labelledby="product-tour-title">
      <SectionReveal className={styles.productTourIntro}>
        <div>
          <p className={styles.eyebrow}>{showcase.eyebrow}</p>
          <h2 id="product-tour-title">{showcase.title}</h2>
        </div>
        <p>{showcase.text}</p>
      </SectionReveal>

      <div className={styles.productTourLayout}>
        <div className={styles.productTourTabs} role="tablist" aria-label={showcase.title}>
          {screens.map((screen, index) => (
            <button
              key={screen.id}
              type="button"
              id={`product-tab-${screen.id}`}
              role="tab"
              aria-selected={activeIndex === index}
              aria-controls="product-showcase-panel"
              onClick={() => setActiveIndex(index)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{screen.label}</strong>
              <small>{screen.annotation}</small>
            </button>
          ))}
        </div>

        <div
          id="product-showcase-panel"
          className={styles.productTourStage}
          role="tabpanel"
          aria-labelledby={`product-tab-${active.id}`}
          aria-live="polite"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
              transition={{ duration: reduceMotion ? 0.15 : 0.48, ease: premiumEase }}
            >
              <ProductScreen data={active} ui={showcase.ui} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
