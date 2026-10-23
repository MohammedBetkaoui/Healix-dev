import { AxiosError, type AxiosResponse } from "axios";

import { dictionaries } from "@/i18n";
import { getRegisterValidationMessages, translate } from "@/lib/i18n";

import { type ChangePasswordPayload, type ChangePasswordResult } from "../types/account.types";
import { submitPasswordChange } from "./password-form";

const t = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);
const messages = getRegisterValidationMessages(t);
const send = jest.fn<Promise<ChangePasswordResult>, [ChangePasswordPayload]>();
const deps = { messages, send, t };

const values = { confirmPassword: "Nouveau-mdp-2026", currentPassword: "Ancien-mdp-2026", newPassword: "Nouveau-mdp-2026" };
const done: ChangePasswordResult = { keptCurrentSession: true, message: "ok", revokedSessions: 2 };
const refusal = (status: number, data: unknown) => new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, { data, status } as AxiosResponse);

beforeEach(() => {
  jest.resetAllMocks();
});

describe("submitPasswordChange", () => {
  it("refuses a confirmation that differs, without calling the API, then succeeds once it matches", async () => {
    const mismatch = await submitPasswordChange({ ...values, confirmPassword: "Autre-mdp-2026" }, deps);

    expect(mismatch).toEqual({ errors: { confirmPassword: t("register.errors.passwordMismatch") }, status: "invalid" });
    expect(send).not.toHaveBeenCalled();

    send.mockResolvedValue(done);
    const outcome = await submitPasswordChange(values, deps);

    expect(outcome).toEqual({ result: done, status: "success" });
    // The confirmation stays in the form: the API gets the two passwords.
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ currentPassword: "Ancien-mdp-2026", newPassword: "Nouveau-mdp-2026" });
  });

  it("asks for the current password and applies the minimum of the registration to the new one", async () => {
    const outcome = await submitPasswordChange({ confirmPassword: "court", currentPassword: "", newPassword: "court" }, deps);

    expect(outcome).toEqual({
      errors: {
        currentPassword: t("account.common.required"),
        newPassword: t("register.errors.passwordTooShort"),
      },
      status: "invalid",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("trims the passwords as the server does", async () => {
    send.mockResolvedValue(done);

    await submitPasswordChange({ confirmPassword: " Nouveau-mdp-2026 ", currentPassword: " Ancien-mdp-2026", newPassword: "Nouveau-mdp-2026  " }, deps);

    expect(send).toHaveBeenCalledWith({ currentPassword: "Ancien-mdp-2026", newPassword: "Nouveau-mdp-2026" });
  });

  it("shows a wrong current password next to its field", async () => {
    send.mockRejectedValue(refusal(400, { code: "CURRENT_PASSWORD_INVALID", message: "Le mot de passe actuel est incorrect." }));

    await expect(submitPasswordChange(values, deps)).resolves.toEqual({
      errors: { currentPassword: t("account.errors.currentPasswordInvalid") },
      message: null,
      status: "failed",
    });
  });

  it("shows a new password equal to the old one next to the new password field", async () => {
    send.mockRejectedValue(refusal(400, { code: "NEW_PASSWORD_SAME_AS_CURRENT" }));

    await expect(submitPasswordChange(values, deps)).resolves.toEqual({
      errors: { newPassword: t("account.errors.newPasswordSame") },
      message: null,
      status: "failed",
    });
  });

  it("reads the validation sentence of the server for a password that is too short", async () => {
    send.mockRejectedValue(refusal(400, { message: ["Le mot de passe doit contenir au moins 8 caractères."] }));

    await expect(submitPasswordChange(values, deps)).resolves.toMatchObject({
      errors: { newPassword: t("account.errors.passwordTooShort") },
      status: "failed",
    });
  });

  it("says what went wrong when it belongs to no field: too many attempts, no network", async () => {
    send.mockRejectedValueOnce(refusal(429, {}));
    await expect(submitPasswordChange(values, deps)).resolves.toEqual({
      errors: {},
      message: t("account.errors.tooManyRequests"),
      status: "failed",
    });

    send.mockRejectedValueOnce(new AxiosError("Network Error"));
    await expect(submitPasswordChange(values, deps)).resolves.toMatchObject({ message: t("account.errors.network") });
  });
});
