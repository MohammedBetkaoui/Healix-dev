import { config } from "./proxy";

// The pages run behind the CSP proxy; /viewer (a separate application with its
// own policy) and /api (never a page) do not.
const [pattern] = config.matcher;
const matches = (path: string) => new RegExp(`^${pattern}$`).test(path);

describe("the matcher of the CSP proxy", () => {
  it.each(["/", "/login", "/doctor/patients", "/doctor/patients/p1/imaging/s1", "/viewers", "/viewerx/page", "/establishment/dashboard"])(
    "covers the page %s",
    (path) => expect(matches(path)).toBe(true),
  );

  it.each([
    "/viewer",
    "/viewer/",
    "/viewer/viewer",
    "/viewer/viewer?x",
    "/viewer/assets/app.bundle.js",
    "/api/dicomweb/studies",
    "/api/auth/local-logout",
    "/_next/static/chunk.js",
    "/favicon.ico",
    "/logo.png",
  ])("leaves %s alone", (path) => expect(matches(path.split("?")[0])).toBe(false));
});
