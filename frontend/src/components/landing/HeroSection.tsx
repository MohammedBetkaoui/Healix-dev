"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { editorialCopy } from "./editorial-copy";
import styles from "./editorial.module.css";

export function HeroSection({ locale }: { locale: "fr" | "ar" }) {
  const copy = editorialCopy[locale].hero;
  const reduced = useReducedMotion();
  const reveal = { hidden: { opacity: 0, y: reduced ? 0 : 18 }, visible: { opacity: 1, y: 0 } };

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.heroGrid}>
        <motion.div className={styles.heroCopy} initial={reduced ? false : "hidden"} animate="visible" transition={{ staggerChildren: reduced ? 0 : 0.09 }}>
          <motion.p className={styles.kicker} variants={reveal}>01 <span /> {copy.eyebrow}</motion.p>
          <motion.h1 id="hero-title" variants={reveal}>{copy.titleFirst}<br /><em>{copy.titleAccent}</em></motion.h1>
          <motion.p className={styles.heroLead} variants={reveal}>{copy.lead}</motion.p>
          <motion.div className={styles.heroActions} variants={reveal}>
            <Link className={styles.buttonPrimary} href="/register">{copy.primary}<ArrowUpRight aria-hidden="true" /></Link>
            <a className={styles.buttonSecondary} href="#product">{copy.secondary}<ArrowDown aria-hidden="true" /></a>
          </motion.div>
          <motion.p className={styles.heroAssurance} variants={reveal}>{copy.assurance}</motion.p>
        </motion.div>
        <div className={styles.heroVisual}>
          <div className={styles.heroVisualRule}><span>{copy.stageLabel}</span><span>HEALIXDZ / 01</span></div>
          <div className={styles.heroFrame}>
            <Image src="/landing/product-patients.png" alt={copy.imageAlt} width={1440} height={900} sizes="(max-width: 760px) 700px, (max-width: 1200px) 55vw, 760px" preload className={styles.heroImage} />
          </div>
          <p className={styles.imageCaption}>{copy.caption}</p>
        </div>
      </div>
    </section>
  );
}
