import { ArrowDownUp, Braces, Database, Network } from "lucide-react";

import { SectionReveal } from "./SectionReveal";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

export function InteroperabilitySection({
  interoperability,
}: {
  interoperability: LandingContent["interoperability"];
}) {
  const icons = [Network, Braces, Database, ArrowDownUp];

  return (
    <section className={styles.interopSection} aria-labelledby="interop-title">
      <SectionReveal className={styles.interopCopy}>
        <p className={styles.eyebrow}>{interoperability.eyebrow}</p>
        <h2 id="interop-title">{interoperability.title}</h2>
        <p>{interoperability.text}</p>
        <small>{interoperability.note}</small>
      </SectionReveal>
      <SectionReveal className={styles.interopDiagram} delay={0.08}>
        {interoperability.flow.map((step, index) => {
          const Icon = icons[index] ?? Network;
          return (
            <div key={step} className={styles.interopNode}>
              <span><Icon aria-hidden="true" /></span>
              <strong>{step}</strong>
              {index < interoperability.flow.length - 1 ? <i aria-hidden="true">↕</i> : null}
            </div>
          );
        })}
      </SectionReveal>
    </section>
  );
}
