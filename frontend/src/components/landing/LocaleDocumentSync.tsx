"use client";

import { useEffect } from "react";

import type { Locale } from "@/i18n";
import { getDirection } from "@/lib/i18n";

export function LocaleDocumentSync({ locale }: { locale: Locale }) {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = getDirection(locale);
  }, [locale]);

  return null;
}

