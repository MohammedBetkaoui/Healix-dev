import {
  buildViewerUrl,
  checkDicomSelection,
  DICOM_MAX_FILES,
  DICOM_MAX_UPLOAD_BYTES,
  dicomStudyPagePath,
  filesOfDrop,
  formatBytes,
} from "./dicom-import";

const file = (name: string, size = 10) => {
  const created = new File(["x"], name);
  Object.defineProperty(created, "size", { value: size });
  return created;
};

describe("checkDicomSelection", () => {
  it("accepts several DICOM files, with or without an extension", () => {
    const files = [file("IM0001.dcm"), file("IM0002"), file("DICOMDIR")];

    expect(checkDicomSelection(files)).toEqual({ files, ok: true });
  });

  it("accepts one ZIP", () => {
    const zip = file("etude.ZIP", 5000);

    expect(checkDicomSelection([zip])).toEqual({ files: [zip], ok: true });
  });

  it("refuses an empty selection", () => {
    expect(checkDicomSelection([])).toEqual({ ok: false, problem: "empty" });
  });

  it("refuses a ZIP with other files, and two ZIPs", () => {
    expect(checkDicomSelection([file("a.zip"), file("b.dcm")])).toEqual({
      ok: false,
      problem: "mixedZip",
    });
    expect(checkDicomSelection([file("a.zip"), file("b.zip")])).toEqual({
      ok: false,
      problem: "mixedZip",
    });
  });

  it("refuses more than 2 000 files", () => {
    const files = Array.from({ length: DICOM_MAX_FILES + 1 }, (_, index) => file(`${index}.dcm`));

    expect(checkDicomSelection(files)).toEqual({ ok: false, problem: "tooManyFiles" });
    expect(checkDicomSelection(files.slice(0, DICOM_MAX_FILES)).ok).toBe(true);
  });

  it("refuses more than 512 MiB in all, and accepts exactly 512 MiB", () => {
    expect(checkDicomSelection([file("a.dcm", DICOM_MAX_UPLOAD_BYTES), file("b.dcm", 1)])).toEqual({
      ok: false,
      problem: "tooLarge",
    });
    expect(checkDicomSelection([file("a.dcm", DICOM_MAX_UPLOAD_BYTES)]).ok).toBe(true);
  });
});

describe("filesOfDrop", () => {
  const fileEntry = (name: string) => ({
    file: (done: (file: File) => void) => done(new File(["x"], name)),
    isDirectory: false,
    isFile: true,
  });
  const directoryEntry = (children: unknown[], batchSize = 2) => ({
    createReader: () => {
      let offset = 0;
      return {
        // As the browsers do: by batches, then an empty one.
        readEntries: (done: (entries: unknown[]) => void) => {
          done(children.slice(offset, offset + batchSize));
          offset += batchSize;
        },
      };
    },
    isDirectory: true,
    isFile: false,
  });
  const item = (entry: unknown) => ({ kind: "file", webkitGetAsEntry: () => entry });

  it("reads the content of a dropped folder, subfolders and batches included", async () => {
    const folder = directoryEntry([
      fileEntry("DICOMDIR"),
      directoryEntry([fileEntry("IM1"), fileEntry("IM2"), fileEntry("IM3")]),
      fileEntry("IM4"),
    ]);

    const files = await filesOfDrop({ files: [], items: [item(folder)] } as never);

    expect(files.map((f) => f.name).sort()).toEqual(["DICOMDIR", "IM1", "IM2", "IM3", "IM4"]);
  });

  it("reads loose files dropped together with a folder", async () => {
    const files = await filesOfDrop({
      files: [],
      items: [item(fileEntry("a.dcm")), item(directoryEntry([fileEntry("b.dcm")]))],
    } as never);

    expect(files.map((f) => f.name).sort()).toEqual(["a.dcm", "b.dcm"]);
  });

  it("falls back on the plain list when the browser has no entry API", async () => {
    const plain = [file("a.dcm"), file("b.dcm")];

    await expect(filesOfDrop({ files: plain })).resolves.toEqual(plain);
    await expect(
      filesOfDrop({ files: plain, items: [{ kind: "file" }, { kind: "string" }] } as never),
    ).resolves.toEqual(plain);
  });

  it("stops reading a giant folder a little past the limit", async () => {
    const huge = directoryEntry(
      Array.from({ length: DICOM_MAX_FILES * 2 }, (_, index) => fileEntry(`IM${index}`)),
      500,
    );

    const files = await filesOfDrop({ files: [], items: [item(huge)] } as never);

    expect(files.length).toBeGreaterThan(DICOM_MAX_FILES);
    expect(files.length).toBeLessThan(DICOM_MAX_FILES * 2);
  });
});

describe("formatBytes", () => {
  const units: [string, string, string, string] = ["o", "Ko", "Mo", "Go"];

  it.each([
    [0, "0 o"],
    [1023, "1023 o"],
    [1024, "1 Ko"],
    [1536, "1.5 Ko"],
    [5 * 1024 * 1024, "5 Mo"],
    [123.4 * 1024 * 1024, "123 Mo"],
    [3_000_000_000, "2.8 Go"],
  ])("writes %d bytes as %s", (bytes, expected) => {
    expect(formatBytes(bytes, units)).toBe(expected);
  });
});

describe("the viewer", () => {
  it("opens the study by its UID, on the same origin, under /viewer/", () => {
    expect(buildViewerUrl("1.2.826.0.1.3680043.8.498.1")).toBe(
      "/viewer/viewer?StudyInstanceUIDs=1.2.826.0.1.3680043.8.498.1",
    );
  });

  it("encodes a UID that would break the query", () => {
    expect(buildViewerUrl("1.2&x=3 4")).toBe("/viewer/viewer?StudyInstanceUIDs=1.2%26x%3D3%204");
  });

  it("builds the page of a study for each kind of account", () => {
    expect(dicomStudyPagePath("DOCTOR", "p 1", "s1")).toBe("/doctor/patients/p%201/imaging/s1");
    expect(dicomStudyPagePath("ESTABLISHMENT", "p1", "s1")).toBe(
      "/establishment/patients/p1/imaging/s1",
    );
  });
});
