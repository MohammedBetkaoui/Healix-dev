import Link from "next/link";

import { HealixLogo } from "@/components/shared/HealixLogo";

import styles from "./landing.module.css";
import type { LandingContent } from "./types";

export function LandingFooter({ footer }: { footer: LandingContent["footer"] }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerTop}>
        <div className={styles.footerBrand}><HealixLogo className={styles.footerLogo} /><p>{footer.description}</p></div>
        <div><h2>{footer.platform}</h2><a href="#plateforme">{footer.ecosystem}</a><a href="#etablissements">{footer.establishments}</a><a href="#medecins">{footer.doctors}</a><a href="#healix-ai">{footer.ai}</a></div>
        <div><h2>{footer.access}</h2><Link href="/register">{footer.register}</Link><Link href="/login">{footer.login}</Link></div>
        <div><h2>{footer.trust}</h2><a href="#confiance">{footer.verification}</a><a href="#confiance">{footer.privacy}</a><a href="#confiance">{footer.security}</a></div>
        <div><h2>{footer.legal}</h2><span title={footer.legalPending}>{footer.terms}</span><span title={footer.legalPending}>{footer.policy}</span></div>
      </div>
      <div className={styles.footerBottom}><span>© {new Date().getFullYear()} {footer.rights}</span><span>FR · العربية</span></div>
    </footer>
  );
}

