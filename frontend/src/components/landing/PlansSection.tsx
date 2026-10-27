"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { doctorSubscriptionPlans, establishmentSubscriptionPlans } from "@/config/subscription-plans";
import type { Locale } from "@/i18n";
import { useTranslation } from "@/lib/i18n";
import type { SubscriptionPlan } from "@/types/subscription";

import styles from "./editorial.module.css";
import type { LandingContent } from "./types";

function PlanRows({ plans, locale, cta, custom, monthly, annual }: { plans: SubscriptionPlan[]; locale: Locale; cta: string; custom: string; monthly: string; annual: string }) {
  const { t } = useTranslation(locale);
  const format = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ");
  return <div className={styles.planRows}>{plans.map((plan) => <article key={plan.id} className={styles.planRow}>
    <div><h3>{t(plan.name)}</h3><p>{t(plan.description)}</p></div>
    <div className={styles.planAmount}>{plan.monthlyPrice === null ? <strong>{custom}</strong> : <><strong>{format.format(plan.monthlyPrice)} <small>DZD / {monthly}</small></strong><span>{annual}: {format.format(plan.annualPrice ?? 0)} DZD</span></>}</div>
    <Link href="/register">{cta}<ArrowUpRight aria-hidden="true" /></Link>
  </article>)}</div>;
}

export function PlansSection({ locale, plans }: { locale: Locale; plans: LandingContent["plans"] }) {
  const annual = locale === "ar" ? "سنوياً" : "Par an";
  return <section id="offres" className={styles.plans} aria-labelledby="plans-title"><div className={styles.container}>
    <div className={styles.sectionHeader}><div><p className={styles.kicker}>08 <span /> {plans.eyebrow.replace(/^\d+\s*\/\s*/, "")}</p><h2 id="plans-title">{plans.title}</h2></div><p>{plans.text}</p></div>
    <div className={styles.planGroups}>
      <div><h3>{plans.doctorTab}</h3><PlanRows plans={doctorSubscriptionPlans} locale={locale} cta={plans.details} custom={plans.custom} monthly={plans.monthly} annual={annual} /></div>
      <div><h3>{plans.establishmentTab}</h3><PlanRows plans={establishmentSubscriptionPlans} locale={locale} cta={plans.details} custom={plans.custom} monthly={plans.monthly} annual={annual} /></div>
    </div>
    <p className={styles.plansNote}>{plans.planNote}</p>
  </div></section>;
}
