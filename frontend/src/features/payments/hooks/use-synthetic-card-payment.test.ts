import { QueryClient } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

import { entitlementsQueryKey } from "@/features/subscriptions/hooks/use-entitlements";
import { type Entitlements } from "@/features/subscriptions/types/entitlements.types";

import { type paySyntheticChargily } from "../api/payments.api";
import { isCardDeclined, outcomeOfPayment, payByCard } from "./use-synthetic-card-payment";

function axiosError(status: number, data: unknown) {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = { config, data, headers: {}, status, statusText: "" };
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, {}, response);
}

const card = { cardHolderName: "BARKAOUI MOURAD", cardNumber: "1234123412341234", expiryMonth: "09", expiryYear: "2030", psv: "353" };

const trialing: Entitlements = {
  canManage: true,
  daysLeft: 9,
  expiresAt: "2026-11-02T12:00:00.000Z",
  plan: { code: "DOCTOR_PRO", custom: false, id: "p", name: "Pro" },
  quotas: { aiAnalysesPerMonth: 10, aiPipelines: null, maxDoctors: 1, maxPatients: null },
  readOnly: false,
  status: "TRIALING",
  trial: true,
  usage: { aiAnalysesThisMonth: 10, doctors: 1, patients: 3 },
};
const active: Entitlements = {
  ...trialing,
  daysLeft: 40,
  expiresAt: "2026-12-02T12:00:00.000Z",
  quotas: { aiAnalysesPerMonth: 100, aiPipelines: ["brain"], maxDoctors: 1, maxPatients: null },
  status: "ACTIVE",
  trial: false,
  usage: { aiAnalysesThisMonth: 0, doctors: 1, patients: 3 },
};

// A client that knows what the server would answer after the payment, for the
// data the subscription screens read.
function clientWith(serverState: { entitlements: Entitlements }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryDefaults(entitlementsQueryKey, { queryFn: () => Promise.resolve(serverState.entitlements) });
  client.setQueryData(entitlementsQueryKey, trialing);
  client.setQueryDefaults(["auth", "me"], { queryFn: () => Promise.resolve({ accountStatus: "ACTIVE" }) });
  client.setQueryData(["auth", "me"], { accountStatus: "VERIFIED_NO_PLAN" });
  return client;
}

const paid = {
  message: "Paiement demo accepte. Abonnement active.",
  payment: {} as never,
  subscription: { expiresAt: "2026-12-02T12:00:00.000Z", id: "sub-1", startedAt: "2026-10-24T01:00:00.000Z", status: "ACTIVE", trial: false },
  subscriptionId: "sub-1",
};

describe("payByCard", () => {
  it("answers paid, and the subscription and the usage on screen are the new ones by then", async () => {
    const server = { entitlements: trialing };
    const client = clientWith(server);
    const pay = jest.fn<ReturnType<typeof paySyntheticChargily>, Parameters<typeof paySyntheticChargily>>().mockImplementation(async () => {
      // The payment has changed the subscription on the server.
      server.entitlements = active;
      return paid;
    });

    const outcome = await payByCard("pay-1", card, client, pay);

    expect(pay).toHaveBeenCalledWith("pay-1", card);
    expect(outcome).toEqual({ kind: "paid", subscription: paid.subscription });
    // Awaited: when the screen says "active", the data behind it is fresh.
    expect(client.getQueryData<Entitlements>(entitlementsQueryKey)).toMatchObject({
      quotas: { aiAnalysesPerMonth: 100 },
      status: "ACTIVE",
      trial: false,
      usage: { aiAnalysesThisMonth: 0 },
    });
    expect(client.getQueryData(["auth", "me"])).toEqual({ accountStatus: "ACTIVE" });
  });

  it("refreshes the subscription pages and the current user once paid", async () => {
    const client = clientWith({ entitlements: active });
    const invalidate = jest.spyOn(client, "invalidateQueries");

    await payByCard("pay-1", card, client, jest.fn().mockResolvedValue(paid));

    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(expect.arrayContaining([["subscription"], ["auth", "me"], ["payments", "status", "pay-1"]]));
    // "all": the queries of the pages that are not on screen too.
    expect(invalidate.mock.calls.find(([filters]) => filters?.queryKey?.[0] === "subscription")?.[0]).toMatchObject({ refetchType: "all" });
  });

  it("answers declined for a refused card, and leaves the subscription as it is", async () => {
    const client = clientWith({ entitlements: trialing });
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const pay = jest.fn().mockRejectedValue(axiosError(400, { code: "PAYMENT_DECLINED", message: "Paiement refuse." }));

    const outcome = await payByCard("pay-1", { ...card, cardNumber: "4000000000000002" }, client, pay);

    expect(outcome).toEqual({ kind: "declined" });
    expect(client.getQueryData(entitlementsQueryKey)).toBe(trialing);
    // Only the status of that payment (FAILED now) is read again.
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([["payments", "status", "pay-1"]]);
  });

  it("answers an error with a message for anything else", async () => {
    const client = clientWith({ entitlements: trialing });
    const pay = jest.fn().mockRejectedValue(axiosError(409, { message: "Ce paiement est deja valide." }));

    const outcome = await payByCard("pay-1", card, client, pay);

    expect(outcome.kind).toBe("error");
    expect(client.getQueryData(entitlementsQueryKey)).toBe(trialing);
  });
});

describe("outcomeOfPayment", () => {
  it("keeps the outcome for the payment it came from", () => {
    expect(outcomeOfPayment({ outcome: { kind: "declined" }, paymentId: "pay-1" }, "pay-1")).toEqual({ kind: "declined" });
  });

  it("starts the next attempt clean: the refusal of the previous card is not shown on the new payment", () => {
    // « Réessayer avec une autre carte » opens a new payment on the same page.
    expect(outcomeOfPayment({ outcome: { kind: "declined" }, paymentId: "pay-1" }, "pay-2")).toBeNull();
    expect(outcomeOfPayment({ outcome: { kind: "error", message: "x" }, paymentId: "pay-1" }, "pay-2")).toBeNull();
  });

  it("has no outcome before any attempt", () => {
    expect(outcomeOfPayment(null, "pay-1")).toBeNull();
  });
});

describe("isCardDeclined", () => {
  it("recognizes the 400 PAYMENT_DECLINED of the gateway only", () => {
    expect(isCardDeclined(axiosError(400, { code: "PAYMENT_DECLINED" }))).toBe(true);
    expect(isCardDeclined(axiosError(400, { code: "VALIDATION_ERROR" }))).toBe(false);
    expect(isCardDeclined(axiosError(409, { code: "PAYMENT_DECLINED" }))).toBe(false);
    expect(isCardDeclined(new Error("network"))).toBe(false);
  });
});
