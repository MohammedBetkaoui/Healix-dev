"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, BadgeCheck, CalendarDays, Users } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

import { HealixPulse } from "./HealixPulse";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

export function HeroSection({ hero }: { hero: LandingContent["hero"] }) {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const imageY = useTransform(scrollY, [0, 700], [0, reduceMotion ? 0 : 42]);
  const copyY = useTransform(scrollY, [0, 600], [0, reduceMotion ? 0 : 24]);

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.heroBackdrop} aria-hidden="true" />
      <HealixPulse className={styles.heroPulse} />
      <div className={styles.heroGrid}>
        <motion.div className={styles.heroCopy} style={{ y: copyY }}>
          <p className={styles.eyebrow}>{hero.eyebrow}</p>
          <h1 id="hero-title">
            {hero.titleStart} <em>{hero.titleAccent}</em> {hero.titleEnd}
          </h1>
          <p className={styles.heroLead}>{hero.lead}</p>
          <p className={styles.heroDetail}>{hero.detail}</p>
          <div className={styles.heroCtas}>
            <a href="#plateforme" className={styles.primaryButton}>
              {hero.primaryCta}
              <ArrowDown aria-hidden="true" />
            </a>
            <Link href="/register" className={styles.secondaryButton}>
              {hero.secondaryCta}
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>
          <p className={styles.heroMicrocopy}>{hero.microcopy}</p>
        </motion.div>

        <motion.div className={styles.heroVisual} style={{ y: imageY }}>
          <div className={styles.heroImageFrame}>
            <Image
              src="/landing/consultation-healixdz.png"
              alt={hero.imageAlt}
              fill
              priority
              sizes="(max-width: 900px) 100vw, 50vw"
              className={styles.heroImage}
            />
            <div className={styles.heroImageShade} />
            <div className={styles.heroImageCaption}>{hero.clinicalWorkspace}</div>
          </div>

          <div className={`${styles.interfaceCard} ${styles.interfaceCardTop}`}>
            <span className={styles.interfaceIcon}><CalendarDays aria-hidden="true" /></span>
            <span><small>{hero.today}</small>{hero.appointments}</span>
            <i />
          </div>
          <div className={`${styles.interfaceCard} ${styles.interfaceCardBottom}`}>
            <span className={styles.interfaceIcon}><Users aria-hidden="true" /></span>
            <span><small>{hero.patients}</small>{hero.team}</span>
            <BadgeCheck aria-label={hero.verified} />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

