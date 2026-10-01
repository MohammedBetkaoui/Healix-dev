import { Building2, Check, FileBadge2, Info, Stethoscope } from "lucide-react";

import styles from "./landing.module.css";
import type { LandingContent } from "./types";

export function VerificationSection({ verification }: { verification: LandingContent["verification"] }) {
  return (
    <section id="confiance" className={styles.verificationSection} aria-labelledby="verification-title">
      <div className={styles.verificationIntro}>
        <p className={styles.eyebrow}>{verification.eyebrow}</p>
        <h2 id="verification-title">{verification.title}</h2>
        <p>{verification.text}</p>
      </div>
      <div className={styles.verificationColumns}>
        <article>
          <header><span><Building2 aria-hidden="true" /></span><h3>{verification.establishmentTitle}</h3><FileBadge2 aria-hidden="true" /></header>
          <ol>
            {verification.establishmentSteps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}<Check aria-hidden="true" /></li>)}
          </ol>
        </article>
        <article>
          <header><span><Stethoscope aria-hidden="true" /></span><h3>{verification.doctorTitle}</h3><FileBadge2 aria-hidden="true" /></header>
          <ol>
            {verification.doctorSteps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}<Check aria-hidden="true" /></li>)}
          </ol>
        </article>
      </div>
      <p className={styles.legalNote}><Info aria-hidden="true" />{verification.note}</p>
    </section>
  );
}

