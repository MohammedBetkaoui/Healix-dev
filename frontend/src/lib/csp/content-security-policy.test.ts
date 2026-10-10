import {
  buildContentSecurityPolicy,
  createNonce,
  originOf,
} from "./content-security-policy";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

const production = { apiOrigin: null, development: false, nonce: "abc123==", secure: true };

describe("buildContentSecurityPolicy", () => {
  it("allows scripts by nonce only in production, never eval", () => {
    const policy = buildContentSecurityPolicy(production);
    const script = directives(policy).get("script-src");

    expect(script).toEqual(["'self'", "'nonce-abc123=='", "'strict-dynamic'"]);
    expect(policy).not.toContain("unsafe-eval");
    expect(script).not.toContain("'unsafe-inline'");
  });

  it("adds eval and the hot-reload socket in development only", () => {
    const parsed = directives(
      buildContentSecurityPolicy({ ...production, development: true, secure: false }),
    );

    expect(parsed.get("script-src")).toContain("'unsafe-eval'");
    expect(parsed.get("connect-src")).toEqual(["'self'", "ws:", "wss:"]);
  });

  it("forbids framing, plugins from the network, other origins and base or form hijacking", () => {
    const parsed = directives(buildContentSecurityPolicy(production));

    expect(parsed.get("frame-ancestors")).toEqual(["'none'"]);
    expect(parsed.get("default-src")).toEqual(["'self'"]);
    expect(parsed.get("object-src")).toEqual(["blob:"]);
    expect(parsed.get("base-uri")).toEqual(["'self'"]);
    expect(parsed.get("form-action")).toEqual(["'self'"]);
    expect(parsed.get("connect-src")).toEqual(["'self'"]);
  });

  it("lets the browser reach an API served from another origin", () => {
    const parsed = directives(
      buildContentSecurityPolicy({ ...production, apiOrigin: "http://localhost:3001" }),
    );

    expect(parsed.get("connect-src")).toEqual(["'self'", "http://localhost:3001"]);
  });

  it("upgrades insecure requests only when served over HTTPS", () => {
    expect(directives(buildContentSecurityPolicy(production)).has("upgrade-insecure-requests")).toBe(true);
    expect(
      directives(buildContentSecurityPolicy({ ...production, secure: false })).has(
        "upgrade-insecure-requests",
      ),
    ).toBe(false);
  });
});

describe("createNonce", () => {
  it("is 16 random bytes in base64, new each time", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createNonce()));

    expect(nonces.size).toBe(50);
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    }
  });
});

describe("originOf", () => {
  it("keeps scheme, host and port of an absolute URL", () => {
    expect(originOf("https://healix.example.dz/api")).toBe("https://healix.example.dz");
    expect(originOf("http://localhost:3001/api")).toBe("http://localhost:3001");
  });

  it("is null for a missing, relative or invalid URL", () => {
    expect(originOf(undefined)).toBeNull();
    expect(originOf("/api")).toBeNull();
    expect(originOf("not a url")).toBeNull();
  });
});
