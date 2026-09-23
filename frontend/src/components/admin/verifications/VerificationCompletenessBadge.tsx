import { type TranslationFunction } from "@/lib/i18n";

type VerificationCompletenessBadgeProps = {
  score: number;
  t: TranslationFunction;
};

export function VerificationCompletenessBadge({
  score,
  t,
}: VerificationCompletenessBadgeProps) {
  const isComplete = score >= 90;

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
      <span
        className={
          isComplete
            ? "h-2 w-2 rounded-full bg-[var(--success)]"
            : "h-2 w-2 rounded-full bg-[var(--warning)]"
        }
      />
      {score}% ·{" "}
      {isComplete
        ? t("admin.badges.documents.complete")
        : t("admin.badges.documents.incomplete")}
    </span>
  );
}
