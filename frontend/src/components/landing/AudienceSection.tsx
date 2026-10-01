"use client";

import { useState } from "react";
import { Building2, Check, Stethoscope } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { ProductMockup } from "./ProductMockup";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

export function AudienceSection({ audience }: { audience: LandingContent["audience"] }) {
  const [profile, setProfile] = useState<"establishment" | "doctor">("establishment");
  const reduceMotion = useReducedMotion();
  const active = audience[profile];

  return (
    <section id="etablissements" className={styles.audienceSection} aria-labelledby="audience-title">
      <div className={styles.audienceHeader}>
        <div>
          <p className={styles.eyebrow}>{audience.eyebrow}</p>
          <h2 id="audience-title">{audience.title}</h2>
        </div>
        <div className={styles.profileTabs} role="tablist" aria-label={audience.title}>
          <button type="button" role="tab" aria-selected={profile === "establishment"} onClick={() => setProfile("establishment")}>
            <Building2 aria-hidden="true" />{audience.establishment.tab}
          </button>
          <button id="medecins" type="button" role="tab" aria-selected={profile === "doctor"} onClick={() => setProfile("doctor")}>
            <Stethoscope aria-hidden="true" />{audience.doctor.tab}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={profile}
          className={styles.audiencePanel}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : -12 }}
          transition={{ duration: reduceMotion ? 0.15 : 0.4 }}
        >
          <div className={styles.audienceCopy}>
            <span className={styles.profileIcon}>{profile === "establishment" ? <Building2 aria-hidden="true" /> : <Stethoscope aria-hidden="true" />}</span>
            <h3>{active.title}</h3>
            <p>{active.text}</p>
            <ul>
              {active.points.map((point) => <li key={point}><Check aria-hidden="true" />{point}</li>)}
            </ul>
          </div>
          <ProductMockup points={active.points} title={active.tab} variant={profile} />
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

