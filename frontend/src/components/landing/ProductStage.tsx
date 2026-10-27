"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { editorialCopy } from "./editorial-copy";
import styles from "./editorial.module.css";

const screens = ["patients", "appointments", "ai-analyses"] as const;

export function ProductStage({ locale }: { locale: "fr" | "ar" }) {
  const copy = editorialCopy[locale].product;
  const [selected, setSelected] = useState<(typeof screens)[number]>("patients");
  const reduced = useReducedMotion();
  const active = copy.screens[selected];

  return <section id="product" className={styles.product} aria-labelledby="product-title">
    <div className={styles.container}>
      <div className={styles.sectionHeader}>
        <div><p className={styles.kicker}>02 <span /> {copy.eyebrow}</p><h2 id="product-title">{copy.title}</h2></div>
        <p>{copy.intro}</p>
      </div>
      <div className={styles.productLayout}>
        <div className={styles.productSelectors} role="group" aria-label={copy.selectLabel}>
          {screens.map((key, index) => <button type="button" key={key} onClick={() => setSelected(key)} aria-pressed={selected === key} aria-controls="product-preview" className={styles.productSelector}>
            <span>{String(index + 1).padStart(2, "0")}</span><strong>{copy.screens[key].label}</strong><small>{copy.screens[key].summary}</small>
          </button>)}
          <p>{copy.note}</p>
        </div>
        <div id="product-preview" className={styles.productPreview} aria-live="polite">
          <div className={styles.productPreviewTop}><strong>HealixDz / {active.label}</strong><span>{copy.previewLabel}</span></div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={selected} initial={{ opacity: 0, y: reduced ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.25 }} className={styles.productImageWrap}>
              <Image src={`/landing/product-${selected}.png`} alt={active.alt} width={1440} height={900} sizes="(max-width: 760px) 760px, (max-width: 1200px) 60vw, 820px" className={styles.productImage} />
            </motion.div>
          </AnimatePresence>
          <p>{copy.caption}</p>
        </div>
      </div>
    </div>
  </section>;
}
