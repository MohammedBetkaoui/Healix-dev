import { AxiosError, type AxiosResponse } from "axios";

import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { classifyAccountError } from "./account-errors";
import { ACCOUNT_TABS, parseAccountTab, sessionDeviceLabel, settingsHref } from "./account-utils";

const failure = (status: number, data: unknown = {}) => new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, { data, status } as AxiosResponse);

describe("parseAccountTab", () => {
  it("opens the section the address names, else the profile", () => {
    expect(parseAccountTab("security")).toBe("security");
    expect(parseAccountTab("language")).toBe("language");
    expect(parseAccountTab("nope")).toBe("profile");
    expect(parseAccountTab(null)).toBe("profile");
  });

  it("builds an address for each section", () => {
    expect(settingsHref("DOCTOR")).toBe("/doctor/settings");
    expect(settingsHref("DOCTOR", "security")).toBe("/doctor/settings?tab=security");
    expect(settingsHref("ESTABLISHMENT", "messaging")).toBe("/establishment/settings?tab=messaging");
    expect(ACCOUNT_TABS.map((tab) => parseAccountTab(tab))).toEqual([...ACCOUNT_TABS]);
  });
});

describe("classifyAccountError", () => {
  it("tells apart what the backend refuses by its code", () => {
    expect(classifyAccountError(failure(400, { code: "CURRENT_PASSWORD_INVALID" }))).toEqual({ field: "currentPassword", key: "currentPasswordInvalid" });
    expect(classifyAccountError(failure(409, { code: "PHONE_ALREADY_USED" }))).toEqual({ field: "phone", key: "phoneAlreadyUsed" });
    expect(classifyAccountError(failure(409, { code: "PROFILE_FIELD_LOCKED", fields: ["fullName"] }))).toEqual({ fields: ["fullName"], key: "fieldLocked" });
    expect(classifyAccountError(failure(404, { code: "SESSION_NOT_FOUND" }))).toEqual({ key: "sessionNotFound" });
    expect(classifyAccountError(failure(403, { code: "VERIFICATION_REQUIRED" }))).toEqual({ key: "verificationRequired" });
  });

  it("falls back on the status", () => {
    expect(classifyAccountError(new AxiosError("Network Error"))).toEqual({ key: "network" });
    expect(classifyAccountError(failure(429))).toEqual({ key: "tooManyRequests" });
    expect(classifyAccountError(failure(400, { message: ["Le téléphone est invalide."] }))).toEqual({ field: "phone", key: "phoneInvalid" });
    expect(classifyAccountError(failure(400, { message: ["autre chose"] }))).toEqual({ key: "invalid" });
    expect(classifyAccountError(failure(403))).toEqual({ key: "forbidden" });
    expect(classifyAccountError(failure(500))).toEqual({ key: "unknown" });
    expect(classifyAccountError(new Error("boom"))).toEqual({ key: "unknown" });
  });

  it("has a message in French and in Arabic for each of them", () => {
    const keys = ["unknown", "network", "tooManyRequests", "forbidden", "invalid", "currentPasswordInvalid", "newPasswordSame", "passwordTooShort", "phoneInvalid", "phoneAlreadyUsed", "fieldLocked", "sessionNotFound", "currentSession", "currentSessionUnknown", "verificationRequired"];
    for (const locale of ["fr", "ar"] as const) {
      for (const key of keys) {
        const path = `account.errors.${key}`;
        expect(translate(dictionaries[locale], path)).not.toBe(path);
      }
    }
  });
});

describe("sessionDeviceLabel", () => {
  const t = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);

  it("reads 'browser on system', and says what it does not know", () => {
    expect(sessionDeviceLabel({ browser: "Chrome", os: "Windows" }, t)).toBe("Chrome sur Windows");
    expect(sessionDeviceLabel({ browser: "Firefox", os: null }, t)).toBe("Firefox");
    expect(sessionDeviceLabel({ browser: null, os: "Android" }, t)).toBe("Navigateur sur Android");
    expect(sessionDeviceLabel({ browser: null, os: null }, t)).toBe("Appareil inconnu");
  });
});
