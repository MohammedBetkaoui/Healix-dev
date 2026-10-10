import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

import {
  createForgotPasswordSchema,
  createResetPasswordSchema,
} from "@/lib/validations/password-reset.schema";
import { type RegisterValidationMessages } from "@/lib/validations/register.schema";

import {
  classifyPasswordResetError,
  readResetToken,
  urlWithoutToken,
} from "./password-reset";

const TOKEN = "Abc_def-0123456789ABCDEFGHIJKLMNOPQRSTUVWXy";

function axiosError(status: number | null, data?: unknown) {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse | undefined =
    status === null
      ? undefined
      : { config, data, headers: {}, status, statusText: "" };

  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, {}, response);
}

const registerMessages: RegisterValidationMessages = {
  acceptTerms: "acceptTerms",
  emailInvalid: "emailInvalid",
  maxLength: (max) => `max ${max}`,
  passwordMismatch: "passwordMismatch",
  passwordTooShort: "passwordTooShort",
  phoneInvalid: "phoneInvalid",
  phoneRequired: "phoneRequired",
  required: "required",
};

// The first message of each field: the one react-hook-form shows.
function issues(result: { error?: { issues: { message: string; path: PropertyKey[] }[] } }) {
  const first = new Map<string, string>();
  for (const issue of result.error?.issues ?? []) {
    const field = issue.path.join(".");
    if (!first.has(field)) first.set(field, issue.message);
  }
  return [...first.entries()];
}

describe("readResetToken", () => {
  it("reads the token of the reset link", () => {
    expect(TOKEN).toHaveLength(43);
    expect(readResetToken(`?token=${TOKEN}`)).toBe(TOKEN);
    expect(readResetToken(`?lang=ar&token=${TOKEN}`)).toBe(TOKEN);
  });

  it("refuses a missing, empty, repeated or malformed token", () => {
    expect(readResetToken("")).toBeNull();
    expect(readResetToken("?token=")).toBeNull();
    expect(readResetToken(`?token=${TOKEN}&token=${TOKEN}`)).toBeNull();
    expect(readResetToken(`?token=${TOKEN.slice(1)}`)).toBeNull();
    expect(readResetToken(`?token=${TOKEN}A`)).toBeNull();
    // base64 with padding or "+" and "/" is not what the backend issues.
    expect(readResetToken(`?token=${TOKEN.slice(0, 42)}%2B`)).toBeNull();
    expect(readResetToken(`?token=${TOKEN.slice(0, 42)}=`)).toBeNull();
  });
});

describe("urlWithoutToken", () => {
  it("drops the token and keeps the rest of the address", () => {
    expect(urlWithoutToken("/reset-password", `?token=${TOKEN}`)).toBe("/reset-password");
    expect(urlWithoutToken("/reset-password", `?lang=ar&token=${TOKEN}`, "#form")).toBe(
      "/reset-password?lang=ar#form",
    );
    expect(urlWithoutToken("/reset-password", "")).toBe("/reset-password");
  });
});

describe("forgot password form", () => {
  const schema = createForgotPasswordSchema({ emailInvalid: "emailInvalid", emailRequired: "emailRequired" });

  it("normalizes a valid address", () => {
    expect(schema.safeParse({ email: "  Amina@Clinique.DZ " })).toEqual({
      data: { email: "amina@clinique.dz" },
      success: true,
    });
  });

  it("requires a valid address", () => {
    expect(issues(schema.safeParse({ email: "   " }))).toEqual([["email", "emailRequired"]]);
    expect(issues(schema.safeParse({ email: "amina@" }))).toEqual([["email", "emailInvalid"]]);
  });
});

describe("reset password form", () => {
  const schema = createResetPasswordSchema(registerMessages);

  it("applies the registration rule to the new password", () => {
    expect(issues(schema.safeParse({ confirmPassword: "", password: "" }))).toEqual([
      ["password", "required"],
      ["confirmPassword", "required"],
    ]);
    expect(issues(schema.safeParse({ confirmPassword: "court", password: "court" }))).toEqual([
      ["password", "passwordTooShort"],
      ["confirmPassword", "passwordTooShort"],
    ]);
    expect(issues(schema.safeParse({ confirmPassword: "x".repeat(129), password: "x".repeat(129) }))).toEqual([
      ["password", "max 128"],
      ["confirmPassword", "max 128"],
    ]);
  });

  it("requires the confirmation to match", () => {
    expect(
      issues(schema.safeParse({ confirmPassword: "Autre-mot-2026", password: "Nouveau-mot-2026" })),
    ).toEqual([["confirmPassword", "passwordMismatch"]]);
    expect(schema.safeParse({ confirmPassword: "Nouveau-mot-2026", password: "Nouveau-mot-2026" }).success).toBe(true);
  });
});

describe("classifyPasswordResetError", () => {
  it("recognizes an invalid or expired link by its code", () => {
    expect(
      classifyPasswordResetError(
        axiosError(400, { code: "RESET_TOKEN_INVALID", message: "Ce lien de réinitialisation est invalide ou a expiré." }),
      ),
    ).toBe("invalidToken");
  });

  it("tells the password rules apart from other errors", () => {
    expect(
      classifyPasswordResetError(
        axiosError(400, { message: ["Le mot de passe doit contenir au moins 8 caractères."], statusCode: 400 }),
      ),
    ).toBe("passwordTooShort");
    expect(
      classifyPasswordResetError(axiosError(400, { message: ["Les mots de passe ne correspondent pas."] })),
    ).toBe("passwordMismatch");
    expect(classifyPasswordResetError(axiosError(400, { message: ["Email invalide."] }))).toBe("generic");
  });

  it("separates throttling, network and server failures", () => {
    expect(classifyPasswordResetError(axiosError(429, { message: "ThrottlerException" }))).toBe("tooManyRequests");
    expect(classifyPasswordResetError(axiosError(null))).toBe("network");
    expect(classifyPasswordResetError(axiosError(500, {}))).toBe("generic");
    expect(classifyPasswordResetError(new Error("boom"))).toBe("generic");
  });
});
