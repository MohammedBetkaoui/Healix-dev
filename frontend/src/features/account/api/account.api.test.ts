import { apiClient } from "@/lib/api/http-client";

import {
  changeAccountPassword,
  getAccountProfile,
  listAccountSessions,
  revokeAccountSession,
  revokeOtherAccountSessions,
  updateAccountProfile,
} from "./account.api";

jest.mock("@/lib/api/http-client", () => ({
  apiClient: { delete: jest.fn(), get: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));

const client = apiClient as unknown as Record<"delete" | "get" | "patch" | "post", jest.Mock>;

beforeEach(() => {
  jest.resetAllMocks();
  for (const method of Object.values(client)) method.mockResolvedValue({ data: { ok: true } });
});

describe("account api", () => {
  it("reads the profile of the caller", async () => {
    await expect(getAccountProfile()).resolves.toEqual({ ok: true });
    expect(client.get).toHaveBeenCalledWith("/account");
  });

  it("patches the profile with the changed fields only", async () => {
    await updateAccountProfile({ address: "3 rue des Frères Bouadou, Alger", phone: "0661234567" });
    expect(client.patch).toHaveBeenCalledWith("/account/profile", { address: "3 rue des Frères Bouadou, Alger", phone: "0661234567" });
  });

  it("changes the password with the current and the new one", async () => {
    await changeAccountPassword({ currentPassword: "Ancien-mdp-2026", newPassword: "Nouveau-mdp-2026" });
    expect(client.post).toHaveBeenCalledWith("/account/password", { currentPassword: "Ancien-mdp-2026", newPassword: "Nouveau-mdp-2026" });
  });

  it("lists the sessions", async () => {
    await listAccountSessions();
    expect(client.get).toHaveBeenCalledWith("/account/sessions");
  });

  it("revokes one session by its encoded id, or all the others", async () => {
    await revokeAccountSession("s/1");
    await revokeOtherAccountSessions();
    expect(client.delete).toHaveBeenCalledWith("/account/sessions/s%2F1");
    expect(client.post).toHaveBeenCalledWith("/account/sessions/revoke-others");
  });

  it("lets an API error through to the caller", async () => {
    const failure = new Error("409");
    client.patch.mockRejectedValue(failure);
    await expect(updateAccountProfile({ phone: "0550000003" })).rejects.toBe(failure);
  });
});
