import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

import { keepSessionAlive, SESSION_KEEP_ALIVE_MS } from "./use-session-keep-alive";

jest.mock("@/lib/api/http-client", () => ({ apiClient: { post: jest.fn() } }));

function refused(status: number) {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = { config, data: {}, headers: {}, status, statusText: "" };
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, {}, response);
}

describe("keepSessionAlive", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("renews the session at once, then every 10 minutes", async () => {
    const refresh = jest.fn().mockResolvedValue({});
    const stop = keepSessionAlive({ onEnded: jest.fn(), refresh });

    expect(SESSION_KEEP_ALIVE_MS).toBe(10 * 60 * 1000);
    expect(refresh).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(SESSION_KEEP_ALIVE_MS - 1);
    expect(refresh).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(SESSION_KEEP_ALIVE_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(4);

    stop();
  });

  it("stops when the page goes away", async () => {
    const refresh = jest.fn().mockResolvedValue({});
    const stop = keepSessionAlive({ onEnded: jest.fn(), refresh });

    stop();
    await jest.advanceTimersByTimeAsync(SESSION_KEEP_ALIVE_MS * 3);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])("says the session is over, and stops, when the refresh is refused (%i)", async (status) => {
    const refresh = jest.fn().mockRejectedValue(refused(status));
    const onEnded = jest.fn();
    keepSessionAlive({ onEnded, refresh });

    await jest.advanceTimersByTimeAsync(0);
    expect(onEnded).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(SESSION_KEEP_ALIVE_MS * 3);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("tries again at the next tick after a network error or a 5xx: they say nothing of the session", async () => {
    const refresh = jest
      .fn()
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockRejectedValueOnce(refused(503))
      .mockResolvedValue({});
    const onEnded = jest.fn();
    const stop = keepSessionAlive({ onEnded, refresh });

    await jest.advanceTimersByTimeAsync(SESSION_KEEP_ALIVE_MS * 2);

    expect(refresh).toHaveBeenCalledTimes(3);
    expect(onEnded).not.toHaveBeenCalled();
    stop();
  });

  it("refreshes with POST /auth/refresh of the HTTP client by default", async () => {
    const { apiClient } = jest.requireMock("@/lib/api/http-client") as {
      apiClient: { post: jest.Mock };
    };
    apiClient.post.mockResolvedValue({});

    const stop = keepSessionAlive({ onEnded: jest.fn() });
    await jest.advanceTimersByTimeAsync(0);

    expect(apiClient.post).toHaveBeenCalledWith("/auth/refresh");
    stop();
  });
});
