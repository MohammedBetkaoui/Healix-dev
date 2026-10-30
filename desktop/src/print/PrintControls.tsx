import { useState } from "react";
import { Download, Printer, TriangleAlert } from "lucide-react";
import { Button, Notice } from "../dashboard-ui";
import { recordPrescriptionPrint } from "../desktop-api";
import { fr } from "../i18n/fr";
import { downloadHtml, printHtml } from "./print-html";

type Phase = { kind: "idle" } | { kind: "busy" } | { kind: "failed"; html: string } | { kind: "unrecorded" };

// The "Imprimer" button of a prescription: it notes the print in the local audit
// trail, then opens the print dialog of the system. If the dialog cannot be
// opened here, the same page is offered as a file.
export function PrintControls({ prepare, filename, disabledReason }: {
  // The page to print, and the local id of the prescription it belongs to (an
  // editor saves its draft first). null: nothing to print, the reason was shown.
  prepare: () => Promise<{ html: string; localId: string } | null>;
  filename: string;
  // Why printing is not possible right now, if it is not.
  disabledReason?: string | null;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "busy";

  const print = async () => {
    setPhase({ kind: "busy" });
    let prepared: Awaited<ReturnType<typeof prepare>> = null;
    try {
      prepared = await prepare();
    } catch {
      setPhase({ kind: "idle" });
      return;
    }
    if (!prepared) {
      setPhase({ kind: "idle" });
      return;
    }
    let recorded = true;
    try {
      await recordPrescriptionPrint(prepared.localId);
    } catch {
      recorded = false;
    }
    try {
      await printHtml(prepared.html);
      setPhase(recorded ? { kind: "idle" } : { kind: "unrecorded" });
    } catch {
      setPhase({ kind: "failed", html: prepared.html });
    }
  };

  return (
    <div className="flex flex-col items-end gap-2" data-print-controls="">
      <Button variant="outline" disabled={busy || Boolean(disabledReason)} title={disabledReason ?? undefined} onClick={() => void print()}>
        <Printer className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        {busy ? fr.print.printing : fr.print.button}
      </Button>
      {disabledReason ? <p className="max-w-sm text-end text-xs text-[var(--ink-faint)]">{disabledReason}</p> : null}
      {phase.kind === "unrecorded" ? (
        <Notice tone="danger" icon={<TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />}>{fr.print.unrecorded}</Notice>
      ) : null}
      {phase.kind === "failed" ? (
        <div className="flex max-w-md flex-col items-end gap-2">
          <Notice tone="danger" icon={<TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />}>{fr.print.failed}</Notice>
          <Button variant="secondary" size="sm" onClick={() => downloadHtml(phase.html, filename)}>
            <Download className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            {fr.print.download}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
