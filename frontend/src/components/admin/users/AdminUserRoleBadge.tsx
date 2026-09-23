import { type TranslationFunction } from "@/lib/i18n";
import { type RegisteredUserRole } from "@/types/admin";

type AdminUserRoleBadgeProps = {
  role: RegisteredUserRole;
  t: TranslationFunction;
};

export function AdminUserRoleBadge({ role, t }: AdminUserRoleBadgeProps) {
  return (
    <span className="inline-flex rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
      {t(`admin.badges.roles.${role}`)}
    </span>
  );
}
