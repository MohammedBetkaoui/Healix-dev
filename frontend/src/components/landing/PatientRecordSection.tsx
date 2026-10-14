"use client";

import { useRef } from "react";
import { CalendarDays, CheckCircle2, ClipboardList, FileText, FlaskConical, HeartPulse, History, ShieldCheck, Stethoscope, UserRound } from "lucide-react";
import {
  motion,
  useMotionTemplate,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";

import { TextReveal, smoothSpring, useIsMobile } from "./landing-motion";
import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const recordIcons = [HeartPulse, History, ShieldCheck, Stethoscope, FileText, FlaskConical, ClipboardList, UserRound];

function RecordAnnotation({
  icon: Icon,
  text,
  progress,
  index,
  total,
}: {
  icon: typeof HeartPulse;
  text: string;
  progress: MotionValue<number>;
  index: number;
  total: number;
}) {
  const start = 0.3 + (index / total) * 0.45;
  const opacity = useTransform(progress, [start, start + 0.1], [0, 1]);
  const offset = index % 2 === 0 ? -12 : 12;
  const x = useTransform(progress, [start, start + 0.12], [offset, 0]);
  return (
    <motion.span style={{ opacity, x }}>
      <Icon aria-hidden="true" />
      {text}
    </motion.span>
  );
}

export function PatientRecordSection({ record }: { record: LandingContent["patientRecord"] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const isMobile = useIsMobile();
  const calm = reduceMotion || isMobile;

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start end", "end start"] });
  const progress = useSpring(scrollYProgress, smoothSpring);

  /* Depth choreography bound to scroll: enter, settle, then gently recede. */
  const mockY = useTransform(progress, [0, 0.5, 1], [50, 0, -20]);
  const mockScale = useTransform(progress, [0, 0.5, 1], [0.96, 1, 0.985]);
  const mockOpacity = useTransform(progress, [0, 0.22, 0.5], [0, 1, 1]);
  const maskInset = useTransform(progress, [0, 0.4], [10, 0]);
  const maskSide = useTransform(progress, [0, 0.4], [8, 0]);
  const clipPath = useMotionTemplate`inset(${maskInset}% ${maskSide}% ${maskInset}% ${maskSide}% round 10px)`;

  /* Major section transition: light audience → deep clinical green. */
  const backgroundColor = useTransform(progress, [0, 0.22], ["#ffffff", "#102f2b"]);

  return (
    <motion.section
      ref={sectionRef}
      className={styles.recordSection}
      aria-labelledby="record-title"
      style={calm ? undefined : { backgroundColor }}
    >
      <SectionReveal className={styles.recordIntro}>
        <p className={styles.darkEyebrow}>{record.label}</p>
        <TextReveal text={record.title} id="record-title" />
        <p>{record.text}</p>
        <div className={styles.recordAnnotations}>
          {calm
            ? record.annotations.map((annotation, index) => {
                const Icon = recordIcons[index];
                return (
                  <span key={annotation}>
                    <Icon aria-hidden="true" />
                    {annotation}
                  </span>
                );
              })
            : record.annotations.map((annotation, index) => {
                const Icon = recordIcons[index];
                return (
                  <RecordAnnotation
                    key={annotation}
                    icon={Icon ?? HeartPulse}
                    text={annotation}
                    progress={progress}
                    index={index}
                    total={record.annotations.length}
                  />
                );
              })}
        </div>
      </SectionReveal>
      <SectionReveal className={styles.recordMockup} delay={0.1}>
        {calm ? (
          <RecordMockup record={record} />
        ) : (
          <motion.div style={{ y: mockY, scale: mockScale, opacity: mockOpacity, clipPath }}>
            <RecordMockup record={record} />
          </motion.div>
        )}
      </SectionReveal>
    </motion.section>
  );
}

function RecordMockup({ record }: { record: LandingContent["patientRecord"] }) {
  return (
    <>
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
    </>
  );
}
