import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

import { getPaymentAlreadyPendingId } from "./api-error";

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

const pendingBody = {
  code: "PAYMENT_ALREADY_PENDING",
  message: "Un paiement est déjà en cours de vérification.",
  paymentId: "pay-review",
};

describe("getPaymentAlreadyPendingId", () => {
  it("returns the payment id of a PAYMENT_ALREADY_PENDING 409", () => {
    expect(getPaymentAlreadyPendingId(axiosError(409, pendingBody))).toBe("pay-review");
  });

  it("returns null for a 409 without that code", () => {
    // e.g. "Ce paiement est deja valide." (plain Nest ConflictException)
    expect(
      getPaymentAlreadyPendingId(
        axiosError(409, { error: "Conflict", message: "Ce paiement est deja valide.", statusCode: 409 }),
      ),
    ).toBeNull();
    // An id alone is not enough: the code is what identifies this conflict.
    expect(
      getPaymentAlreadyPendingId(axiosError(409, { ...pendingBody, code: "OTHER_CONFLICT" })),
    ).toBeNull();
  });

  it("returns null when the 409 carries the code but no usable id", () => {
    const withoutId = { code: pendingBody.code, message: pendingBody.message };

    expect(getPaymentAlreadyPendingId(axiosError(409, withoutId))).toBeNull();
    expect(getPaymentAlreadyPendingId(axiosError(409, { ...pendingBody, paymentId: "" }))).toBeNull();
  });

  it("returns null for the same body on another status (403)", () => {
    expect(getPaymentAlreadyPendingId(axiosError(403, pendingBody))).toBeNull();
  });

  it("returns null for a non-axios error or a network error", () => {
    expect(getPaymentAlreadyPendingId(new Error("boom"))).toBeNull();
    expect(getPaymentAlreadyPendingId(new AxiosError("Network Error"))).toBeNull();
    expect(getPaymentAlreadyPendingId(undefined)).toBeNull();
  });
});
