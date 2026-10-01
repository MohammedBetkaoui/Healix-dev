"use client";

import { useState } from "react";
import { CalendarDays, CheckCircle2, ChevronRight, FileText, Search, UserRound } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import styles from "./landing.module.css";
import type { LandingContent } from "./types";

type ShowcaseTab = LandingContent["showcase"]["tabs"][number];

export function ProductShowcase({ showcase }: { showcase: LandingContent["showcase"] }) {
  const [activeId, setActiveId] = useState<string>(showcase.tabs[0].id);
  const reduceMotion = useReducedMotion();
  const active = showcase.tabs.find((tab) => tab.id === activeId) ?? showcase.tabs[0];

  return (
    <section className={styles.showcaseSection} aria-labelledby="showcase-title">
      <div className={styles.showcaseIntro}>
        <h2 id="showcase-title">{showcase.title}</h2>
        <p>{showcase.text}</p>
      </div>
      <div className={styles.showcaseTabs} role="tablist" aria-label={showcase.title}>
        {showcase.tabs.map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={active.id === tab.id} onClick={() => setActiveId(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={active.id}
          className={styles.showcaseFrame}
          initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, y: reduceMotion ? 0 : 22 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, y: reduceMotion ? 0 : -12 }}
          transition={{ duration: reduceMotion ? 0.15 : 0.42 }}
        >
          <ShowcaseMockup tab={active} />
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

function ShowcaseMockup({ tab }: { tab: ShowcaseTab }) {
  return (
    <div className={styles.showcaseMockup}>
      <aside aria-hidden="true">
        <span>H</span><i /><i /><i /><i />
      </aside>
      <div className={styles.showcaseScreen}>
        <header><div><small>HealixDz / {tab.label}</small><strong>{tab.title}</strong></div><div><Search aria-hidden="true" /><span /></div><UserRound aria-hidden="true" /></header>
        <div className={styles.showcaseToolbar}><strong>{tab.stat}</strong><button type="button" tabIndex={-1}><CalendarDays aria-hidden="true" />•••</button></div>
        <div className={styles.showcaseTable}>
          {tab.rows.map((row, index) => (
            <div key={row}><span><CheckCircle2 aria-hidden="true" /></span><strong>{row}</strong><i style={{ inlineSize: `${44 + index * 15}%` }} /><FileText aria-hidden="true" /><ChevronRight aria-hidden="true" /></div>
          ))}
        </div>
      </div>
    </div>
  );
}
