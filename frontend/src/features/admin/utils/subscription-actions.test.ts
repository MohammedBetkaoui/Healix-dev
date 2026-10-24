import {
  type AdminActionForm,
  type AdminActionKind,
  type AdminSubscriptionApi,
  ADMIN_REASON_MAX_LENGTH,
  AdminActionValidationError,
  buildQuotasInput,
  emptyActionForm,
  submitAdminAction,
  validateAdminAction,
} from "./subscription-actions";
import { availableAdminActions } from "./subscription-actions-availability";
import { type AdminSubscriptionDetail } from "../subscriptions.types";

const form = (overrides: Partial<AdminActionForm> = {}): AdminActionForm => ({ ...emptyActionForm(), ...overrides });
const now = new Date("2026-10-24T10:00:00.000Z");

const answer = { message: "ok", subscription: { daysLeft: 20, expiresAt: "2026-11-13T12:00:00.000Z", id: "sub-1", status: "TRIALING" as const, trial: true } };
const fakeApi = (): jest.Mocked<AdminSubscriptionApi> => ({
  activateCustom: jest.fn().mockResolvedValue(answer),
  cancel: jest.fn().mockResolvedValue(answer),
  extend: jest.fn().mockResolvedValue(answer),
  extendTrial: jest.fn().mockResolvedValue(answer),
  quotas: jest.fn().mockResolvedValue(answer),
});
const sent = (api: jest.Mocked<AdminSubscriptionApi>) => Object.values(api).flatMap((call) => call.mock.calls);

describe("the reason, asked by every action of the console", () => {
  const kinds: AdminActionKind[] = ["extendTrial", "extend", "cancel", "quotas", "activateCustom"];
  // What each action needs besides the reason, so that only the reason fails.
  const complete = (kind: AdminActionKind, reason: string) =>
    form({ days: "7", reason, until: "2027-01-01", ...(kind === "quotas" ? { resetQuotas: true } : {}) });

  it.each(kinds)("is required for %s: empty, blank or too short is refused", (kind) => {
    for (const reason of ["", "     ", "abcd", "  ab  "]) {
      expect(validateAdminAction(kind, complete(kind, reason), now)).toBe("reasonRequired");
    }
    expect(validateAdminAction(kind, complete(kind, "Geste commercial"), now)).toBeNull();
    expect(validateAdminAction(kind, complete(kind, "12345"), now)).toBeNull();
  });

  it("is limited to 500 characters", () => {
    expect(validateAdminAction("cancel", form({ reason: "x".repeat(ADMIN_REASON_MAX_LENGTH) }), now)).toBeNull();
    expect(validateAdminAction("cancel", form({ reason: "x".repeat(ADMIN_REASON_MAX_LENGTH + 1) }), now)).toBe("reasonTooLong");
  });

  it("is checked before everything else", () => {
    expect(validateAdminAction("extendTrial", form({ days: "abc", reason: "" }), now)).toBe("reasonRequired");
  });
});

describe("extending a trial", () => {
  it.each([
    ["1", null],
    ["14", null],
    ["30", null],
    ["31", "daysInvalid"],
    ["0", "daysInvalid"],
    ["-3", "daysInvalid"],
    ["1.5", "daysInvalid"],
    ["", "daysInvalid"],
    ["abc", "daysInvalid"],
  ])("with %j days: %s", (days, expected) => {
    expect(validateAdminAction("extendTrial", form({ days, reason: "Demande du médecin" }), now)).toBe(expected);
  });

  it("is sent, once it has a reason, with the days and the trimmed reason", async () => {
    const api = fakeApi();

    const result = await submitAdminAction("extendTrial", "acc-1", form({ days: "7", reason: "  Essai interrompu par une panne  " }), api);

    expect(result).toBe(answer);
    expect(api.extendTrial).toHaveBeenCalledTimes(1);
    expect(api.extendTrial).toHaveBeenCalledWith("acc-1", { days: 7, reason: "Essai interrompu par une panne" });
    expect(sent(api)).toHaveLength(1);
  });

  it("sends nothing at all without a reason", async () => {
    const api = fakeApi();

    for (const reason of ["", "    ", "ok"]) {
      await expect(submitAdminAction("extendTrial", "acc-1", form({ days: "7", reason }), api)).rejects.toMatchObject({ code: "reasonRequired" });
    }

    expect(sent(api)).toHaveLength(0);
  });

  it("sends nothing for days out of bounds, with a reason", async () => {
    const api = fakeApi();

    await expect(submitAdminAction("extendTrial", "acc-1", form({ days: "45", reason: "Demande du médecin" }), api)).rejects.toBeInstanceOf(AdminActionValidationError);

    expect(sent(api)).toHaveLength(0);
  });
});

describe("a commercial gesture", () => {
  it("accepts up to a year, no more", () => {
    expect(validateAdminAction("extend", form({ days: "365", reason: "Geste commercial" }), now)).toBeNull();
    expect(validateAdminAction("extend", form({ days: "366", reason: "Geste commercial" }), now)).toBe("daysInvalid");
  });

  it("is sent with the days and the reason", async () => {
    const api = fakeApi();

    await submitAdminAction("extend", "acc-1", form({ days: "30", reason: "Geste commercial" }), api);

    expect(api.extend).toHaveBeenCalledWith("acc-1", { days: 30, reason: "Geste commercial" });
  });
});

describe("stopping an account", () => {
  it("needs a reason and nothing else", async () => {
    const api = fakeApi();

    await expect(submitAdminAction("cancel", "acc-1", form(), api)).rejects.toMatchObject({ code: "reasonRequired" });
    expect(sent(api)).toHaveLength(0);

    await submitAdminAction("cancel", "acc-1", form({ reason: "Impayé" }), api);
    expect(api.cancel).toHaveBeenCalledWith("acc-1", { reason: "Impayé" });
  });
});

describe("custom quotas", () => {
  const quotaForm = (overrides: Partial<AdminActionForm["quotas"]> = {}) =>
    form({ quotas: { ...emptyActionForm().quotas, ...overrides }, reason: "Accord commercial" });

  it("fixes only what the form changes: the other quotas keep the plan's", () => {
    expect(buildQuotasInput(emptyActionForm())).toEqual({});
    expect(
      buildQuotasInput(
        quotaForm({
          aiAnalysesPerMonth: { mode: "value", value: " 250 " },
          aiPipelines: { mode: "some", selected: ["brain", "cardio-ecg"] },
          maxPatients: { mode: "unlimited", value: "" },
        }),
      ),
    ).toEqual({ aiAnalysesPerMonth: 250, aiPipelines: ["brain", "cardio-ecg"], maxPatients: null });
    expect(buildQuotasInput(quotaForm({ aiPipelines: { mode: "all", selected: ["brain"] } }))).toEqual({ aiPipelines: null });
  });

  it("refuses a value that is not a whole number, and a list of models left empty", () => {
    expect(validateAdminAction("quotas", quotaForm({ maxDoctors: { mode: "value", value: "abc" } }), now)).toBe("quotasInvalid");
    expect(validateAdminAction("quotas", quotaForm({ maxDoctors: { mode: "value", value: "-2" } }), now)).toBe("quotasInvalid");
    expect(validateAdminAction("quotas", quotaForm({ maxDoctors: { mode: "value", value: "" } }), now)).toBe("quotasInvalid");
    expect(validateAdminAction("quotas", quotaForm({ aiPipelines: { mode: "some", selected: [] } }), now)).toBe("quotasInvalid");
    expect(validateAdminAction("quotas", quotaForm({ maxDoctors: { mode: "value", value: "0" } }), now)).toBeNull();
  });

  it("is sent as the quotas of the form, or as null to go back to the plan's", async () => {
    const api = fakeApi();

    await submitAdminAction("quotas", "acc-1", quotaForm({ aiAnalysesPerMonth: { mode: "value", value: "250" } }), api);
    await submitAdminAction("quotas", "acc-1", { ...quotaForm(), resetQuotas: true }, api);

    expect(api.quotas).toHaveBeenNthCalledWith(1, "acc-1", { quotas: { aiAnalysesPerMonth: 250 }, reason: "Accord commercial" });
    expect(api.quotas).toHaveBeenNthCalledWith(2, "acc-1", { quotas: null, reason: "Accord commercial" });
  });
});

describe("activating a contract on quote", () => {
  const contract = (overrides: Partial<AdminActionForm> = {}) => form({ planId: "EST_CUSTOM", reason: "Contrat n° 2026-14", until: "2027-06-30", ...overrides });

  it("needs a plan and an end date in the future", () => {
    expect(validateAdminAction("activateCustom", contract(), now)).toBeNull();
    expect(validateAdminAction("activateCustom", contract({ planId: "  " }), now)).toBe("planRequired");
    expect(validateAdminAction("activateCustom", contract({ until: "" }), now)).toBe("untilInvalid");
    expect(validateAdminAction("activateCustom", contract({ until: "pas une date" }), now)).toBe("untilInvalid");
    expect(validateAdminAction("activateCustom", contract({ until: "2026-10-01" }), now)).toBe("untilInvalid");
    expect(validateAdminAction("activateCustom", contract({ until: "2026-10-24T10:00:00.000Z" }), now)).toBe("untilInvalid");
  });

  it("is sent with the end date as an instant, and the quotas only when some are fixed", async () => {
    const api = fakeApi();
    const quotas = { ...emptyActionForm().quotas, maxDoctors: { mode: "value" as const, value: "40" } };

    await submitAdminAction("activateCustom", "acc-1", contract(), api);
    await submitAdminAction("activateCustom", "acc-1", contract({ quotas }), api);

    expect(api.activateCustom).toHaveBeenNthCalledWith(1, "acc-1", { planId: "EST_CUSTOM", reason: "Contrat n° 2026-14", until: "2027-06-30T00:00:00.000Z" });
    expect(api.activateCustom).toHaveBeenNthCalledWith(2, "acc-1", { planId: "EST_CUSTOM", quotas: { maxDoctors: 40 }, reason: "Contrat n° 2026-14", until: "2027-06-30T00:00:00.000Z" });
  });
});

describe("availableAdminActions: only what applies to the account as it stands", () => {
  const detail = (account: Partial<AdminSubscriptionDetail["account"]>, subscription: Partial<NonNullable<AdminSubscriptionDetail["subscription"]>> | null): AdminSubscriptionDetail => ({
    account: { accountStatus: "ACTIVE", accountType: "INDEPENDENT_DOCTOR", displayName: "Dr X", email: "x@example.dz", fullName: "X", id: "acc-1", phone: "", verificationStatus: "VERIFIED", ...account },
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
      status: "ACTIVE",
      trial: false,
      ...subscription,
    },
  });

  it("offers a running trial all but the contract on quote", () => {
    expect(availableAdminActions(detail({}, { status: "TRIALING", trial: true }))).toEqual(["extendTrial", "extend", "cancel", "quotas"]);
  });

  it("offers an ended trial an extension, not a stop", () => {
    expect(availableAdminActions(detail({}, { status: "EXPIRED", trial: true }))).toEqual(["extendTrial", "extend", "quotas"]);
  });

  it("offers a paid subscription a gesture, a stop and quotas", () => {
    expect(availableAdminActions(detail({}, { status: "ACTIVE" }))).toEqual(["extend", "cancel", "quotas"]);
  });

  it("offers a stopped account nothing but quotas: it subscribes again by itself", () => {
    expect(availableAdminActions(detail({}, { status: "CANCELED", trial: true }))).toEqual(["quotas"]);
    expect(availableAdminActions(detail({}, { status: "CANCELED" }))).toEqual(["quotas"]);
  });

  it("offers an account that never subscribed nothing", () => {
    expect(availableAdminActions(detail({}, null))).toEqual([]);
  });

  it("offers the contract on quote to an establishment only", () => {
    expect(availableAdminActions(detail({ accountType: "ESTABLISHMENT" }, null))).toEqual(["activateCustom"]);
    expect(availableAdminActions(detail({ accountType: "ESTABLISHMENT" }, { status: "ACTIVE" }))).toEqual(["extend", "cancel", "quotas", "activateCustom"]);
  });
});
