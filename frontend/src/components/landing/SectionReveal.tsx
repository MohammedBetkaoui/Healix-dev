"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

import { premiumEase } from "./landing-motion";
import styles from "./landing.module.css";

type SectionRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

/**
 * Reversible section reveal: fades back out when the section leaves the
 * viewport, so scrolling up and down replays the same coherent motion.
 * Blur is reserved for desktop full-motion users.
 */
export function SectionReveal({
  children,
  className = "",
  delay = 0,
}: SectionRevealProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={`${styles.sectionReveal} ${className}`}
      initial={
        reduceMotion
          ? false
          : { opacity: 0, y: 24, filter: "blur(4px)" }
      }
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ amount: 0.16, once: false, margin: "-6% 0px -6% 0px" }}
      transition={{
        delay: reduceMotion ? 0 : delay,
        duration: reduceMotion ? 0 : 0.65,
        ease: premiumEase,
      }}
    >
      {children}
    </motion.div>
  );
}
