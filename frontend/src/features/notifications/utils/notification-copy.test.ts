import { dictionaries, type Locale } from "@/i18n";
import { translate } from "@/lib/i18n";

import { type ClinicalNotification } from "../types/notification.types";
import { getNotificationCopy } from "./notification-copy";

const tFor = (locale: Locale) => (key: string, params?: Record<string, string | number>) => translate(dictionaries[locale], key, params);

const notification = (type: string, data: Record<string, unknown> | null): ClinicalNotification =>
  ({ category: "SUBSCRIPTION", data, id: "n-1", type }) as unknown as ClinicalNotification;

describe("getNotificationCopy for the subscription", () => {
  it("says the day an activated subscription ends", () => {
    const copy = getNotificationCopy(notification("SUBSCRIPTION_ACTIVATED", { expiresAt: "2026-12-02T12:00:00.000Z" }), tFor("fr"), "fr");

    expect(copy.title).toBe("Abonnement activé");
    expect(copy.description).toMatch(/^Abonnement activé jusqu'au .*2026\./);
    expect(copy.description).toContain("2 décembre 2026");
  });

  it("says the days an extension added, and the day it ends", () => {
    const copy = getNotificationCopy(notification("SUBSCRIPTION_EXTENDED", { days: 7, expiresAt: "2026-11-09T12:00:00.000Z" }), tFor("fr"), "fr");

    expect(copy.description).toContain("7 jour(s)");
    expect(copy.description).toContain("9 novembre 2026");
  });

  it("counts the days left in a reminder", () => {
    const copy = getNotificationCopy(notification("SUBSCRIPTION_EXPIRING", { daysRemaining: 3 }), tFor("fr"), "fr");

    expect(copy.description).toBe("Votre abonnement arrive à échéance dans 3 jour(s).");
  });

  it("falls back to the written text when the data is missing, never to a key", () => {
    for (const locale of ["fr", "ar"] as const) {
      const copy = getNotificationCopy(notification("SUBSCRIPTION_ACTIVATED", null), tFor(locale), locale);

      expect(copy.title).not.toMatch(/^notifications\./);
      expect(copy.description).not.toMatch(/^notifications\./);
    }
  });

  it("says the same in Arabic", () => {
    const copy = getNotificationCopy(notification("SUBSCRIPTION_ACTIVATED", { expiresAt: "2026-12-02T12:00:00.000Z" }), tFor("ar"), "ar");

    expect(copy.title).toBe(dictionaries.ar.notifications.types.SUBSCRIPTION_ACTIVATED.title);
    expect(copy.description).not.toContain("{date}");
  });

  it.each(["SUBSCRIPTION_EXPIRED", "SUBSCRIPTION_CANCELED", "SUBSCRIPTION_QUOTAS_CHANGED"])("has a title and a description for %s in both languages", (type) => {
    for (const locale of ["fr", "ar"] as const) {
      const copy = getNotificationCopy(notification(type, {}), tFor(locale), locale);

      expect(copy.title.length).toBeGreaterThan(3);
      expect(copy.description.length).toBeGreaterThan(10);
      expect(copy.title).not.toMatch(/^notifications\./);
    }
  });
});
