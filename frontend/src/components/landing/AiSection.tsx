import { ArrowDown, BrainCircuit, FileText, ListChecks, UserCheck } from "lucide-react";

import { HealixPulse } from "./HealixPulse";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

const aiIcons = [FileText, BrainCircuit, ListChecks, UserCheck];

export function AiSection({ ai }: { ai: LandingContent["ai"] }) {
  return (
    <section id="healix-ai" className={styles.aiSection} aria-labelledby="ai-title">
      <HealixPulse tone="ai" className={styles.aiPulse} />
      <div className={styles.aiCopy}>
        <p className={styles.aiEyebrow}>{ai.eyebrow}</p>
        <span className={styles.roadmapLabel}>{ai.label}</span>
        <h2 id="ai-title">{ai.title}</h2>
        <p>{ai.text}</p>
        <strong>{ai.caution}</strong>
      </div>
      <div className={styles.aiFlow}>
        {ai.flow.map((step, index) => {
          const Icon = aiIcons[index];
          return (
            <div key={step} className={styles.aiFlowStep}>
              <span><Icon aria-hidden="true" /></span>
              <div><small>{String(index + 1).padStart(2, "0")}</small><strong>{step}</strong></div>
              {index < ai.flow.length - 1 ? <ArrowDown className={styles.aiArrow} aria-hidden="true" /> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

