"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  Circle,
  FileCheck2,
  FileText,
  FlaskConical,
  RotateCcw,
  TestTubeDiagonal,
  UserRound,
} from "lucide-react";

import { SectionReveal } from "./SectionReveal";
import landingStyles from "./landing.module.css";
import styles from "./product-tour.module.css";
import type { LandingContent } from "./types";

const artifactIcons = {
  request: FileText,
  sample: TestTubeDiagonal,
  review: FlaskConical,
  report: FileCheck2,
};

export function ProductTour({ showcase }: { showcase: LandingContent["showcase"] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scenario = showcase.scenario;
  const active = scenario.steps[activeIndex] ?? scenario.steps[0];
  const isLastStep = activeIndex === scenario.steps.length - 1;
  const ArtifactIcon = artifactIcons[active.id];

  return (
    <section id="product" className={styles.productTour} aria-labelledby="product-tour-title">
      <SectionReveal className={styles.productTourIntro}>
        <div>
          <p className={landingStyles.eyebrow}>{showcase.eyebrow}</p>
          <h2 id="product-tour-title">{showcase.title}<em>{showcase.titleAccent}</em></h2>
        </div>
        <p>{showcase.text}</p>
      </SectionReveal>

      <SectionReveal className={styles.tourCase}>
        <div className={styles.tourCaseHeader}>
          <div><span>{scenario.label}</span><h3>{scenario.title}</h3></div>
          <p>{scenario.demoLabel}</p>
        </div>

        <div className={styles.tourSteps} role="group" aria-label={scenario.navigationLabel}>
          {scenario.steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              id={`product-step-${step.id}`}
              aria-pressed={activeIndex === index}
              aria-controls="product-scenario-panel"
              data-completed={index < activeIndex}
              onClick={() => setActiveIndex(index)}
            >
              <span>{index < activeIndex ? <Check aria-hidden="true" /> : String(index + 1).padStart(2, "0")}</span>
              <strong>{step.label}</strong>
              <small dir="ltr">{step.time}</small>
            </button>
          ))}
        </div>

        <div className={styles.tourContext}>
          <span><span>{scenario.requestLabel}</span><strong dir="ltr">LAB-0248</strong></span>
          <span><span>{scenario.patientLabel}</span><strong dir="ltr">PT-0248</strong></span>
          <span className={styles.tourContextNote}><CheckCheck aria-hidden="true" />{scenario.contextNote}</span>
        </div>

        <div
          id="product-scenario-panel"
          className={styles.tourScene}
          role="region"
          aria-labelledby={`product-step-${active.id}`}
          aria-live="polite"
          aria-atomic="true"
          data-case-step={active.id}
        >
          <div className={styles.tourNarrative}>
            <span className={styles.tourSceneIndex}>{scenario.stepLabel} {String(activeIndex + 1).padStart(2, "0")} / {String(scenario.steps.length).padStart(2, "0")}</span>
            <div key={active.id} className={styles.tourNarrativeContent}>
              <h4>{active.title}</h4>
              <p>{active.description}</p>
              <div className={styles.tourActor}>
                <UserRound aria-hidden="true" />
                <div><span>{scenario.actorLabel}</span><strong>{active.actor}</strong></div>
              </div>
            </div>
            <div className={styles.tourHandoff}><span>{scenario.handoffLabel}</span><p>{active.handoff}</p></div>
          </div>

          <div className={styles.tourEvidence}>
            <div key={active.id} className={styles.tourArtifact} data-artifact={active.id}>
              <div className={styles.tourArtifactHeader}>
                <span><ArtifactIcon aria-hidden="true" />{active.artifactLabel}</span>
                <span className={styles.tourArtifactStatus}>{active.status}</span>
              </div>
              <h5>{active.artifactTitle}</h5>

              {active.id === "sample" ? (
                <div className={styles.tourSpecimen}>
                  <span className={styles.tourSpecimenIcon}><TestTubeDiagonal aria-hidden="true" /></span>
                  <div><span>{scenario.sampleLabel}</span><strong dir="ltr">PR-0248</strong><small>{scenario.sampleRelation} <bdi>LAB-0248</bdi></small></div>
                </div>
              ) : active.id === "report" ? (
                <div className={styles.tourReportSeal}>
                  <FileCheck2 aria-hidden="true" />
                  <div><strong>{scenario.reportReady}</strong><span>{scenario.reportNote}</span></div>
                </div>
              ) : null}

              <dl className={active.id === "review" ? styles.tourReviewChecks : styles.tourArtifactFields}>
                {active.fields.map((field, index) => (
                  <div key={field.label}>
                    <dt>
                      {active.id === "review" ? <span className={styles.tourReviewIcon}>{index === active.fields.length - 1 ? <Circle aria-hidden="true" /> : <Check aria-hidden="true" />}</span> : null}
                      {field.label}
                    </dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
              <div className={styles.tourArtifactTrace}><span aria-hidden="true" /><span>{active.trace}</span><time dir="ltr">{active.time}</time></div>
            </div>
          </div>
        </div>

        <div className={styles.tourCaseFooter}>
          <a href="#etablissements" className={styles.tourCaseCta}>{scenario.cta}<ArrowUpRight aria-hidden="true" /></a>
          <div className={styles.tourControls}>
            <button type="button" onClick={() => setActiveIndex((index) => Math.max(0, index - 1))} disabled={activeIndex === 0} aria-label={scenario.previous} className={styles.tourPrevious}>
              <ArrowLeft aria-hidden="true" /><span>{scenario.previous}</span>
            </button>
            <button type="button" onClick={() => setActiveIndex((index) => (index + 1) % scenario.steps.length)} className={styles.tourNext}>
              {isLastStep ? scenario.restart : scenario.next}
              {isLastStep ? <RotateCcw className={styles.tourReplayIcon} aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
            </button>
          </div>
        </div>
      </SectionReveal>
    </section>
  );
}
