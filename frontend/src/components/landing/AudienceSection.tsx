"use client";

import { useState } from "react";
import { Building2, Check, Stethoscope } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { ScreenMask, productScreenTransition, productScreenVariants } from "./landing-motion";
import { ProductMockup } from "./ProductMockup";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

type AudienceSectionProps = {
  audience: LandingContent["audience"];
  screenUi: LandingContent["showcase"]["ui"];
};

export function AudienceSection({ audience, screenUi }: AudienceSectionProps) {
  const [profile, setProfile] = useState<"establishment" | "doctor">("establishment");
  const reduceMotion = useReducedMotion() ?? false;
  const active = audience[profile];

  return (
    <section id="etablissements" className={styles.audienceSection} aria-labelledby="audience-title">
      <div className={styles.audienceHeader}>
        <div>
          <p className={styles.eyebrow}>{audience.eyebrow}</p>
          <h2 id="audience-title">{audience.title}</h2>
        </div>
        <div className={styles.profileTabs} role="tablist" aria-label={audience.title}>
          <button id="profile-tab-establishment" type="button" role="tab" aria-controls="profile-panel" aria-selected={profile === "establishment"} onClick={() => setProfile("establishment")}>
            <Building2 aria-hidden="true" />{audience.establishment.tab}
          </button>
          <button id="medecins" type="button" role="tab" aria-controls="profile-panel" aria-selected={profile === "doctor"} onClick={() => setProfile("doctor")}>
            <Stethoscope aria-hidden="true" />{audience.doctor.tab}
          </button>
        </div>
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={profile}
          id="profile-panel"
          role="tabpanel"
          aria-labelledby={profile === "establishment" ? "profile-tab-establishment" : "medecins"}
          className={styles.audiencePanel}
          initial={reduceMotion ? { opacity: 0 } : productScreenVariants.initial}
          animate={reduceMotion ? { opacity: 1 } : productScreenVariants.animate}
          exit={reduceMotion ? { opacity: 0 } : productScreenVariants.exit}
          transition={reduceMotion ? { duration: 0.2 } : productScreenTransition}
        >
          <div className={styles.audienceCopy}>
            <span className={styles.profileIcon}>{profile === "establishment" ? <Building2 aria-hidden="true" /> : <Stethoscope aria-hidden="true" />}</span>
            <h3>{active.title}</h3>
            <p>{active.text}</p>
            <ul>
              {active.points.map((point) => <li key={point}><Check aria-hidden="true" />{point}</li>)}
            </ul>
          </div>
          <ScreenMask>
            <ProductMockup
              description={active.screenAnnotation}
              points={active.points}
              stat={active.screenStat}
              title={active.tab}
              ui={screenUi}
              variant={profile}
            />
          </ScreenMask>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
