"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import {
  doctorSubscriptionPlans,
  establishmentSubscriptionPlans,
} from "@/config/subscription-plans";
import type { Locale } from "@/i18n";
import { useTranslation } from "@/lib/i18n";

import { productScreenTransition, productScreenVariants } from "./landing-motion";
import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

type AccountTab = "doctor" | "establishment";

export function PlansSection({ locale, plans }: { locale: Locale; plans: LandingContent["plans"] }) {
  const [accountTab, setAccountTab] = useState<AccountTab>("doctor");
  const reduceMotion = useReducedMotion();
  const { t } = useTranslation(locale);
  const activePlans = accountTab === "doctor" ? doctorSubscriptionPlans : establishmentSubscriptionPlans;

  return (
    <section id="offres" className={styles.plansSection} aria-labelledby="plans-title">
      <SectionReveal className={styles.plansIntro}>
        <p className={styles.eyebrow}>{plans.eyebrow}</p>
        <h2 id="plans-title">{plans.title}</h2>
        <p>{plans.text}</p>
      </SectionReveal>
      <div className={styles.planTabs} role="tablist" aria-label={plans.title}>
        <button type="button" role="tab" aria-selected={accountTab === "doctor"} onClick={() => setAccountTab("doctor")}>{plans.doctorTab}</button>
        <button type="button" role="tab" aria-selected={accountTab === "establishment"} onClick={() => setAccountTab("establishment")}>{plans.establishmentTab}</button>
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={accountTab}
          className={styles.planGrid}
          initial={reduceMotion ? { opacity: 0 } : productScreenVariants.initial}
          animate={reduceMotion ? { opacity: 1 } : productScreenVariants.animate}
          exit={reduceMotion ? { opacity: 0 } : productScreenVariants.exit}
          transition={reduceMotion ? { duration: 0.2 } : productScreenTransition}
        >
          {activePlans.map((plan) => (
            <article key={plan.id} className={plan.recommended ? styles.planRecommended : undefined}>
              {plan.recommended ? <span className={styles.planBadge}>{t(plan.badge ?? "")}</span> : null}
              <h3>{t(plan.name)}</h3>
              <p className={styles.planDescription}>{t(plan.description)}</p>
              <div className={styles.planPrice}>
                {plan.monthlyPrice === null ? <strong>{plans.custom}</strong> : <><strong>{new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ").format(plan.monthlyPrice)}</strong><span>{plan.currency}<br />{plans.monthly}</span></>}
              </div>
              <ul>
                {plan.features.slice(0, 5).map((feature) => <li key={feature}><Check aria-hidden="true" />{t(feature)}</li>)}
              </ul>
              <Link href="/register">{plans.details}<ArrowUpRight aria-hidden="true" /></Link>
            </article>
          ))}
        </motion.div>
      </AnimatePresence>
      <p className={styles.planNote}>{plans.planNote}</p>
    </section>
  );
}

