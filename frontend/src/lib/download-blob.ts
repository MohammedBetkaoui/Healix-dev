// Saves a Blob under the given file name through a temporary link.
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick: revoking synchronously can cancel the
  // download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
