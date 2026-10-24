import { AxiosError, type AxiosAdapter, type AxiosResponse } from "axios";

import { apiClient } from "./http-client";
import { onRateLimited, readRetryAfterSeconds } from "./rate-limit-notice";
import { type SubscriptionLimit } from "./subscription-limit";
import { onSubscriptionLimit } from "./subscription-limit-notice";

type Reply = { data?: unknown; headers?: Record<string, string>; status: number };

// Answers per "METHOD /url", in order; 200 once a script runs out.
let script: Record<string, Reply[]>;
let calls: string[];

const adapter: AxiosAdapter = async (config) => {
  const key = `${config.method?.toUpperCase()} ${config.url}`;
  calls.push(key);
  const reply = script[key]?.shift() ?? { status: 200 };
  const response: AxiosResponse = {
    config,
    data: reply.data ?? { key },
    headers: reply.headers ?? {},
    request: {},
    status: reply.status,
    statusText: String(reply.status),
  };

  if (reply.status >= 400) {
    throw new AxiosError(`Request failed with status code ${reply.status}`, "ERR_BAD_REQUEST", config, {}, response);
  }
  return response;
};

const tooMany = (seconds: number): Reply => ({ headers: { "retry-after": String(seconds) }, status: 429 });

let notices: number[];
let unsubscribe: () => void;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask"] });
  apiClient.defaults.adapter = adapter;
  script = {};
  calls = [];
  notices = [];
  unsubscribe = onRateLimited((seconds) => notices.push(seconds));
});

afterEach(() => {
  unsubscribe();
  jest.useRealTimers();
});

// Settles the request while the fake clock runs.
async function settle<T>(promise: Promise<T>, ms = 120_000) {
  const result = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error: error as AxiosError }),
  );
  await jest.advanceTimersByTimeAsync(ms);
  return result;
}

describe("apiClient on 429", () => {
  it("shows the wait, never refreshes, and sends the request again after Retry-After", async () => {
    script["GET /patients"] = [tooMany(12)];

    const pending = apiClient.get("/patients");
    await jest.advanceTimersByTimeAsync(11_000);
    expect(calls).toEqual(["GET /patients"]);

    const result = await settle(pending, 1_000);
    expect(result).toEqual({ value: expect.objectContaining({ status: 200 }) });
    expect(calls).toEqual(["GET /patients", "GET /patients"]);
    expect(notices).toEqual([12]);
  });

  it("tries once only", async () => {
    script["POST /patients"] = [tooMany(5), tooMany(5)];

    const result = await settle(apiClient.post("/patients", {}));

    expect("error" in result && result.error.response?.status).toBe(429);
    expect(calls).toEqual(["POST /patients", "POST /patients"]);
    expect(notices).toEqual([5, 5]);
  });

  it.each(["/auth/login", "/admin/auth/login", "/auth/forgot-password", "/auth/logout"])(
    "leaves %s to the user",
    async (url) => {
      script[`POST ${url}`] = [tooMany(30)];

      const result = await settle(apiClient.post(url, {}));

      expect("error" in result && result.error.response?.status).toBe(429);
      expect(calls).toEqual([`POST ${url}`]);
      expect(notices).toEqual([30]);
    },
  );

  it("does not wait longer than a minute", async () => {
    script["GET /patients"] = [tooMany(900)];

    const result = await settle(apiClient.get("/patients"));

    expect("error" in result && result.error.response?.status).toBe(429);
    expect(calls).toEqual(["GET /patients"]);
    expect(notices).toEqual([900]);
  });
});

describe("apiClient refresh on 401", () => {
  it("never turns a 429 of the refresh into a sign-out", async () => {
    script["GET /patients"] = [{ status: 401 }];
    script["POST /auth/refresh"] = [tooMany(3), tooMany(3)];

    const result = await settle(apiClient.get("/patients"));

    // The caller sees the 429, not the 401 of an expired session.
    expect("error" in result && result.error.response?.status).toBe(429);
    expect(calls).toEqual(["GET /patients", "POST /auth/refresh", "POST /auth/refresh"]);
    expect(calls).not.toContain("POST /auth/logout");
  });

  it("goes on once the refresh gets through after its wait", async () => {
    script["GET /patients"] = [{ status: 401 }];
    script["POST /auth/refresh"] = [tooMany(3)];

    const result = await settle(apiClient.get("/patients"));

    expect(result).toEqual({ value: expect.objectContaining({ status: 200 }) });
    expect(calls).toEqual(["GET /patients", "POST /auth/refresh", "POST /auth/refresh", "GET /patients"]);
  });

  it("keeps the 401 when the refresh itself says signed out", async () => {
    script["GET /patients"] = [{ status: 401 }];
    script["POST /auth/refresh"] = [{ status: 401 }];

    const result = await settle(apiClient.get("/patients"));

    expect("error" in result && result.error.response?.status).toBe(401);
    expect(calls).toEqual(["GET /patients", "POST /auth/refresh"]);
  });

  it("never turns a 5xx of the admin refresh into a sign-out", async () => {
    script["GET /admin/users"] = [{ status: 401 }];
    script["POST /admin/auth/refresh"] = [{ status: 503 }];

    const result = await settle(apiClient.get("/admin/users"));

    expect("error" in result && result.error.response?.status).toBe(503);
  });
});

describe("apiClient on the subscription's refusals", () => {
  let limits: SubscriptionLimit[];
  let unsubscribeLimits: () => void;

  beforeEach(() => {
    limits = [];
    unsubscribeLimits = onSubscriptionLimit((limit) => limits.push(limit));
  });

  afterEach(() => unsubscribeLimits());

  it("tells the dialog about a 403 QUOTA_EXCEEDED, and still rejects to the caller", async () => {
    script["POST /ai-analysis-runs"] = [{ data: { code: "QUOTA_EXCEEDED", limit: 20, quota: "aiAnalysesPerMonth", used: 20 }, status: 403 }];

    const result = await settle(apiClient.post("/ai-analysis-runs", {}));

    expect("error" in result && result.error.response?.status).toBe(403);
    expect(limits).toEqual([{ code: "QUOTA_EXCEEDED", limit: 20, quota: "aiAnalysesPerMonth", trial: false, used: 20 }]);
    // No refresh, no new attempt: a refusal is not a session problem.
    expect(calls).toEqual(["POST /ai-analysis-runs"]);
  });

  it.each([
    [{ code: "SUBSCRIPTION_INACTIVE", expiresAt: null, status: "CANCELED" }, 403, { code: "SUBSCRIPTION_INACTIVE", expiresAt: null, status: "CANCELED" }],
    [{ code: "AI_PIPELINE_NOT_IN_PLAN", pipeline: "cardio-seg-mri" }, 403, { code: "AI_PIPELINE_NOT_IN_PLAN", pipeline: "cardio-seg-mri" }],
    [{ code: "PLAN_REQUIRES_CONTACT" }, 400, { code: "PLAN_REQUIRES_CONTACT" }],
  ])("tells the dialog about %j", async (data, status, expected) => {
    script["POST /patients"] = [{ data, status }];

    await settle(apiClient.post("/patients", {}));

    expect(limits).toEqual([expected]);
  });

  it("says nothing for any other refusal", async () => {
    script["POST /patients"] = [{ data: { code: "VERIFICATION_REQUIRED" }, status: 403 }];
    script["GET /patients"] = [{ data: { message: "Introuvable." }, status: 404 }];

    await settle(apiClient.post("/patients", {}));
    await settle(apiClient.get("/patients"));

    expect(limits).toEqual([]);
  });
});

describe("readRetryAfterSeconds", () => {
  const now = Date.parse("2026-10-16T08:00:00Z");

  it("reads seconds and HTTP dates, in whole seconds", () => {
    expect(readRetryAfterSeconds("12", now)).toBe(12);
    expect(readRetryAfterSeconds(7, now)).toBe(7);
    expect(readRetryAfterSeconds("Fri, 16 Oct 2026 08:00:30 GMT", now)).toBe(30);
    expect(readRetryAfterSeconds("0", now)).toBe(1);
  });

  it("assumes the backend's one-minute window without the header", () => {
    expect(readRetryAfterSeconds(undefined, now)).toBe(60);
    expect(readRetryAfterSeconds("later", now)).toBe(60);
  });
});
