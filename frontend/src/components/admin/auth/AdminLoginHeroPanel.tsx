import { Activity, KeyRound, ShieldCheck } from "lucide-react";

import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { AdminSecurityNotice } from "./AdminSecurityNotice";

type AdminLoginHeroPanelProps = {
  direction: Direction;
  t: TranslationFunction;
};

const securityCards = [
  {
    descriptionKey: "adminAuth.hero.cards.gate.description",
    icon: ShieldCheck,
    titleKey: "adminAuth.hero.cards.gate.title",
  },
  {
    descriptionKey: "adminAuth.hero.cards.security.description",
    icon: KeyRound,
    titleKey: "adminAuth.hero.cards.security.title",
  },
  {
    descriptionKey: "adminAuth.hero.cards.audit.description",
    icon: Activity,
    titleKey: "adminAuth.hero.cards.audit.title",
  },
] as const;

export function AdminLoginHeroPanel({
  direction,
  t,
}: AdminLoginHeroPanelProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#071827] p-8 text-white shadow-2xl shadow-slate-950/25 lg:p-10",
        direction === "rtl" ? "text-right" : "text-left",
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.18),transparent_35%),radial-gradient(circle_at_90%_80%,rgba(16,185,129,0.14),transparent_32%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:44px_44px]" />

      <div className="relative flex min-h-full flex-col justify-between gap-10">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400 text-[#06131f] shadow-lg shadow-cyan-950/20">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-lg font-semibold tracking-tight">HealixDZ</p>
              <p className="text-xs uppercase tracking-[0.28em] text-cyan-200">
                Admin Gate
              </p>
            </div>
          </div>

          <div className="mt-12 max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-200">
              {t("adminAuth.hero.subtitle")}
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              {t("adminAuth.hero.title")}
            </h1>
            <p className="mt-5 text-base leading-8 text-slate-300">
              {t("adminAuth.hero.description")}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {securityCards.map((card) => {
            const Icon = card.icon;

            return (
              <div
                key={card.titleKey}
                className="rounded-2xl border border-white/10 bg-white/7 p-4 backdrop-blur"
              >
                <Icon className="h-5 w-5 text-cyan-200" aria-hidden="true" />
                <p className="mt-4 text-sm font-semibold">
                  {t(card.titleKey)}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-300">
                  {t(card.descriptionKey)}
                </p>
              </div>
            );
          })}
        </div>

        <AdminSecurityNotice t={t} />
      </div>
    </section>
  );
}
