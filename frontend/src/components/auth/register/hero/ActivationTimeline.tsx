import { type RegisterI18nProps } from "../RegisterPage";

const activationSteps = [
  "accountCreated",
  "demoMode",
  "professionalVerification",
  "fullActivation",
] as const;

export function ActivationTimeline({ t }: RegisterI18nProps) {
  return (
    <section
      aria-labelledby="activation-timeline-title"
      className="rounded-lg border border-white/12 bg-white/[0.07] p-4 shadow-sm shadow-sky-950/10 backdrop-blur"
    >
      <h2
        id="activation-timeline-title"
        className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100"
      >
        {t("register.hero.activation.title")}
      </h2>
      <ol className="relative mt-4 grid gap-3">
        <span
          className="absolute bottom-4 start-3.5 top-4 w-px bg-cyan-100/20"
          aria-hidden="true"
        />
        {activationSteps.map((step, index) => {
          const isActive = index === 0;

          return (
            <li
              key={step}
              className="group relative flex items-center gap-3 rounded-lg px-1 py-1.5 transition hover:bg-white/[0.06]"
            >
              <span
                className={
                  isActive
                    ? "z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-200 text-xs font-bold text-[#082f49] shadow-lg shadow-cyan-950/20"
                    : "z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-[#0b3b5f] text-xs font-semibold text-cyan-50"
                }
              >
                {index + 1}
              </span>
              <span className="text-sm font-medium text-sky-50 transition group-hover:text-white">
                {t(`register.hero.activation.steps.${step}`)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
