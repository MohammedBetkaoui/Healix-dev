import { editorialCopy } from "./editorial-copy";
import styles from "./editorial.module.css";

export function TrustBar({ locale }: { locale: "fr" | "ar" }) {
  const copy = editorialCopy[locale].trust;
  return <section className={styles.trust} aria-label={copy.label}>
    <div className={styles.trustInner}>
      <p>{copy.label}</p>
      <ul>{copy.audiences.map((audience) => <li key={audience}>{audience}</li>)}</ul>
      <span>{copy.languages}</span>
    </div>
  </section>;
}
