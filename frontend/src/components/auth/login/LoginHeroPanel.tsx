import {
  BrainCircuit,
  LockKeyhole,
  Microscope,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const heroCards = [
  {
    icon: LockKeyhole,
    titleKey: "login.hero.cards.secureSpace.title",
    descriptionKey: "login.hero.cards.secureSpace.description",
  },
  {
    icon: Sparkles,
    titleKey: "login.hero.cards.demoMode.title",
    descriptionKey: "login.hero.cards.demoMode.description",
  },
  {
    icon: ShieldCheck,
    titleKey: "login.hero.cards.professionalVerification.title",
    descriptionKey: "login.hero.cards.professionalVerification.description",
  },
  {
    icon: BrainCircuit,
    titleKey: "login.hero.cards.medicalAi.title",
    descriptionKey: "login.hero.cards.medicalAi.description",
  },
];

type LoginHeroPanelProps = {
  t: (key: string) => string;
};

export function LoginHeroPanel({ t }: LoginHeroPanelProps) {
  return (
    <aside className="relative overflow-hidden rounded-[28px] border border-white/20 bg-[#083453] p-6 text-white shadow-[0_30px_80px_rgba(8,52,83,0.24)] sm:p-8 lg:min-h-[calc(100vh-4rem)]">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(34,211,238,0.18),transparent_35%),linear-gradient(220deg,rgba(16,185,129,0.14),transparent_42%)]" />
        <div className="absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,0.85)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.85)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="absolute -start-16 top-16 h-56 w-56 rounded-full bg-cyan-300/18 blur-3xl" />
        <div className="absolute bottom-10 end-0 h-56 w-56 rounded-full bg-emerald-300/14 blur-3xl" />
      </div>

      <div className="relative z-10 flex h-full flex-col gap-8">
        <div>
          <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-cyan-50 backdrop-blur">
            <span className="text-base font-semibold">{t("common.brand")}</span>
          </div>

          <div className="mt-8 max-w-xl">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              {t("login.hero.title")}
            </h1>
            <p className="mt-4 text-lg text-cyan-50/95">
              {t("login.hero.subtitle")}
            </p>
            <p className="mt-5 max-w-xl text-sm leading-7 text-sky-100">
              {t("login.hero.description")}
            </p>
          </div>
        </div>

        <div className="relative rounded-[24px] border border-white/15 bg-white/[0.08] p-5 shadow-xl shadow-sky-950/20 backdrop-blur">
          <div className="absolute inset-0 rounded-[24px] bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.2),transparent_35%)]" />
          <div className="relative grid gap-3 sm:grid-cols-2">
            {heroCards.map(({ icon: Icon, titleKey, descriptionKey }) => (
              <div
                key={titleKey}
                className="rounded-2xl border border-white/12 bg-white/[0.09] p-4"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/12 text-cyan-100">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-4 text-sm font-semibold text-white">
                  {t(titleKey)}
                </p>
                <p className="mt-2 text-sm leading-6 text-sky-100">
                  {t(descriptionKey)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[24px] border border-white/14 bg-white/[0.08] p-5 shadow-lg shadow-sky-950/20 backdrop-blur">
          <div
            className="pointer-events-none absolute inset-y-0 start-0 w-24 bg-[linear-gradient(90deg,rgba(16,185,129,0.12),transparent)]"
            aria-hidden="true"
          />
          <div className="relative flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-300/18 text-emerald-100">
              <Microscope className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">
                {t("login.hero.trust.title")}
              </p>
              <p className="mt-2 text-sm leading-6 text-sky-100">
                {t("login.hero.trust.description")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
