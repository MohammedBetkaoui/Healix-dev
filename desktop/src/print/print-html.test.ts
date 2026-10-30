import { afterEach, describe, expect, it, vi } from "vitest";
import { printHtml, PrintFailure } from "./print-html";

afterEach(() => {
  vi.useRealTimers();
});

function fakeFrame(overrides: { print?: () => void; contentWindow?: null } = {}) {
  const afterprint: Array<() => void> = [];
  const view = {
    focus: vi.fn(),
    print: overrides.print ?? vi.fn(),
    addEventListener: (_type: string, listener: () => void) => afterprint.push(listener),
  };
  const frame = {
    contentWindow: overrides.contentWindow === null ? null : view,
    srcdoc: "",
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    remove: vi.fn(),
  };
  // Loading the document fires onload as soon as srcdoc is set.
  Object.defineProperty(frame, "srcdoc", {
    set(html: string) {
      (frame as unknown as { loaded: string }).loaded = html;
      queueMicrotask(() => frame.onload?.());
    },
    get: () => "",
  });
  return { frame, view, afterprint };
}

describe("printHtml", () => {
  it("loads the document in the frame, opens the print dialog and keeps the frame until it is closed", async () => {
    const { frame, view, afterprint } = fakeFrame();
    await printHtml("<p>x</p>", { createFrame: () => frame });
    expect((frame as unknown as { loaded: string }).loaded).toBe("<p>x</p>");
    expect(view.focus).toHaveBeenCalled();
    expect(view.print).toHaveBeenCalledTimes(1);
    expect(frame.remove).not.toHaveBeenCalled();
    afterprint[0]();
    expect(frame.remove).toHaveBeenCalledTimes(1);
  });

  it("removes the frame after a while if the dialog never reports it was closed", async () => {
    vi.useFakeTimers();
    const { frame } = fakeFrame();
    const promise = printHtml("<p>x</p>", { createFrame: () => frame, keepMs: 5_000 });
    await vi.advanceTimersByTimeAsync(0);
    await promise;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(frame.remove).toHaveBeenCalled();
  });

  it("reports a failure when the frame cannot print, and leaves nothing behind", async () => {
    const withoutWindow = fakeFrame({ contentWindow: null });
    await expect(printHtml("<p>x</p>", { createFrame: () => withoutWindow.frame })).rejects.toBeInstanceOf(PrintFailure);
    expect(withoutWindow.frame.remove).toHaveBeenCalled();

    const throwing = fakeFrame({ print: () => { throw new Error("blocked"); } });
    await expect(printHtml("<p>x</p>", { createFrame: () => throwing.frame })).rejects.toBeInstanceOf(PrintFailure);
    expect(throwing.frame.remove).toHaveBeenCalled();
  });
});
