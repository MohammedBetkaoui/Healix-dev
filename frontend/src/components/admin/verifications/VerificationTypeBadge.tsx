import { type TranslationFunction } from "@/lib/i18n";
import { type VerificationRequestType } from "@/types/admin";

type VerificationTypeBadgeProps = {
  t: TranslationFunction;
  type: VerificationRequestType;
};

export function VerificationTypeBadge({ t, type }: VerificationTypeBadgeProps) {
  return (
    <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">
      {t(`admin.badges.type.${type}`)}
    </span>
  );
}
