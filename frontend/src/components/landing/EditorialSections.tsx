import Image from "next/image";

import { AlgeriaMap } from "./AlgeriaMap";
import { SectionReveal } from "./SectionReveal";
import { editorialCopy } from "./editorial-copy";
import styles from "./editorial.module.css";

type Props = { locale: "fr" | "ar" };

export function ClinicalJourney({ locale }: Props) {
  const copy = editorialCopy[locale].journey;
  return <section id="plateforme" className={styles.journey} aria-labelledby="journey-title">
    <div className={styles.container}>
      <SectionReveal className={styles.sectionHeader}>
        <div><p className={styles.kicker}>03 <span /> {copy.eyebrow}</p><h2 id="journey-title">{copy.title}</h2></div>
        <p>{copy.intro}</p>
      </SectionReveal>
      <ol className={styles.journeySteps}>{copy.steps.map(([label, description], index) => <li key={label}>
        <span>{String(index + 1).padStart(2, "0")}</span><h3>{label}</h3><p>{description}</p>
      </li>)}</ol>
    </div>
  </section>;
}

export function AudienceSplit({ locale }: Props) {
  const copy = editorialCopy[locale].audience;
  return <section id="etablissements" className={styles.audience} aria-labelledby="audience-title">
    <div className={styles.container}>
      <p className={styles.kicker}>04 <span /> {copy.eyebrow}</p><h2 id="audience-title">{copy.title}</h2>
      <div className={styles.audienceGrid}>
        {(["establishment", "doctor"] as const).map((key, index) => {
          const profile = copy[key];
          return <article key={key} id={key === "doctor" ? "medecins" : undefined} className={styles.audiencePanel}>
            <div className={styles.audienceCopy}><p className={styles.kicker}>{String(index + 1).padStart(2, "0")} / {profile.label}</p><h3>{profile.title}</h3><p>{profile.text}</p><small>{profile.details}</small></div>
            <div className={styles.audienceImage}><Image src={`/landing/product-${key === "doctor" ? "doctor" : "overview"}.png`} alt={profile.alt} width={1440} height={900} sizes="(max-width: 760px) 700px, 50vw" /></div>
          </article>;
        })}
      </div>
      <p className={styles.audienceCaption}>{copy.caption}</p>
    </div>
  </section>;
}

export function HealixAiStory({ locale }: Props) {
  const copy = editorialCopy[locale].ai;
  return <section id="healix-ai" className={styles.ai} aria-labelledby="ai-story-title">
    <div className={styles.container}>
      <SectionReveal className={styles.aiIntro}><p className={styles.kicker}>05 <span /> {copy.eyebrow}</p><h2 id="ai-story-title">{copy.title}</h2><p>{copy.intro}</p></SectionReveal>
      <ol className={styles.aiFlow}>{copy.stages.map((stage, index) => <li key={stage}><span>{String(index + 1).padStart(2, "0")}</span><strong>{stage}</strong></li>)}</ol>
      <div className={styles.aiFoot}><p>{copy.pipelines}</p><strong>{copy.caution}</strong></div>
    </div>
  </section>;
}

export function TrustArchitecture({ locale }: Props) {
  const copy = editorialCopy[locale].security;
  return <section id="securite" className={styles.security} aria-labelledby="trust-title"><div className={styles.container}>
    <SectionReveal className={styles.sectionHeader}><div><p className={styles.kicker}>06 <span /> {copy.eyebrow}</p><h2 id="trust-title">{copy.title}</h2></div><p>{copy.intro}</p></SectionReveal>
    <div className={styles.securityList}>{copy.principles.map(([title, description], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
    <p className={styles.securityNote}>{copy.note}</p>
  </div></section>;
}

export function AlgeriaContext({ locale }: Props) {
  const copy = editorialCopy[locale].algeria;
  return <section className={styles.algeria} aria-labelledby="algeria-context-title"><div className={styles.container}>
    <div className={styles.algeriaGrid}>
      <SectionReveal><p className={styles.kicker}>07 <span /> {copy.eyebrow}</p><h2 id="algeria-context-title">{copy.title}</h2><p className={styles.algeriaLead}>{copy.intro}</p><ul>{copy.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul><small>{copy.note}</small></SectionReveal>
      <div className={styles.mapPanel}><AlgeriaMap label={locale === "fr" ? "Carte stylisée de l’Algérie" : "خريطة توضيحية للجزائر"} /><span>HEALIXDZ / DZ</span></div>
    </div>
  </div></section>;
}
