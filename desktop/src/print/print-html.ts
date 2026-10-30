// Prints an HTML document with the system print dialog, from a hidden frame:
// on Windows it is the dialog of the system, where "Microsoft Print to PDF"
// gives a PDF. Whether the WebView lets the frame print is not guaranteed on
// every machine: a failure is reported, and `downloadHtml` offers the same page
// to open in a browser.

type FrameLike = {
  contentWindow: { focus(): void; print(): void; addEventListener?(type: string, listener: () => void): void } | null;
  srcdoc: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  remove(): void;
};

type Options = {
  // For tests.
  createFrame?: () => FrameLike;
  // The frame stays until the dialog is closed; this is the longest it is kept.
  keepMs?: number;
};

export class PrintFailure extends Error {}

function defaultFrame(): FrameLike {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  return frame as unknown as FrameLike;
}

export async function printHtml(html: string, options: Options = {}): Promise<void> {
  const frame = (options.createFrame ?? defaultFrame)();
  try {
    await new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      frame.onerror = () => reject(new PrintFailure("frame"));
      frame.srcdoc = html;
    });
    const view = frame.contentWindow;
    if (!view || typeof view.print !== "function") throw new PrintFailure("print unavailable");
    // The frame is removed once the dialog is closed, never while it is open.
    const remove = () => frame.remove();
    view.addEventListener?.("afterprint", remove);
    window.setTimeout(remove, options.keepMs ?? 120_000);
    view.focus();
    view.print();
  } catch (cause) {
    frame.remove();
    throw cause instanceof PrintFailure ? cause : new PrintFailure(String(cause));
  }
}

// The same page as a file, to open in a browser and print or save as PDF there.
export function downloadHtml(html: string, filename: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
