// What may be sent to POST /dicom/studies/upload, checked before it is: the
// same limits as the backend (backend/src/dicom/dicom-zip.ts) and Caddy (512
// MiB for this route only). The server checks them again.
export const DICOM_MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
export const DICOM_MAX_FILES = 2000;

export type DicomSelectionProblem =
  | "empty"
  | "mixedZip"
  | "tooLarge"
  | "tooManyFiles";

export type DicomSelection =
  | { files: File[]; ok: true }
  | { ok: false; problem: DicomSelectionProblem };

const isZip = (file: File) => /\.zip$/i.test(file.name);

// .dcm files (or files with no extension at all, as DICOM media carry them), or
// one .zip. Whether a file really is DICOM is for the server to say: it skips
// the others and counts them.
export function checkDicomSelection(files: readonly File[]): DicomSelection {
  if (files.length === 0) {
    return { ok: false, problem: "empty" };
  }
  const zips = files.filter(isZip).length;
  if (zips > 1 || (zips === 1 && files.length > 1)) {
    return { ok: false, problem: "mixedZip" };
  }
  if (files.length > DICOM_MAX_FILES) {
    return { ok: false, problem: "tooManyFiles" };
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > DICOM_MAX_UPLOAD_BYTES) {
    return { ok: false, problem: "tooLarge" };
  }
  return { files: [...files], ok: true };
}

// "12.4 Mo" / "12,4 Mo"-style sizes, in the unit of the language.
export function formatBytes(bytes: number, units: readonly [string, string, string, string]): string {
  if (bytes < 1024) return `${bytes} ${units[0]}`;
  const steps = [1024, 1024 ** 2, 1024 ** 3] as const;
  const index = bytes < steps[1] ? 0 : bytes < steps[2] ? 1 : 2;
  const value = bytes / steps[index];
  return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10} ${units[index + 1]}`;
}

// --- Dropped folders --------------------------------------------------------
// A DICOM disc is a folder of extensionless files: dropping it must send what
// is inside. Browsers give a dropped folder as a FileSystemEntry tree.

type EntryLike = {
  createReader?: () => { readEntries: (done: (entries: EntryLike[]) => void, fail: (error: unknown) => void) => void };
  file?: (done: (file: File) => void, fail: (error: unknown) => void) => void;
  isDirectory: boolean;
  isFile: boolean;
};

type DropLike = {
  files: ArrayLike<File>;
  items?: ArrayLike<{ kind: string; webkitGetAsEntry?: () => EntryLike | null }>;
};

const readBatch = (reader: ReturnType<NonNullable<EntryLike["createReader"]>>) =>
  new Promise<EntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));

async function collect(entry: EntryLike, out: File[], limit: number): Promise<void> {
  if (out.length > limit) return;
  if (entry.isFile && entry.file) {
    const file = entry.file;
    out.push(await new Promise<File>((resolve, reject) => file.call(entry, resolve, reject)));
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    // readEntries answers by batches (100 in Chrome): until an empty one.
    for (let batch = await readBatch(reader); batch.length > 0; batch = await readBatch(reader)) {
      for (const child of batch) {
        await collect(child, out, limit);
      }
    }
  }
}

// The files of a drop, the content of the folders included. Stops reading a
// little past the limit: the selection is refused anyway.
export async function filesOfDrop(drop: DropLike): Promise<File[]> {
  const entries: EntryLike[] = [];
  for (const item of Array.from(drop.items ?? [])) {
    const entry = item.kind === "file" ? item.webkitGetAsEntry?.() : null;
    if (entry) entries.push(entry);
  }
  // No entry API: the plain list of files.
  if (entries.length === 0) {
    return Array.from(drop.files);
  }
  const files: File[] = [];
  for (const entry of entries) {
    await collect(entry, files, DICOM_MAX_FILES);
  }
  return files;
}

// --- The viewer -------------------------------------------------------------

// OHIF is served at /viewer/ (viewer/Dockerfile); its viewer route opens the
// study the UID names. Same origin as the pages.
export function buildViewerUrl(studyInstanceUid: string): string {
  return `/viewer/viewer?StudyInstanceUIDs=${encodeURIComponent(studyInstanceUid)}`;
}

// A file every build of the viewer serves (the image's own configuration, the
// repository's in development): a request for it tells whether /viewer/ answers
// at all. Without it the frame would show the browser's own error page.
export const VIEWER_PROBE_PATH = "/viewer/app-config.js";

export function dicomStudyPagePath(
  accountType: "DOCTOR" | "ESTABLISHMENT",
  patientId: string,
  studyId: string,
): string {
  const base = accountType === "ESTABLISHMENT" ? "/establishment/patients" : "/doctor/patients";
  return `${base}/${encodeURIComponent(patientId)}/imaging/${encodeURIComponent(studyId)}`;
}
