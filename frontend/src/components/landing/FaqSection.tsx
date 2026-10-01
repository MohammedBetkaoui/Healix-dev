import { Plus } from "lucide-react";

import styles from "./landing.module.css";
import type { LandingContent } from "./types";

export function FaqSection({ faq }: { faq: LandingContent["faq"] }) {
  return (
    <section className={styles.faqSection} aria-labelledby="faq-title">
      <div className={styles.faqIntro}><p className={styles.eyebrow}>{faq.eyebrow}</p><h2 id="faq-title">{faq.title}</h2></div>
      <div className={styles.faqList}>
        {faq.items.map((item, index) => (
          <details key={item.question} open={index === 0}>
            <summary><span>{String(index + 1).padStart(2, "0")}</span>{item.question}<Plus aria-hidden="true" /></summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

