"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, Pause, Play, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { premiumEase } from "./landing-motion";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

type HeroSectionProps = {
  hero: LandingContent["hero"];
};

export function HeroSection({ hero }: HeroSectionProps) {
  const reduceMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVideoAvailable, setIsVideoAvailable] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (reduceMotion !== false) {
      video.pause();
      return;
    }

    // A blocked autoplay leaves the poster and the manual play control available.
    void video.play().catch(() => {});
  }, [reduceMotion]);

  const toggleVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  };

  const reveal = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 18 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <video
        ref={videoRef}
        className={styles.heroVideo}
        poster="/landing/hero-video-poster.jpg"
        data-unavailable={!isVideoAvailable}
        muted
        loop
        playsInline
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => setIsVideoAvailable(false)}
        aria-hidden="true"
        tabIndex={-1}
      >
        <source
          src="/landing/49809-458438857.mp4"
          type="video/mp4"
          onError={() => setIsVideoAvailable(false)}
        />
      </video>
      <div className={styles.heroBackdrop} aria-hidden="true" />
      <div className={styles.heroInner}>
        <motion.div
          className={styles.heroCopy}
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
          transition={{ staggerChildren: reduceMotion ? 0 : 0.08, delayChildren: 0.08 }}
        >
          <motion.p className={styles.heroEyebrow} variants={reveal} transition={{ duration: 0.55, ease: premiumEase }}>
            <span aria-hidden="true" />
            {hero.eyebrow}
          </motion.p>
          <motion.h1 id="hero-title" variants={reveal} transition={{ duration: 0.72, ease: premiumEase }}>
            <span>{hero.titleLine1}</span>
            <span><em>{hero.titleAccent}</em>{hero.titleLine2 ? ` ${hero.titleLine2}` : ""}</span>
            <span>{hero.titleLine3}</span>
          </motion.h1>
          <motion.p className={styles.heroLead} variants={reveal} transition={{ duration: 0.62, ease: premiumEase }}>
            {hero.lead}
          </motion.p>
          <motion.div className={styles.heroCtas} variants={reveal} transition={{ duration: 0.62, ease: premiumEase }}>
            <Link href="/register" className={styles.primaryButton}>
              {hero.primaryCta}<ArrowUpRight aria-hidden="true" />
            </Link>
            <a href="#product" className={styles.secondaryButton}>
              {hero.secondaryCta}<ArrowDown aria-hidden="true" />
            </a>
          </motion.div>
          <motion.ul className={styles.heroProofs} variants={reveal} transition={{ duration: 0.62, ease: premiumEase }}>
            {hero.modules.map((item) => <li key={item}><Check aria-hidden="true" />{item}</li>)}
          </motion.ul>
          <motion.p className={styles.heroAccess} variants={reveal} transition={{ duration: 0.62, ease: premiumEase }}>
            <ShieldCheck aria-hidden="true" />{hero.verified}
          </motion.p>
        </motion.div>

        <div className={styles.heroBottom}>
          <a href="#plateforme" className={styles.heroScroll}>
            <span><ArrowDown aria-hidden="true" /></span>
            {hero.scrollLabel}
          </a>
          {isVideoAvailable ? (
            <button
              type="button"
              className={styles.heroVideoControl}
              onClick={toggleVideo}
              aria-label={isPlaying ? hero.pauseVideo : hero.playVideo}
              title={isPlaying ? hero.pauseVideo : hero.playVideo}
            >
              {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              <span>{hero.videoLabel}</span>
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
