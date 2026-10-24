import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

import { type AdminSubscriptionDetail, type AdminSubscriptionRow } from "@/features/admin/subscriptions.types";
import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { AdminSubscriptionsTable } from "./AdminSubscriptionsTable";
import { SubscriptionActionsPanel } from "./SubscriptionActionsPanel";

const t = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);
const escaped = (text: string) => text.replaceAll("'", "&#x27;");

const row = (overrides: Partial<AdminSubscriptionRow> = {}): AdminSubscriptionRow => ({
  accountId: "acc-1",
  accountStatus: "ACTIVE",
  accountType: "INDEPENDENT_DOCTOR",
  daysLeft: 9,
  displayName: "Dr Amel Haddad",
  email: "amel@example.dz",
  expiresAt: "2026-11-02T12:00:00.000Z",
  fullName: "Amel Haddad",
  lastPayment: null,
  phone: "0550000000",
  plan: { code: "DOCTOR_PRO", custom: false, id: "plan-pro", name: "Pro" },
  quotas: { aiAnalysesPerMonth: 10, aiPipelines: null, maxDoctors: 1, maxPatients: null },
  status: "TRIALING",
  storedStatus: "TRIALING",
  trial: true,
  usage: { aiAnalysesThisMonth: 10, doctors: 1, patients: 42 },
  ...overrides,
});

describe("AdminSubscriptionsTable", () => {
  const render = (accounts: AdminSubscriptionRow[]) =>
    renderToStaticMarkup(<AdminSubscriptionsTable accounts={accounts} locale="fr" onViewDetails={jest.fn()} t={t} />);

  it("shows where each account stands: status, plan, expiry, usage out of quota", () => {
    const html = render([row()]);

    expect(html).toContain("Dr Amel Haddad");
    expect(html).toContain("amel@example.dz");
    expect(html).toContain(">Pro<");
    expect(html).toContain(t("admin.subscriptions.table.trial"));
    expect(html).toContain(t("admin.subscriptions.table.daysLeft", { days: 9 }));
    // 10 analyses of the trial's 10, and 42 patients with no limit.
    expect(html).toContain(t("admin.subscriptions.table.usage", { limit: 10, used: 10 }));
    expect(html).toContain(t("admin.subscriptions.table.unlimited", { used: 42 }));
    expect(html).toContain(escaped(t("admin.actions.viewDetails")));
  });

  it("shows an account that never subscribed, without a plan or an expiry", () => {
    const html = render([row({ daysLeft: null, expiresAt: null, plan: null, status: "NO_PLAN", storedStatus: "NO_PLAN", trial: false })]);

    expect(html).toContain("—");
    expect(html).not.toContain(t("admin.subscriptions.table.trial"));
  });

  it("shows the last payment of an account", () => {
    const html = render([row({ lastPayment: { amount: 5900, createdAt: "2026-10-20T08:00:00.000Z", currency: "DZD", id: "p1", method: "SYNTHETIC_CHARGILY", paidAt: "2026-10-20T08:00:05.000Z", reference: "HLX-PAY-2026-000007", status: "PAID" } })]);

    expect(html).toContain("HLX-PAY-2026-000007");
    expect(html).toContain(t("admin.badges.paymentStatus.PAID"));
  });

  it("says when there is no account", () => {
    expect(render([])).toContain(escaped(t("admin.common.noResults")));
  });
});

describe("SubscriptionActionsPanel", () => {
  const detail = (subscription: Partial<NonNullable<AdminSubscriptionDetail["subscription"]>> | null, accountType: AdminSubscriptionDetail["account"]["accountType"] = "INDEPENDENT_DOCTOR"): AdminSubscriptionDetail => ({
    account: { accountStatus: "ACTIVE", accountType, displayName: "Dr Amel Haddad", email: "amel@example.dz", fullName: "Amel Haddad", id: "acc-1", phone: "", verificationStatus: "VERIFIED" },
    entitlements: {} as AdminSubscriptionDetail["entitlements"],
    events: [],
    payments: [],
    subscription: subscription && {
      billingPeriod: "MONTHLY",
      canceledAt: null,
      customQuotas: null,
      expiresAt: "2026-11-02T12:00:00.000Z",
      id: "sub-1",
      plan: { code: "DOCTOR_PRO", custom: false, id: "plan-pro", name: "Pro", quotas: { aiAnalysesPerMonth: 100, aiPipelines: null, maxDoctors: 1, maxPatients: null } },
      startedAt: null,
      status: "TRIALING",
      trial: true,
      ...subscription,
    },
  });
  const render = (data: AdminSubscriptionDetail) =>
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <SubscriptionActionsPanel detail={data} t={t} />
      </QueryClientProvider>,
    );

  it("offers the actions that apply to a running trial, without opening any form", () => {
    const html = render(detail({}));

    for (const action of ["extendTrial", "extend", "cancel", "quotas"]) {
      expect(html).toContain(escaped(t(`admin.subscriptions.actions.${action}.label`)));
    }
    expect(html).not.toContain(escaped(t("admin.subscriptions.actions.activateCustom.label")));
    // Nothing is asked, and nothing sent, until an action is chosen.
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<textarea");
  });

  it("offers the contract on quote to an establishment", () => {
    expect(render(detail({ status: "ACTIVE", trial: false }, "ESTABLISHMENT"))).toContain(escaped(t("admin.subscriptions.actions.activateCustom.label")));
  });

  it("offers nothing to stop on an account that was stopped", () => {
    const html = render(detail({ status: "CANCELED" }));

    expect(html).not.toContain(escaped(t("admin.subscriptions.actions.cancel.label")));
    expect(html).not.toContain(escaped(t("admin.subscriptions.actions.extendTrial.label")));
    expect(html).toContain(escaped(t("admin.subscriptions.actions.quotas.label")));
  });
});
