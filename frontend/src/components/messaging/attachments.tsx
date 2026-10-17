"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Download, FileText, FolderOpen, ImageIcon, Paperclip, RotateCcw, X } from "lucide-react";

import { type Locale } from "@/i18n";
import { type CaseMessagingCopy } from "@/features/messaging/case-messaging.copy";
import { attachRecordDocument, downloadAttachment } from "@/features/messaging/messaging.api";
import { formatFileSize, formatNumber } from "@/features/messaging/messaging-format";
import { useAttachmentBlob } from "@/features/messaging/messaging.queries";
import { isImageAttachment } from "@/features/messaging/messaging-rules";
import { type MessageAttachment, type UploadedAttachment } from "@/features/messaging/messaging.types";
import { type DraftAttachment } from "@/features/messaging/use-draft-attachments";
import { usePatientDocuments } from "@/features/patients/hooks/use-patient-documents";
import { cn } from "@/lib/utils";

// The files of a message: never a public URL. Images are fetched with the
// session and shown from a blob: URL; a download goes the same way.

// Saves an attachment under its name, from an authenticated request.
async function saveAttachment(attachment: { id: string; originalName: string }): Promise<void> {
  const blob = await downloadAttachment(attachment.id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.originalName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// --- In the composer ------------------------------------------------------------------

export function DraftAttachmentList({
  copy,
  drafts,
  locale,
  onRemove,
  onRetry,
}: {
  drafts: DraftAttachment[];
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
  copy: CaseMessagingCopy;
  locale: Locale;
}) {
  if (drafts.length === 0) return null;

  return (
    <ul aria-label={copy.composer.attachments} className="mb-2 flex flex-wrap gap-2">
      {drafts.map((draft) => {
        const percent = formatNumber(Math.round(draft.progress * 100), locale);
        return (
          <li
            key={draft.key}
            className={cn(
              "flex w-full max-w-64 items-center gap-2 rounded-[var(--radius-sm)] border bg-[var(--surface)] p-1.5 text-xs sm:w-auto",
              draft.status === "failed" ? "border-[var(--danger-line)]" : "border-[var(--border)]",
            )}
          >
            {draft.previewUrl ? (
              // A local preview of the chosen image (blob: URL).
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.previewUrl} alt="" className="h-10 w-10 shrink-0 rounded-[var(--radius-xs)] object-cover" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--surface-muted)] text-[var(--text-secondary)]">
                {isImageAttachment(draft) ? <ImageIcon size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-[var(--text-primary)]" title={draft.name}><bdi>{draft.name}</bdi></span>
              {draft.status === "uploading" ? (
                <span className="mt-1 block">
                  <span
                    role="progressbar"
                    aria-label={copy.composer.uploading(percent)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(draft.progress * 100)}
                    className="block h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]"
                  >
                    <span className="block h-full bg-[var(--medical)] transition-[width]" style={{ width: `${Math.round(draft.progress * 100)}%` }} />
                  </span>
                  <span className="mt-0.5 block text-[.65rem] text-[var(--text-secondary)]">{copy.composer.uploading(percent)}</span>
                </span>
              ) : draft.status === "failed" ? (
                <span role="alert" className="block text-[.68rem] text-[var(--danger-ink)]">
                  {copy.composer.uploadFailed}
                  {draft.errorText ? ` : ${draft.errorText}` : ""}
                </span>
              ) : (
                <span className="block text-[.68rem] text-[var(--text-secondary)]">{formatFileSize(draft.sizeBytes, locale)}</span>
              )}
            </span>
            {draft.status === "failed" && draft.file ? (
              <button type="button" className="clinical-icon-button h-7 min-w-7" onClick={() => onRetry(draft.key)}
                aria-label={copy.composer.retryUpload} title={copy.composer.retryUpload}>
                <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" />
              </button>
            ) : null}
            <button type="button" className="clinical-icon-button h-7 min-w-7" onClick={() => onRemove(draft.key)}
              aria-label={copy.composer.remove(draft.name)} title={copy.composer.remove(draft.name)}>
              <X size={14} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// --- In a message -------------------------------------------------------------------------

export function MessageAttachments({
  attachments,
  copy,
  locale,
}: {
  attachments: MessageAttachment[];
  copy: CaseMessagingCopy;
  locale: Locale;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (attachments.length === 0) return null;

  const download = (attachment: MessageAttachment) => {
    setFailed(null);
    saveAttachment(attachment).catch(() => setFailed(attachment.id));
  };

  return (
    <ul aria-label={copy.message.attachments} className="mb-1.5 flex flex-col gap-1.5">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          {isImageAttachment(attachment) ? (
            <AttachmentImage attachment={attachment} copy={copy} onOpen={() => download(attachment)} />
          ) : null}
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs">
            {isImageAttachment(attachment) ? (
              <ImageIcon size={16} strokeWidth={1.7} aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" />
            ) : (
              <FileText size={16} strokeWidth={1.7} aria-hidden="true" className="shrink-0 text-[var(--danger-ink)]" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-[var(--text-primary)]" title={attachment.originalName}>
                <bdi>{attachment.originalName}</bdi>
              </span>
              <span className="flex flex-wrap items-center gap-x-1.5 text-[.66rem] text-[var(--text-secondary)]">
                {formatFileSize(attachment.sizeBytes, locale)}
                {attachment.fromRecord ? (
                  <span className="inline-flex items-center gap-1">
                    · <FolderOpen size={11} aria-hidden="true" />{copy.message.fromRecord}
                  </span>
                ) : null}
              </span>
            </span>
            <button type="button" className="clinical-icon-button h-8 min-w-8" onClick={() => download(attachment)}
              aria-label={copy.message.download(attachment.originalName)} title={copy.message.download(attachment.originalName)}>
              <Download size={15} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          {failed === attachment.id ? (
            <p role="alert" className="mt-0.5 text-[.68rem] text-[var(--danger-ink)]">{copy.message.attachmentUnavailable}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// A thumbnail, from the file fetched with the session (blob: URL).
function AttachmentImage({
  attachment,
  copy,
  onOpen,
}: {
  attachment: MessageAttachment;
  copy: CaseMessagingCopy;
  onOpen: () => void;
}) {
  const blob = useAttachmentBlob(attachment.id);
  const url = useMemo(() => (blob.data ? URL.createObjectURL(blob.data) : null), [blob.data]);

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  if (blob.isError) return null;

  // A frame of fixed size, before and after loading: the log does not jump.
  return (
    <button type="button" onClick={onOpen}
      className="mb-1 flex h-40 w-64 max-w-full items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-muted)]"
      title={copy.message.download(attachment.originalName)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={copy.message.imageAlt(attachment.originalName)} className="max-h-full max-w-full object-contain" />
      ) : (
        <span aria-hidden="true" className="block h-full w-full animate-pulse" />
      )}
    </button>
  );
}

// --- A document of the patient record (case discussions) -----------------------------

const RECORD_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

export function RecordDocumentPicker({
  conversationId,
  copy,
  errorText,
  onClose,
  onPick,
  open,
  patientId,
}: {
  open: boolean;
  conversationId: string;
  patientId: string;
  onClose: () => void;
  onPick: (uploaded: UploadedAttachment) => void;
  copy: CaseMessagingCopy;
  errorText: (error: unknown) => string;
}) {
  const ids = { subtitle: useId(), title: useId() };
  const documents = usePatientDocuments(open ? patientId : "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const usable = (documents.data ?? []).filter((document) => RECORD_TYPES.has(document.mimeType));

  const pick = (documentId: string) => {
    setBusy(documentId);
    setError(null);
    attachRecordDocument(conversationId, documentId).then(
      (uploaded) => {
        setBusy(null);
        onPick(uploaded);
        onClose();
      },
      (reason: unknown) => {
        setBusy(null);
        setError(errorText(reason));
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--scrim)]" role="presentation">
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center">
        <div role="dialog" aria-modal="true" aria-labelledby={ids.title} aria-describedby={ids.subtitle}
          className="surface-section surface-raised flex max-h-[min(640px,calc(100dvh-2rem))] w-full max-w-lg flex-col overflow-hidden">
          <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div>
              <h2 id={ids.title} className="text-base font-semibold text-[var(--text-primary)]">{copy.recordPicker.title}</h2>
              <p id={ids.subtitle} className="clinical-caption mt-0.5">{copy.recordPicker.subtitle}</p>
            </div>
            <button ref={closeRef} type="button" className="clinical-icon-button -me-2 shrink-0" onClick={onClose} aria-label={copy.recordPicker.close}>
              <X size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-live="polite" aria-busy={documents.isFetching}>
            {error ? <p role="alert" className="mb-3 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger-ink)]">{error}</p> : null}
            {documents.isPending ? (
              <p className="clinical-caption">{copy.recordPicker.loading}</p>
            ) : documents.isError ? (
              <p role="alert" className="text-xs text-[var(--danger-ink)]">{copy.recordPicker.error}</p>
            ) : usable.length === 0 ? (
              <p className="clinical-caption">{copy.recordPicker.empty}</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
                {usable.map((document) => (
                  <li key={document.id} className="flex items-center gap-3 px-3 py-2.5">
                    {document.mimeType === "application/pdf" ? (
                      <FileText size={18} strokeWidth={1.7} aria-hidden="true" className="shrink-0 text-[var(--danger-ink)]" />
                    ) : (
                      <ImageIcon size={18} strokeWidth={1.7} aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]"><bdi>{document.fileName}</bdi></p>
                      <p className="text-xs text-[var(--text-secondary)]">{document.size}</p>
                    </div>
                    <button type="button" className="clinical-button min-h-9 shrink-0 px-3" disabled={busy !== null}
                      aria-busy={busy === document.id} onClick={() => pick(document.id)}>
                      <Paperclip size={14} strokeWidth={1.8} aria-hidden="true" />
                      {copy.recordPicker.attach}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
