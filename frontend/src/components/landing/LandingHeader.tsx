"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import {
  motion,
  useMotionTemplate,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";

import { HEALIX_LOGO_FULL_SRC } from "@/components/shared/HealixLogo";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import type { Locale } from "@/i18n";

import { useIsMobile, useScrollDirection } from "./landing-motion";
import styles from "./landing.module.css";
import type { LandingContent } from "./types";

type LandingHeaderProps = {
  locale: Locale;
  nav: LandingContent["nav"];
};

const navLinks = [
  ["platform", "#plateforme"],
  ["solutions", "#etablissements"],
  ["ai", "#healix-ai"],
  ["security", "#securite"],
  ["plans", "#offres"],
] as const;

const OPEN_BACKGROUND = "rgb(247 244 237 / 96%)";
const OPEN_BORDER = "rgb(16 47 43 / 12%)";

export function LandingHeader({ locale, nav }: LandingHeaderProps) {
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const direction = useScrollDirection();
  const { scrollY } = useScroll();

  /* Binary state kept only for the shadow; visuals are scroll-driven. */
  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled((current) => {
      const next = latest > 24;
      return current === next ? current : next;
    });
    /* Scrolling down dismisses the open mobile menu. */
    if (latest > 140 && direction === "down") setIsOpen((open) => (open ? false : open));
  });

  useEffect(() => {
    const closeOnWideScreen = () => {
      if (window.innerWidth >= 1080) setIsOpen(false);
    };
    window.addEventListener("resize", closeOnWideScreen);
    return () => window.removeEventListener("resize", closeOnWideScreen);
  }, []);

  /* Progressive header: 88px → 72px handled by CSS class (240 ms ease);
     background / border / blur interpolate continuously with scroll. */
  const calm = reduceMotion || isMobile;
  const range: [number, number] = [0, 120];
  const backgroundAlpha = useTransform(scrollY, range, [0, calm ? 0.92 : 0.92]);
  const backgroundColor = useMotionTemplate`rgb(245 241 232 / ${backgroundAlpha})`;
  const borderAlpha = useTransform(scrollY, [8, 120], [0, 0.12]);
  const borderBottomColor = useMotionTemplate`rgb(16 47 43 / ${borderAlpha})`;
  const blur = useTransform(scrollY, range, [0, 6]);
  const backdropFilter = useMotionTemplate`blur(${blur}px)`;

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
      return nav.languageLabel;
    }
    if (key.endsWith(".fr")) return "FR";
    if (key.endsWith(".ar")) return "العربية";
    return key;
  };

  return (
    <motion.header
      className={`${styles.header} ${isScrolled ? styles.headerScrolled : ""}`}
      data-open={isOpen}
      style={
        reduceMotion
          ? undefined
          : {
              backgroundColor: isOpen ? OPEN_BACKGROUND : backgroundColor,
              borderBottomColor: isOpen ? OPEN_BORDER : borderBottomColor,
              backdropFilter: isOpen ? "blur(6px)" : backdropFilter,
            }
      }
    >
      <div className={styles.headerInner}>
        <Link href={locale === "ar" ? "/?lang=ar" : "/"} className={styles.logoLink} aria-label="HealixDz">
          <Image
            src={HEALIX_LOGO_FULL_SRC}
            alt="HealixDz"
            width={150}
            height={80}
            loading="eager"
            className={styles.logo}
          />
        </Link>

        <nav className={styles.desktopNav} aria-label={nav.primaryLabel}>
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
        <nav aria-label={nav.mobileLabel}>
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
    </motion.header>
  );
}
