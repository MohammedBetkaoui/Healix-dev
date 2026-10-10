import {
  DEFAULT_API_URL,
  getServerApiUrl,
  selectServerApiUrl,
} from "./server-api-url";

describe("selectServerApiUrl", () => {
  it("prefers the internal address when it is set", () => {
    expect(
      selectServerApiUrl("http://backend:3001/api", "https://healix.example.dz/api"),
    ).toBe("http://backend:3001/api");
  });

  it("drops a trailing slash and surrounding spaces from the internal address", () => {
    expect(selectServerApiUrl("  http://backend:3001/api/ ", undefined)).toBe(
      "http://backend:3001/api",
    );
  });

  it("falls back to the browser's address when the internal one is unset or blank", () => {
    expect(selectServerApiUrl(undefined, "https://healix.example.dz/api")).toBe(
      "https://healix.example.dz/api",
    );
    expect(selectServerApiUrl("   ", "https://healix.example.dz/api")).toBe(
      "https://healix.example.dz/api",
    );
  });

  it("keeps the historical default without any setting", () => {
    expect(selectServerApiUrl(undefined, undefined)).toBe(DEFAULT_API_URL);
    expect(selectServerApiUrl("", "")).toBe("http://localhost:3001/api");
  });
});

describe("getServerApiUrl", () => {
  const saved = {
    internal: process.env.API_INTERNAL_URL,
    public: process.env.NEXT_PUBLIC_API_URL,
  };

  afterEach(() => {
    process.env.API_INTERNAL_URL = saved.internal;
    process.env.NEXT_PUBLIC_API_URL = saved.public;
    if (saved.internal === undefined) delete process.env.API_INTERNAL_URL;
    if (saved.public === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("reads API_INTERNAL_URL at call time, not once at import", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://healix.example.dz/api";
    delete process.env.API_INTERNAL_URL;
    expect(getServerApiUrl()).toBe("https://healix.example.dz/api");

    process.env.API_INTERNAL_URL = "http://backend:3001/api";
    expect(getServerApiUrl()).toBe("http://backend:3001/api");
  });
});
