import { Button } from "@/components/ui/button";
import { type TranslationFunction } from "@/lib/i18n";
import { type RegisteredUser } from "@/types/admin";

import { VerificationStatusBadge } from "../verifications/VerificationStatusBadge";
import { AdminUserRoleBadge } from "./AdminUserRoleBadge";
import { AdminUserStatusBadge } from "./AdminUserStatusBadge";

type AdminUsersTableProps = {
  t: TranslationFunction;
  users: RegisteredUser[];
};

export function AdminUsersTable({ t, users }: AdminUsersTableProps) {
  if (users.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        {t("admin.common.noResults")}
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
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
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-5 py-4 font-semibold text-slate-950">
                  {user.fullName}
                </td>
                <td className="px-5 py-4 text-slate-600">{user.email}</td>
                <td className="px-5 py-4 text-slate-600">{user.phone}</td>
                <td className="px-5 py-4">
                  <AdminUserRoleBadge role={user.role} t={t} />
                </td>
                <td className="px-5 py-4">
                  <AdminUserStatusBadge status={user.accountStatus} t={t} />
                </td>
                <td className="px-5 py-4">
                  <VerificationStatusBadge status={user.verificationStatus} t={t} />
                </td>
                <td className="px-5 py-4 text-slate-600">{user.createdAt}</td>
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
