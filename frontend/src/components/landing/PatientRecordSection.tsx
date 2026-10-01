import { CalendarDays, CheckCircle2, ClipboardList, FileText, HeartPulse, History, ShieldCheck, UserRound } from "lucide-react";

import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const recordIcons = [UserRound, HeartPulse, ClipboardList, FileText, ShieldCheck, History];

export function PatientRecordSection({ record }: { record: LandingContent["patientRecord"] }) {
  return (
    <section className={styles.recordSection} aria-labelledby="record-title">
      <div className={styles.recordIntro}>
        <p className={styles.darkEyebrow}>{record.label}</p>
        <h2 id="record-title">{record.title}</h2>
        <p>{record.text}</p>
        <div className={styles.recordAnnotations}>
          {record.annotations.map((annotation, index) => {
            const Icon = recordIcons[index];
            return <span key={annotation}><Icon aria-hidden="true" />{annotation}</span>;
          })}
        </div>
      </div>
      <div className={styles.recordMockup}>
        <div className={styles.recordTopbar}>
          <div className={styles.recordIdentity}><span><UserRound aria-hidden="true" /></span><div><small>HealixDz</small><strong>{record.patientName}</strong></div></div>
          <span className={styles.recordStatus}><CheckCircle2 aria-hidden="true" />{record.status}</span>
        </div>
        <div className={styles.recordStats}>
          <article><ClipboardList aria-hidden="true" /><small>{record.latestConsultation}</small><strong>—</strong></article>
          <article><CalendarDays aria-hidden="true" /><small>{record.appointmentLabel}</small><strong>—</strong></article>
          <article><ShieldCheck aria-hidden="true" /><small>{record.consentLabel}</small><strong>✓</strong></article>
        </div>
        <div className={styles.recordBody}>
          <article>
            <h3>{record.medicalSummary}</h3>
            <div className={styles.recordLines}><i /><i /><i /><i /></div>
          </article>
          <article>
            <h3>{record.timeline}</h3>
            <div className={styles.timelineRows}><span /><span /><span /></div>
          </article>
        </div>
      </div>
    </section>
  );
}

