import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries } from "@/i18n";
import { useEntitlements, entitlementsQueryKey } from "@/features/subscriptions/hooks/use-entitlements";
import { useReadOnlyAction } from "@/features/subscriptions/hooks/use-read-only-action";
import { type Entitlements } from "@/features/subscriptions/types/entitlements.types";
import { translate } from "@/lib/i18n";

import { SubscriptionBanner } from "./SubscriptionBanner";

const t = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);
// What React writes for an apostrophe in the markup.
const html5 = (text: string) => text.replaceAll("'", "&#x27;");
const ar = (key: string, params?: Record<string, string | number>) => translate(dictionaries.ar, key, params);

const entitlements = (overrides: Partial<Entitlements> = {}): Entitlements => ({
  canManage: true,
  daysLeft: 20,
  expiresAt: "2026-11-15T12:00:00.000Z",
  plan: { code: "DOCTOR_PRO", custom: false, id: "plan-pro", name: "Pro" },
  quotas: { aiAnalysesPerMonth: 100, aiPipelines: null, maxDoctors: 1, maxPatients: null },
  readOnly: false,
  status: "ACTIVE",
  trial: false,
  usage: { aiAnalysesThisMonth: 0, doctors: 1, patients: 0 },
  ...overrides,
});

// The banner reads the shared useEntitlements() hook: the cache answers, no
// request is made.
const withCache = (data: Entitlements | undefined, node: React.ReactNode) => {
  const client = new QueryClient();
  if (data) client.setQueryData(entitlementsQueryKey, data);
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
};

const banner = (data: Entitlements | undefined, accountType: "ESTABLISHMENT" | "INDEPENDENT_DOCTOR" = "INDEPENDENT_DOCTOR", translate = t) =>
  withCache(data, <SubscriptionBanner accountType={accountType} t={translate} />);

describe("the global subscription banner", () => {
  it("shows the days left of the free trial, with a button to choose a plan", () => {
    const html = banner(entitlements({ daysLeft: 9, status: "TRIALING", trial: true }));

    expect(html).toContain('data-banner="trial"');
    expect(html).toContain("Essai gratuit : 9 jours restants");
    expect(html).toContain(">Choisir un plan<");
    expect(html).toContain('href="/doctor/subscription"');
    expect(html).toContain(html5(t("subscription.banner.trialHint")));
  });

  it("uses the singular for the last day of the trial", () => {
    expect(banner(entitlements({ daysLeft: 1, status: "TRIALING", trial: true }))).toContain("Essai gratuit : 1 jour restant");
  });

  it("warns that a subscription ends in 3 days, with a button to renew", () => {
    const html = banner(entitlements({ daysLeft: 3 }));

    expect(html).toContain('data-banner="expiring"');
    expect(html).toContain("Votre abonnement expire dans 3 jours");
    expect(html).toContain(">Renouveler<");
    expect(html).not.toContain('role="alert"');
  });

  it("shows the read-only mode in red, with a button to renew", () => {
    const html = banner(entitlements({ daysLeft: 0, readOnly: true, status: "EXPIRED" }));

    expect(html).toContain('data-banner="readOnly"');
    expect(html).toContain("Abonnement expiré : mode lecture seule");
    expect(html).toContain('role="alert"');
    expect(html).toContain("--danger-ink");
    expect(html).toContain(">Renouveler<");
    expect(html).toContain(t("subscription.banner.readOnlyHint"));
  });

  it("says nothing while a paid subscription has time, or while nothing is known", () => {
    expect(banner(entitlements({ daysLeft: 20 }))).toBe("");
    expect(banner(undefined)).toBe("");
  });

  it("links an establishment to its own subscription page", () => {
    expect(banner(entitlements({ daysLeft: 3 }), "ESTABLISHMENT")).toContain('href="/establishment/subscription"');
  });

  it("tells an affiliated doctor that the establishment manages it, without a button", () => {
    const html = banner(entitlements({ canManage: false, daysLeft: 0, readOnly: true, status: "EXPIRED" }));

    expect(html).toContain(html5(t("subscription.banner.affiliated")));
    expect(html).not.toContain("<a ");
  });

  it("speaks Arabic as well", () => {
    const html = banner(entitlements({ daysLeft: 9, status: "TRIALING", trial: true }), "INDEPENDENT_DOCTOR", ar);

    expect(html).toContain("فترة تجريبية مجانية: 9 أيام متبقية");
    expect(html).toContain(">اختيار باقة<");
  });
});

describe("useEntitlements, shared by the banner, the gauges and the creation buttons", () => {
  const Probe = () => {
    const { entitlements: data, readOnly } = useEntitlements();
    return <p data-readonly={String(readOnly)}>{data?.status ?? "unknown"}</p>;
  };

  it("reads the same entitlements from the cache wherever it is called", () => {
    expect(withCache(entitlements({ readOnly: true, status: "EXPIRED" }), <Probe />)).toBe('<p data-readonly="true">EXPIRED</p>');
    expect(withCache(entitlements({ status: "TRIALING", trial: true }), <Probe />)).toBe('<p data-readonly="false">TRIALING</p>');
  });

  it("is not read-only while nothing is known (loading, no workspace yet)", () => {
    expect(withCache(undefined, <Probe />)).toBe('<p data-readonly="false">unknown</p>');
  });
});

describe("useReadOnlyAction: the creation buttons of a read-only account", () => {
  const Button = () => {
    const write = useReadOnlyAction(t);
    return (
      <button disabled={write.disabled} title={write.title}>
        Nouveau patient
      </button>
    );
  };

  it("disables the button with an explanation when the subscription is not live", () => {
    const html = withCache(entitlements({ readOnly: true, status: "EXPIRED" }), <Button />);

    expect(html).toContain("disabled");
    expect(html).toContain(`title="${t("subscription.readOnly.hint")}"`);
  });

  it("leaves it alone when the subscription is live, a trial included, or unknown", () => {
    for (const data of [entitlements(), entitlements({ status: "TRIALING", trial: true }), undefined]) {
      const html = withCache(data, <Button />);

      expect(html).not.toContain("disabled");
      expect(html).not.toContain("title=");
    }
  });
});
