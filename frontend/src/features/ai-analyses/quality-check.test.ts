import {
  evaluateQualityChecks,
  getFileExtension,
  isDicomDocument,
  MIN_IMAGE_SIDE_PX,
  type ImageProbe,
} from "./quality-check";

const decoded = (width: number, height: number): ImageProbe => ({
  state: "decoded",
  height,
  width,
});

const statusOf = (report: ReturnType<typeof evaluateQualityChecks>, key: string) =>
  report.checks.find((check) => check.key === key)?.status;

describe("format check", () => {
  it("refuses a format the model does not accept, and blocks", () => {
    const report = evaluateQualityChecks({
      acceptedFormats: ["png"],
      fileName: "irm.jpeg",
      probe: decoded(512, 512),
    });

    expect(statusOf(report, "format")).toBe("fail");
    expect(report.canContinue).toBe(false);
  });

  it("accepts a listed format, case-insensitively, jpg and jpeg alike", () => {
    for (const fileName of ["irm.PNG", "irm.jpg", "irm.jpeg"]) {
      const report = evaluateQualityChecks({
        acceptedFormats: ["png", ".JPEG"],
        fileName,
        probe: decoded(512, 512),
      });

      expect(statusOf(report, "format")).toBe("pass");
      expect(report.canContinue).toBe(true);
    }
  });

  it("refuses a file without extension when formats are known", () => {
    const report = evaluateQualityChecks({
      acceptedFormats: ["png"],
      fileName: "irm",
      probe: decoded(512, 512),
    });

    expect(statusOf(report, "format")).toBe("fail");
  });

  it("shows 'non renseigné' without blocking when the registry gives no format (null)", () => {
    const report = evaluateQualityChecks({
      acceptedFormats: null,
      fileName: "irm.png",
      probe: decoded(512, 512),
    });

    expect(report.checks[0]).toEqual({
      key: "format",
      status: "not_provided",
      detail: { extension: "png" },
    });
    expect(report.canContinue).toBe(true);
  });
});

describe("decoding and dimensions", () => {
  it("passes a decoded image of at least the minimum size", () => {
    const report = evaluateQualityChecks({
      acceptedFormats: null,
      fileName: "irm.png",
      probe: decoded(MIN_IMAGE_SIDE_PX, MIN_IMAGE_SIDE_PX),
    });

    expect(statusOf(report, "decodable")).toBe("pass");
    expect(statusOf(report, "dimensions")).toBe("pass");
  });

  it("blocks an image smaller than the minimum on either side", () => {
    const report = evaluateQualityChecks({
      acceptedFormats: null,
      fileName: "irm.png",
      probe: decoded(1024, MIN_IMAGE_SIDE_PX - 1),
    });

    expect(statusOf(report, "dimensions")).toBe("fail");
    expect(report.canContinue).toBe(false);
  });

  it.each(["undecodable", "unavailable"] as const)(
    "blocks a file that is %s",
    (state) => {
      const report = evaluateQualityChecks({
        acceptedFormats: null,
        fileName: "compte-rendu.pdf",
        probe: { state },
      });

      expect(statusOf(report, "decodable")).toBe("fail");
      expect(statusOf(report, "dimensions")).toBe("not_applicable");
      expect(report.canContinue).toBe(false);
    },
  );

  it("does not block a DICOM file, which is not previewed at this step", () => {
    const report = evaluateQualityChecks({
      acceptedFormats: null,
      fileName: "serie.dcm",
      probe: { state: "dicom" },
    });

    expect(statusOf(report, "decodable")).toBe("not_applicable");
    expect(statusOf(report, "dimensions")).toBe("not_applicable");
    expect(report.canContinue).toBe(true);
  });

  it("waits while the image is being decoded", () => {
    const report = evaluateQualityChecks({
      acceptedFormats: null,
      fileName: "irm.png",
      probe: { state: "pending" },
    });

    expect(report.canContinue).toBe(false);
  });
});

describe("file helpers", () => {
  it("reads the extension in lowercase", () => {
    expect(getFileExtension("IRM.Axiale.PNG")).toBe("png");
    expect(getFileExtension("archive")).toBe("");
    expect(getFileExtension(".hidden")).toBe("");
    expect(getFileExtension("trailing.")).toBe("");
  });

  it("recognizes DICOM by type, MIME type or extension", () => {
    const base = { fileName: "image.png", mimeType: "image/png", type: "MEDICAL_IMAGE" as const };

    expect(isDicomDocument(base)).toBe(false);
    expect(isDicomDocument({ ...base, type: "DICOM" })).toBe(true);
    expect(isDicomDocument({ ...base, mimeType: "application/dicom" })).toBe(true);
    expect(isDicomDocument({ ...base, fileName: "serie.DCM", mimeType: "" })).toBe(true);
  });
});
