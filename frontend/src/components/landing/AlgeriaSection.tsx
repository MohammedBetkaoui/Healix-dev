import { Building2, Languages, MapPinned, Stethoscope } from "lucide-react";

import styles from "./landing.module.css";
import type { LandingContent } from "./types";

export function AlgeriaSection({ algeria }: { algeria: LandingContent["algeria"] }) {
  return (
    <section className={styles.algeriaSection} aria-labelledby="algeria-title">
      <div className={styles.algeriaVisual} aria-hidden="true">
        <svg viewBox="0 0 420 390" role="img">
          <path d="M159 24l71 7 28 33 53 25 18 39-18 43 20 43-31 31-5 51-54 27-21 45-40-20-48-5-22-35-49-27 18-56-17-41 26-35-7-48 42-31z" />
        </svg>
        <span className={styles.mapDot} data-dot="1" />
        <span className={styles.mapDot} data-dot="2" />
        <span className={styles.mapDot} data-dot="3" />
        <strong><MapPinned aria-hidden="true" />{algeria.wilayas}</strong>
      </div>
      <div className={styles.algeriaCopy}>
        <p className={styles.eyebrow}>{algeria.eyebrow}</p>
        <h2 id="algeria-title">{algeria.title}</h2>
        <p>{algeria.text}</p>
        <div className={styles.algeriaFacts}>
          <div><Languages aria-hidden="true" />{algeria.languages.map((language) => <span key={language}>{language}</span>)}</div>
          <div><Building2 aria-hidden="true" /><span>{algeria.profiles[0]}</span><Stethoscope aria-hidden="true" /><span>{algeria.profiles[1]}</span></div>
        </div>
        <small>{algeria.caption}</small>
      </div>
    </section>
  );
}

