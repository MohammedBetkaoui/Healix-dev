import { type TranslationFunction } from "@/lib/i18n";
import { type RegisteredUserRole } from "@/types/admin";

type AdminUserRoleBadgeProps = {
  role: RegisteredUserRole;
  t: TranslationFunction;
};

export function AdminUserRoleBadge({ role, t }: AdminUserRoleBadgeProps) {
  return (
    <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
      {t(`admin.badges.roles.${role}`)}
    </span>
  );
}
