import { checkViewerAvailable } from "./dicom.api";
import { VIEWER_PROBE_PATH } from "./dicom-import";

describe("checkViewerAvailable", () => {
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();

  beforeEach(() => {
    fetchMock.mockReset();
    jest.spyOn(global, "fetch").mockImplementation((url, init) => fetchMock(String(url), init ?? {}));
  });
  afterEach(() => jest.restoreAllMocks());

  it("asks /viewer/app-config.js by HEAD, on this origin, never from a cache", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await checkViewerAvailable();

    expect(VIEWER_PROBE_PATH).toBe("/viewer/app-config.js");
    expect(fetchMock).toHaveBeenCalledWith(VIEWER_PROBE_PATH, {
      cache: "no-store",
      credentials: "same-origin",
      method: "HEAD",
    });
  });

  it("is true when the viewer answers", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await expect(checkViewerAvailable()).resolves.toBe(true);
  });

  it.each([404, 500, 502, 503])("is false when /viewer/ answers %i (nothing behind it, or the page of Next.js)", async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));

    await expect(checkViewerAvailable()).resolves.toBe(false);
  });

  it("is false, not an error, when the request cannot be made", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(checkViewerAvailable()).resolves.toBe(false);
  });
});
