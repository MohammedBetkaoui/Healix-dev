"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";
import { WorkspaceLink as Link } from "./WorkspaceLink";

import type { TranslationFunction } from "@/lib/i18n";
import type { DashboardNavSection } from "@/types/dashboard";

export function WorkspaceSearch({ sections, t }: { sections: DashboardNavSection[]; t: TranslationFunction }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const id = useId();
  const open = useCallback(() => {
    setQuery("");
    dialogRef.current?.showModal();
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (dialogRef.current?.closest("[inert]")) return;
        if (document.querySelector("dialog[open]") && !dialogRef.current?.open) return;
        event.preventDefault();
        if (dialogRef.current?.open) dialogRef.current.close();
        else open();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [open]);

  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f\u064b-\u065f]/g, "").toLocaleLowerCase();
  const results = sections.flatMap((section) => section.items).filter((item) => item.key !== "logout" && normalize(t(item.labelKey)).includes(normalize(query.trim())));

  return (
    <>
      <button type="button" className="workspace-search-trigger" onClick={open} aria-label={t("dashboard.clinical.search.trigger")} title={t("dashboard.clinical.search.shortcut")} aria-haspopup="dialog" aria-controls={id}>
        <Search size={17} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
        <span className="hidden min-w-0 flex-1 truncate md:block">{t("dashboard.clinical.search.trigger")}</span>
        <kbd className="hidden shrink-0 text-[.65rem] xl:block" dir="ltr">⌘ / Ctrl K</kbd>
      </button>
      <dialog ref={dialogRef} id={id} className="workspace-search-dialog surface-raised" aria-labelledby={`${id}-title`} aria-describedby={`${id}-hint`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={`${id}-title`} className="text-base font-semibold">{t("dashboard.clinical.search.title")}</h2>
          <button type="button" className="clinical-icon-button" onClick={() => dialogRef.current?.close()} aria-label={t("dashboard.clinical.close")}><X size={18} /></button>
        </div>
        <input ref={inputRef} className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-sm"
          value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("dashboard.clinical.search.placeholder")} aria-label={t("dashboard.clinical.search.placeholder")} />
        <p id={`${id}-hint`} className="clinical-caption my-3">{t("dashboard.clinical.search.hint")}</p>
        <ul className="grid gap-1">
          {results.map((item) => <li key={item.key}>
            <Link href={item.href} onClick={() => dialogRef.current?.close()} className="flex min-h-11 items-center gap-3 rounded-md px-2 text-sm hover:bg-[var(--surface-muted)]">
              <item.icon size={17} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-[var(--medical)]" />
              <span className="flex-1">{t(item.labelKey)}</span>
              {item.href.startsWith("#") ? <span className="clinical-caption">{t("dashboard.clinical.comingSoon")}</span> : <ArrowUpRight size={15} aria-hidden="true" className="clinical-directional" />}
            </Link>
          </li>)}
        </ul>
        {results.length === 0 ? <p className="py-6 text-center text-sm" role="status">{t("dashboard.clinical.search.empty")}</p> : null}
      </dialog>
    </>
  );
}
