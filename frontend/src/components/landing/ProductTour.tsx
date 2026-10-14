"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
} from "framer-motion";

import {
  StickyStory,
  premiumEase,
  smoothSpring,
  useIsMobile,
} from "./landing-motion";
import { ProductScreen } from "./ProductScreen";
import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

type ProductTourProps = {
  showcase: LandingContent["showcase"];
};

type ScreenDirection = 1 | -1;

const screenVariants = {
  enter: ({ direction, reduceMotion }: { direction: ScreenDirection; reduceMotion: boolean }) => ({
    opacity: 0,
    x: reduceMotion ? 0 : direction * 26,
    scale: reduceMotion ? 1 : 0.992,
  }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: ({ direction, reduceMotion }: { direction: ScreenDirection; reduceMotion: boolean }) => ({
    opacity: 0,
    x: reduceMotion ? 0 : direction * -18,
    scale: reduceMotion ? 1 : 0.996,
  }),
};

export function ProductTour({ showcase }: ProductTourProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [screenDirection, setScreenDirection] = useState<ScreenDirection>(1);
  const reduceMotion = useReducedMotion() ?? false;
  const isMobile = useIsMobile(680);
  const isCompact = useIsMobile(1180);
  const stepsWrapRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndexRef = useRef(0);
  const active = showcase.tabs[activeIndex] ?? showcase.tabs[0];
  const count = showcase.tabs.length;

  /* Desktop storytelling is scroll-driven; tablet keeps manual tabs,
     mobile renders a plain stack of blocks with screenshots. */
  const scrollDriven = !reduceMotion && !isCompact;
  const drivenRef = useRef(scrollDriven);

  useEffect(() => {
    drivenRef.current = scrollDriven;
  }, [scrollDriven]);

  const { scrollYProgress } = useScroll({
    target: stepsWrapRef,
    offset: ["start 0.65", "end 0.5"],
  });
  const smooth = useSpring(scrollYProgress, {
    ...smoothSpring,
    stiffness: 110,
    damping: 30,
    mass: 0.72,
    restDelta: 0.001,
  });

  const activateStep = useCallback((nextIndex: number) => {
    const next = Math.min(count - 1, Math.max(0, nextIndex));
    const previous = activeIndexRef.current;
    if (next === previous) return;

    setScreenDirection(next > previous ? 1 : -1);
    activeIndexRef.current = next;
    setActiveIndex(next);
  }, [count]);

  /* Guarded state update: only fires when the step index actually changes,
     never on every scroll pixel. Reversible — scrolling up walks back. */
  useMotionValueEvent(smooth, "change", (value) => {
    if (!drivenRef.current) return;
    activateStep(Math.round(value * (count - 1)));
  });

  const goToStep = (index: number) => {
    activateStep(index);
    if (scrollDriven) {
      stepRefs.current[index]?.scrollIntoView({
        block: "center",
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }
  };

  const screenTransition = reduceMotion
    ? { duration: 0.16 }
    : {
        opacity: { duration: 0.28, ease: premiumEase },
        x: { type: "spring" as const, stiffness: 240, damping: 28, mass: 0.8 },
        scale: { duration: 0.42, ease: premiumEase },
      };

  /* ---------- Mobile: plain sequence of blocks with screenshots ---------- */
  if (isMobile) {
    return (
      <section id="solutions" className={styles.productTour} aria-labelledby="product-tour-title">
        <SectionReveal className={styles.productTourIntro}>
          <div>
            <p className={styles.eyebrow}>{showcase.eyebrow}</p>
            <h2 id="product-tour-title">{showcase.title}</h2>
          </div>
          <p>{showcase.text}</p>
        </SectionReveal>
        <div className={styles.productTourMobile}>
          {showcase.tabs.map((tab, index) => (
            <SectionReveal key={tab.id}>
              <article>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{tab.label}</h3>
                <p>{tab.description}</p>
                <ProductScreen data={tab} ui={showcase.ui} />
              </article>
            </SectionReveal>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section id="solutions" className={styles.productTour} aria-labelledby="product-tour-title">
      <SectionReveal className={styles.productTourIntro}>
        <div>
          <p className={styles.eyebrow}>{showcase.eyebrow}</p>
          <h2 id="product-tour-title">{showcase.title}</h2>
        </div>
        <p>{showcase.text}</p>
      </SectionReveal>

      <div className={styles.productTourGrid}>
        <StickyStory className={styles.productTourStage} top={104}>
          <div className={styles.productTourScreenViewport} aria-live="polite">
            <AnimatePresence
              mode="sync"
              initial={false}
              custom={{ direction: screenDirection, reduceMotion }}
            >
              <motion.div
                key={active.id}
                className={styles.productTourScreen}
                custom={{ direction: screenDirection, reduceMotion }}
                variants={screenVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={screenTransition}
              >
                <ProductScreen data={active} ui={showcase.ui} />
                <span className={styles.productTourAnnotation}>{active.annotation}</span>
              </motion.div>
            </AnimatePresence>
          </div>
          {scrollDriven ? (
            <p className={styles.tourCounter} aria-hidden="true">
              <span className={styles.tourCounterCurrent}>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={activeIndex}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: screenDirection * 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: screenDirection * -8 }}
                    transition={{ duration: reduceMotion ? 0.12 : 0.24, ease: premiumEase }}
                  >
                    {String(activeIndex + 1).padStart(2, "0")}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span>/ {String(count).padStart(2, "0")}</span>
            </p>
          ) : null}
        </StickyStory>

        <div ref={stepsWrapRef} className={styles.productTourStepsWrap}>
          {scrollDriven ? (
            <div className={styles.tourRail} aria-hidden="true">
              <motion.i style={{ scaleY: smooth }} />
            </div>
          ) : null}
          <div className={styles.productTourSteps}>
            {showcase.tabs.map((tab, index) => (
              <motion.button
                key={tab.id}
                ref={(element) => {
                  stepRefs.current[index] = element;
                }}
                type="button"
                className={styles.productTourStep}
                data-active={activeIndex === index}
                aria-pressed={activeIndex === index}
                onClick={() => goToStep(index)}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ amount: 0.4, once: false }}
                transition={{ duration: reduceMotion ? 0.2 : 0.5, ease: premiumEase }}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{tab.label}</h3>
                <p>{tab.description}</p>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
