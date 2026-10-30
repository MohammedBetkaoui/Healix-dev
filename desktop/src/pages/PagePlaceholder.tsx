import type { LucideIcon } from "lucide-react";
import { fr } from "../i18n/fr";

// A page announced in the menu, filled in a coming version.
export function PagePlaceholder({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <section className="surface-section" aria-labelledby="placeholder-title">
      <div className="team-empty">
        <Icon size={32} strokeWidth={1.5} aria-hidden="true" />
        <h1 id="placeholder-title" className="text-base font-semibold text-[var(--ink)]">{title}</h1>
        <span>{fr.placeholder}</span>
      </div>
    </section>
  );
}
