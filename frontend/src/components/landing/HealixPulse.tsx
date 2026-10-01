"use client";

import { motion, useReducedMotion } from "framer-motion";

import styles from "./landing.module.css";

type HealixPulseProps = {
  className?: string;
  tone?: "light" | "medical" | "ai";
};

export function HealixPulse({
  className = "",
  tone = "medical",
}: HealixPulseProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={`${styles.pulse} ${styles[`pulse_${tone}`]} ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 720 52" preserveAspectRatio="none">
        <path className={styles.pulseBase} d="M0 27H250l18-1 10-14 15 30 17-39 19 24h95l14-1 8-10 11 21 14-10H720" />
        <motion.path
          className={styles.pulseSignal}
          d="M0 27H250l18-1 10-14 15 30 17-39 19 24h95l14-1 8-10 11 21 14-10H720"
          initial={{ pathLength: reduceMotion ? 1 : 0.2, opacity: 0.35 }}
          animate={
            reduceMotion
              ? { pathLength: 1, opacity: 0.55 }
              : { pathLength: [0.25, 1, 1], opacity: [0.25, 0.8, 0.35] }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 6, ease: "easeInOut", repeat: Infinity }
          }
        />
      </svg>
    </div>
  );
}

