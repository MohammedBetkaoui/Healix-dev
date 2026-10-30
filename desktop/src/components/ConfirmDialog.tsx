import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "../dashboard-ui";
import { fr } from "../i18n/fr";

// In-app confirmation (never alert/confirm), styled like the Web workspace
// dialogs. "Cancel" holds the focus when it opens; Escape cancels.
export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    // jsdom (tests) has no showModal: the dialog is then simply open.
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    cancelRef.current?.focus();
    return () => {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="workspace-search-dialog surface-raised"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="text-base font-semibold">{title}</h2>
        <button type="button" className="clinical-icon-button" onClick={onCancel} aria-label={fr.nav.close}><X size={18} /></button>
      </div>
      <div id={`${id}-body`} className="space-y-3 text-sm text-[var(--ink-soft)]">{children}</div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button ref={cancelRef} variant="outline" onClick={onCancel}>{fr.account.cancel}</Button>
        <Button onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </dialog>
  );
}
