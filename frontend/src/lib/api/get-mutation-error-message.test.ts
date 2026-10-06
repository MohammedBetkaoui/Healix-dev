import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

import { dictionaries, type Locale } from "@/i18n";
import { translate, type TranslationFunction } from "@/lib/i18n";

import {
  getMutationErrorMessage,
  getVerificationRequiredMessage,
} from "./get-mutation-error-message";

function axiosError(status: number, data: unknown) {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = {
    config,
    data,
    headers: {},
    status,
    statusText: "",
  };

  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, {}, response);
}

const tFor =
  (locale: Locale): TranslationFunction =>
  (key, params) =>
    translate(dictionaries[locale], key, params);

const verificationRequired = axiosError(403, {
  code: "VERIFICATION_REQUIRED",
  message: "Votre compte doit être vérifié pour accéder à cette fonctionnalité.",
});
const fallback = "Impossible d’enregistrer.";

describe("getMutationErrorMessage", () => {
  it.each<Locale>(["fr", "ar"])(
    "returns the localized verification notice for VERIFICATION_REQUIRED (%s)",
    (locale) => {
      const message = getMutationErrorMessage(verificationRequired, tFor(locale), fallback);

      expect(message).toBe(dictionaries[locale].common.verificationRequired.description);
      // A missing key would come back as the key itself.
      expect(message).not.toBe("common.verificationRequired.description");
    },
  );

  it("keeps the backend message for any other 403", () => {
    const rolesGuardError = axiosError(403, {
      error: "Forbidden",
      message: "Vous n'êtes pas autorisé à accéder à cette ressource.",
      statusCode: 403,
    });

    expect(getMutationErrorMessage(rolesGuardError, tFor("fr"), fallback)).toBe(
      "Vous n'êtes pas autorisé à accéder à cette ressource.",
    );
  });

  it("does not treat the VERIFICATION_REQUIRED code as such outside a 403", () => {
    const unauthorized = axiosError(401, {
      code: "VERIFICATION_REQUIRED",
      message: "Token d'acces invalide.",
    });

    expect(getMutationErrorMessage(unauthorized, tFor("fr"), fallback)).toBe(
      "Token d'acces invalide.",
    );
  });

  it("surfaces the backend message of a 409", () => {
    const conflict = axiosError(409, {
      error: "Conflict",
      message: "Ce créneau chevauche un rendez-vous existant.",
      statusCode: 409,
    });

    expect(getMutationErrorMessage(conflict, tFor("fr"), fallback)).toBe(
      "Ce créneau chevauche un rendez-vous existant.",
    );
  });

  it("falls back for a 409 without a usable message", () => {
    expect(getMutationErrorMessage(axiosError(409, {}), tFor("fr"), fallback)).toBe(fallback);
  });

  it("falls back for a non-axios error", () => {
    expect(getMutationErrorMessage(new Error("boom"), tFor("ar"), fallback)).toBe(fallback);
    expect(getMutationErrorMessage(undefined, tFor("ar"), fallback)).toBe(fallback);
  });
});

describe("getVerificationRequiredMessage", () => {
  it("only answers for VERIFICATION_REQUIRED", () => {
    expect(getVerificationRequiredMessage(verificationRequired, tFor("fr"))).toBe(
      dictionaries.fr.common.verificationRequired.description,
    );
    expect(getVerificationRequiredMessage(axiosError(409, { message: "x" }), tFor("fr"))).toBeUndefined();
    expect(getVerificationRequiredMessage(new Error("boom"), tFor("fr"))).toBeUndefined();
  });
});
