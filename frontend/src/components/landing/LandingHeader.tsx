"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";

import { HealixLogo } from "@/components/shared/HealixLogo";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import type { Locale } from "@/i18n";

import styles from "./landing.module.css";
import type { LandingContent } from "./types";

type LandingHeaderProps = {
  locale: Locale;
  nav: LandingContent["nav"];
};

const navLinks = [
  ["platform", "#plateforme"],
  ["establishments", "#etablissements"],
  ["doctors", "#medecins"],
  ["trust", "#confiance"],
  ["ai", "#healix-ai"],
  ["plans", "#offres"],
] as const;

export function LandingHeader({ locale, nav }: LandingHeaderProps) {
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const updateScrolled = () => setIsScrolled(window.scrollY > 24);
    updateScrolled();
    window.addEventListener("scroll", updateScrolled, { passive: true });
    return () => window.removeEventListener("scroll", updateScrolled);
  }, []);

  useEffect(() => {
    const closeOnWideScreen = () => {
      if (window.innerWidth >= 1080) setIsOpen(false);
    };
    window.addEventListener("resize", closeOnWideScreen);
    return () => window.removeEventListener("resize", closeOnWideScreen);
  }, []);

  const switchLocale = (nextLocale: Locale) => {
    window.localStorage.setItem("healixdz.locale", nextLocale);
    const url = new URL(window.location.href);
    if (nextLocale === "fr") url.searchParams.delete("lang");
    else url.searchParams.set("lang", nextLocale);
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
    setIsOpen(false);
  };

  const languageT = (key: string) => {
    if (key.endsWith(".label")) {
      return locale === "ar" ? "تغيير اللغة" : "Changer la langue";
    }
    if (key.endsWith(".fr")) return "FR";
    if (key.endsWith(".ar")) return "العربية";
    return key;
  };

  return (
    <header
      className={`${styles.header} ${isScrolled ? styles.headerScrolled : ""}`}
      data-open={isOpen}
    >
      <div className={styles.headerInner}>
        <Link href={locale === "ar" ? "/?lang=ar" : "/"} className={styles.logoLink} aria-label="HealixDz">
          <HealixLogo priority className={styles.logo} />
        </Link>

        <nav className={styles.desktopNav} aria-label={locale === "ar" ? "التنقل الرئيسي" : "Navigation principale"}>
          {navLinks.map(([key, href]) => (
            <a key={key} href={href}>
              {nav[key]}
            </a>
          ))}
        </nav>

        <div className={styles.headerActions}>
          <div className={styles.desktopLanguage}>
            <LanguageSwitcher
              locale={locale}
              onLocaleChange={switchLocale}
              t={languageT}
              variant="compact"
            />
          </div>
          <Link href="/login" className={styles.loginLink}>
            {nav.login}
          </Link>
          <Link href="/register" className={styles.headerCta}>
            {nav.register}
          </Link>
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={isOpen}
            aria-controls="landing-mobile-menu"
            aria-label={isOpen ? nav.close : nav.menu}
            onClick={() => setIsOpen((current) => !current)}
          >
            {isOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div id="landing-mobile-menu" className={styles.mobileMenu}>
        <nav aria-label={locale === "ar" ? "التنقل على الهاتف" : "Navigation mobile"}>
          {navLinks.map(([key, href]) => (
            <a key={key} href={href} onClick={() => setIsOpen(false)}>
              {nav[key]}
            </a>
          ))}
        </nav>
        <LanguageSwitcher
          locale={locale}
          onLocaleChange={switchLocale}
          t={languageT}
          variant="compact"
        />
        <div className={styles.mobileActions}>
          <Link href="/login">{nav.login}</Link>
          <Link href="/register">{nav.register}</Link>
        </div>
      </div>
    </header>
  );
}

