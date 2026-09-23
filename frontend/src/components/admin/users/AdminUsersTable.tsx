import { Button } from "@/components/ui/button";
import { type Locale } from "@/i18n";
import { formatAdminDateTime } from "@/lib/date-format";
import { type TranslationFunction } from "@/lib/i18n";
import { type RegisteredUser } from "@/types/admin";

import { VerificationStatusBadge } from "../verifications/VerificationStatusBadge";
import { AdminUserRoleBadge } from "./AdminUserRoleBadge";
import { AdminUserStatusBadge } from "./AdminUserStatusBadge";

type AdminUsersTableProps = {
  locale: Locale;
  t: TranslationFunction;
  users: RegisteredUser[];
};

export function AdminUsersTable({ locale, t, users }: AdminUsersTableProps) {
  if (users.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        {t("admin.common.noResults")}
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-5 py-4 text-start">{t("admin.users.table.name")}</th>
              <th className="px-5 py-4 text-start">{t("admin.users.table.email")}</th>
              <th className="px-5 py-4 text-start">{t("admin.users.table.phone")}</th>
              <th className="px-5 py-4 text-start">{t("admin.users.table.role")}</th>
              <th className="px-5 py-4 text-start">{t("admin.users.table.status")}</th>
              <th className="px-5 py-4 text-start">{t("admin.users.table.verification")}</th>
              <th className="px-5 py-4 text-start">{t("admin.users.table.createdAt")}</th>
              <th className="px-5 py-4 text-start">{t("admin.users.table.action")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-5 py-4 font-semibold text-foreground">
                  {user.fullName}
                </td>
                <td className="px-5 py-4 text-muted-foreground">{user.email}</td>
                <td className="px-5 py-4 text-muted-foreground">{user.phone}</td>
                <td className="px-5 py-4">
                  <AdminUserRoleBadge role={user.role} t={t} />
                </td>
                <td className="px-5 py-4">
                  <AdminUserStatusBadge status={user.accountStatus} t={t} />
                </td>
                <td className="px-5 py-4">
                  <VerificationStatusBadge status={user.verificationStatus} t={t} />
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {formatAdminDateTime(user.createdAt, locale)}
                </td>
                <td className="px-5 py-4">
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm">
                      {t("admin.actions.viewDetails")}
                    </Button>
                    <Button type="button" variant="ghost" size="sm">
                      {user.accountStatus === "SUSPENDED"
                        ? t("admin.actions.reactivate")
                        : t("admin.actions.suspend")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
