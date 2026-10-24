import {
  buildContentSecurityPolicy,
  createNonce,
  originOf,
  websocketOriginOf,
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

  it("lets a page frame the DICOM viewer of its own origin (/viewer/), and nothing from another", () => {
    // The viewer is a separate application served by Caddy at /viewer/, with
    // its own policy: the page only has to be allowed to frame its own origin.
    const parsed = directives(buildContentSecurityPolicy(production));

    expect(parsed.get("frame-src")).toEqual(["'self'", "blob:"]);
    expect(parsed.get("default-src")).toEqual(["'self'"]);
    // The viewer itself may not be framed by another origin: the pages forbid
    // being framed at all (frame-ancestors 'none'), the viewer's policy allows
    // 'self' only (caddy/healixdz-site.caddy).
    expect(parsed.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("lets the browser reach an API served from another origin, and its real-time socket", () => {
    const parsed = directives(
      buildContentSecurityPolicy({ ...production, apiOrigin: "http://localhost:3001" }),
    );

    expect(parsed.get("connect-src")).toEqual([
      "'self'",
      "http://localhost:3001",
      "ws://localhost:3001",
    ]);
  });

  it("allows the real-time socket of the site over wss:// in production", () => {
    const parsed = directives(
      buildContentSecurityPolicy({ ...production, apiOrigin: "https://healix.example.dz" }),
    );

    expect(parsed.get("connect-src")).toEqual([
      "'self'",
      "https://healix.example.dz",
      "wss://healix.example.dz",
    ]);
  });

  it("adds ws://localhost:3001 with next dev, next to the hot-reload socket", () => {
    const parsed = directives(
      buildContentSecurityPolicy({
        apiOrigin: "http://localhost:3001",
        development: true,
        nonce: "abc123==",
        secure: false,
      }),
    );

    expect(parsed.get("connect-src")).toEqual([
      "'self'",
      "http://localhost:3001",
      "ws://localhost:3001",
      "ws:",
      "wss:",
    ]);
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

describe("websocketOriginOf", () => {
  it("turns the API origin into the WebSocket one", () => {
    expect(websocketOriginOf("https://healix.example.dz")).toBe("wss://healix.example.dz");
    expect(websocketOriginOf("http://localhost:3001")).toBe("ws://localhost:3001");
    expect(websocketOriginOf(null)).toBeNull();
  });
});
