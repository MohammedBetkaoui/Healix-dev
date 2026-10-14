"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
  type UseScrollOptions,
} from "framer-motion";

import styles from "./landing.module.css";

/* ------------------------------------------------------------------ */
/*  HealixDz premium motion system — single source of truth             */
/*  All scroll animations are reversible: they are driven by scroll     */
/*  progress (MotionValues), so scrolling up replays them naturally.    */
/* ------------------------------------------------------------------ */

export const premiumEase = [0.22, 1, 0.36, 1] as const;

export const springConfig = {
  stiffness: 110,
  damping: 24,
  mass: 0.8,
};

/** Softer spring for elements bound directly to scroll progress. */
export const smoothSpring = {
  stiffness: 100,
  damping: 26,
  mass: 0.7,
};

/** Shared transition for product screen crossfades (450–650 ms). */
export const productScreenTransition = {
  duration: 0.55,
  ease: premiumEase,
} as const;

export const productScreenVariants = {
  initial: { opacity: 0, scale: 0.985, y: 14, filter: "blur(3px)" },
  animate: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.985, y: -12, filter: "blur(3px)" },
};

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

/** Scroll direction from Framer's scrollY — no manual window listener. */
export function useScrollDirection(): "up" | "down" {
  const { scrollY } = useScroll();
  const [direction, setDirection] = useState<"up" | "down">("down");
  const previous = useRef(0);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const prev = previous.current;
    if (latest > prev + 2) {
      previous.current = latest;
      setDirection((current) => (current === "down" ? current : "down"));
    } else if (latest < prev - 2) {
      previous.current = latest;
      setDirection((current) => (current === "up" ? current : "up"));
    }
  });

  return direction;
}

export function useIsMobile(breakpoint = 680): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}

/**
 * Combined motion gate: reduced-motion OR small screen.
 * `calm` disables parallax / sticky storytelling / blur / velocity FX.
 * Simple fade + translateY crossfades are always kept.
 */
export function useLandingMotion() {
  const reduceMotion = useReducedMotion() ?? false;
  const isMobile = useIsMobile();
  return { reduceMotion, isMobile, calm: reduceMotion || isMobile };
}

/** Smooth scroll progress of a target section (bidirectional by design). */
export function useTargetProgress(
  target: RefObject<HTMLElement | null>,
  offset: UseScrollOptions["offset"] = ["start end", "end start"],
) {
  const { scrollYProgress } = useScroll({ target, offset });
  const smooth = useSpring(scrollYProgress, smoothSpring);
  return { progress: scrollYProgress, smooth };
}

/* ------------------------------------------------------------------ */
/*  TextReveal — premium masked title reveal, word by word              */
/*  overflow hidden · y 110% → 0 · stagger 85 ms · reversible           */
/* ------------------------------------------------------------------ */

export function TextReveal({ text, id }: { text: string; id?: string }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <h2 id={id}>{text}</h2>;

  /* Single IntersectionObserver on the heading (reliable) driving a
     word stagger via variant propagation — fully reversible through
     the overflow masks. */
  const words = text.split(" ");
  return (
    <motion.h2
      id={id}
      aria-label={text}
      initial="hidden"
      whileInView="visible"
      viewport={{ amount: 0.4, once: false }}
      transition={{ staggerChildren: 0.085 }}
    >
      {words.map((word, index) => (
        <span key={`${index}-${word}`} className={styles.revealMask} aria-hidden="true">
          <motion.span
            className={styles.revealWord}
            variants={{
              hidden: { y: "110%", opacity: 0 },
              visible: { y: "0%", opacity: 1 },
            }}
            transition={{ duration: 0.7, ease: premiumEase }}
          >
            {word}
            {index < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </motion.h2>
  );
}

/* ------------------------------------------------------------------ */
/*  ScrollWordReveal — paragraph revealed word by word by scroll        */
/*  opacity 0.28 → 1 · max 2–3 usages across the landing                */
/* ------------------------------------------------------------------ */

function ScrollWord({
  progress,
  range,
  children,
}: {
  progress: MotionValue<number>;
  range: [number, number];
  children: ReactNode;
}) {
  const opacity = useTransform(progress, range, [0.28, 1]);
  return <motion.span style={{ opacity }}>{children}</motion.span>;
}

export function ScrollWordReveal({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { calm } = useLandingMotion();
  const { smooth } = useTargetProgress(ref, ["start 0.85", "end 0.45"]);

  const words = text.split(" ");
  if (calm) return <p className={className}>{text}</p>;

  return (
    <p ref={ref} className={className} aria-label={text}>
      {words.map((word, index) => {
        const start = index / words.length;
        return (
          <span key={`${index}-${word}`} aria-hidden="true">
            <ScrollWord progress={smooth} range={[start, Math.min(1, start + 1 / words.length + 0.06)]}>
              {word}
            </ScrollWord>
            {index < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  ScrollFade — opacity bound to section progress                     */
/* ------------------------------------------------------------------ */

export function ScrollFade({
  children,
  className = "",
  from = 0,
  to = 1,
  start = "start 0.9",
  end = "start 0.5",
}: {
  children: ReactNode;
  className?: string;
  from?: number;
  to?: number;
  start?: string;
  end?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { calm } = useLandingMotion();
  const { smooth } = useTargetProgress(ref, [start, end] as UseScrollOptions["offset"]);
  const opacity = useTransform(smooth, [0, 1], [from, to]);

  if (calm) return <div className={className}>{children}</div>;
  return (
    <motion.div ref={ref} className={className} style={{ opacity }}>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  ScrollParallax — subtle multi-layer parallax (±40 px max)           */
/* ------------------------------------------------------------------ */

export function ScrollParallax({
  children,
  className = "",
  from = 30,
  to = -30,
}: {
  children: ReactNode;
  className?: string;
  from?: number;
  to?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { calm } = useLandingMotion();
  const { smooth } = useTargetProgress(ref);
  const raw = useTransform(smooth, [0, 1], [from, to]);
  const y = useSpring(raw, smoothSpring);

  if (calm) return <div className={className}>{children}</div>;
  return (
    <motion.div ref={ref} className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  StickyStory — sticky storytelling container primitive              */
/* ------------------------------------------------------------------ */

export function StickyStory({
  children,
  className = "",
  top = 110,
}: {
  children: ReactNode;
  className?: string;
  top?: number;
}) {
  return (
    <div className={`${styles.stickyStory} ${className}`} style={{ top }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AnimatedLine — SVG workflow connection drawn by scroll              */
/*  pathLength 0 → 1 · opacity 0 → 1 · fully reversible                 */
/* ------------------------------------------------------------------ */

export function AnimatedLine({
  d,
  progress,
  range = [0.08, 0.68],
  className = "",
}: {
  d: string;
  progress: MotionValue<number>;
  range?: [number, number];
  className?: string;
}) {
  const raw = useTransform(progress, range, [0, 1]);
  const pathLength = useSpring(raw, springConfig);
  const opacity = useTransform(raw, [0, 0.12], [0, 1]);
  return <motion.path d={d} className={className} style={{ pathLength, opacity }} />;
}

/* ------------------------------------------------------------------ */
/*  ScreenMask — scroll-linked clip-path reveal for product screens     */
/*  inset(10% 8%) → inset(0%) · scale 1.03 → 1 · reversible             */
/* ------------------------------------------------------------------ */

export function ScreenMask({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { calm } = useLandingMotion();
  const { smooth } = useTargetProgress(ref, ["start 0.9", "start 0.45"]);
  const scale = useTransform(smooth, [0, 1], [1.03, 1]);
  const vertical = useTransform(smooth, [0, 1], [10, 0]);
  const horizontal = useTransform(smooth, [0, 1], [8, 0]);
  const clipPath = useMotionTemplate`inset(${vertical}% ${horizontal}% ${vertical}% ${horizontal}% round 10px)`;

  if (calm) return <div className={className}>{children}</div>;
  return (
    <motion.div ref={ref} className={`${styles.screenMask} ${className}`} style={{ scale, clipPath }}>
      {children}
    </motion.div>
  );
}
