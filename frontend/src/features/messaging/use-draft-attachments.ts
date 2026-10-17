"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { uploadAttachment } from "./messaging.api";
import { type AttachmentProblem, attachmentProblemOf, isImageAttachment } from "./messaging-rules";
import { type UploadedAttachment } from "./messaging.types";

// A file of the message being written: uploaded as soon as it is chosen
// (its progress shown), sent with the message by its id, removable until
// then. One removed or never sent is deleted by the server after 24 hours.
export type DraftAttachment = {
  key: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  status: "uploading" | "ready" | "failed";
  // 0 to 1.
  progress: number;
  uploaded: UploadedAttachment | null;
  // A local image's blob: URL, for its preview; never the server's file.
  previewUrl: string | null;
  // Kept for a new attempt; null for a document of the record.
  file: File | null;
  errorText: string | null;
};

let nextKey = 0;
const newKey = () => `draft-${(nextKey += 1)}`;

export function useDraftAttachments(conversationId: string, errorText: (error: unknown) => string) {
  const [drafts, setDrafts] = useState<DraftAttachment[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  // The blob: URLs still shown, revoked when they go.
  const previews = useRef(new Set<string>());

  const change = useCallback((key: string, changes: Partial<DraftAttachment>) => {
    setDrafts((list) => list.map((draft) => (draft.key === key ? { ...draft, ...changes } : draft)));
  }, []);

  const upload = useCallback(
    (key: string, file: File) => {
      const controller = new AbortController();
      controllers.current.set(key, controller);
      uploadAttachment(conversationId, file, (progress) => change(key, { progress }), controller.signal)
        .then(
          (uploaded) =>
            change(key, { errorText: null, name: uploaded.originalName, progress: 1, status: "ready", uploaded }),
          (error: unknown) => {
            if (!controller.signal.aborted) change(key, { errorText: errorText(error), status: "failed" });
          },
        )
        .finally(() => controllers.current.delete(key));
    },
    [change, conversationId, errorText],
  );

  // Starts uploading what can be; returns the first problem met, if any.
  const addFiles = useCallback(
    (files: File[]): AttachmentProblem | null => {
      let problem: AttachmentProblem | null = null;
      const added: DraftAttachment[] = [];
      let count = drafts.length;

      for (const file of files) {
        const found = attachmentProblemOf(file, count);
        if (found) {
          problem ??= found;
          continue;
        }
        const previewUrl = isImageAttachment({ mimeType: file.type }) ? URL.createObjectURL(file) : null;
        if (previewUrl) previews.current.add(previewUrl);
        added.push({
          errorText: null,
          file,
          key: newKey(),
          mimeType: file.type,
          name: file.name,
          previewUrl,
          progress: 0,
          sizeBytes: file.size,
          status: "uploading",
          uploaded: null,
        });
        count += 1;
      }

      if (added.length > 0) {
        setDrafts((list) => [...list, ...added]);
        added.forEach((draft) => upload(draft.key, draft.file as File));
      }
      return problem;
    },
    [drafts.length, upload],
  );

  // A document of the patient record, already attached by the server.
  const addUploaded = useCallback((uploaded: UploadedAttachment) => {
    setDrafts((list) => [
      ...list,
      {
        errorText: null,
        file: null,
        key: newKey(),
        mimeType: uploaded.mimeType,
        name: uploaded.originalName,
        previewUrl: null,
        progress: 1,
        sizeBytes: uploaded.sizeBytes,
        status: "ready",
        uploaded,
      },
    ]);
  }, []);

  const retry = useCallback(
    (key: string) => {
      const draft = drafts.find((item) => item.key === key);
      if (!draft?.file) return;
      change(key, { errorText: null, progress: 0, status: "uploading" });
      upload(key, draft.file);
    },
    [change, drafts, upload],
  );

  const forget = (draft: DraftAttachment) => {
    controllers.current.get(draft.key)?.abort();
    if (draft.previewUrl) {
      URL.revokeObjectURL(draft.previewUrl);
      previews.current.delete(draft.previewUrl);
    }
  };

  const remove = (key: string) => {
    const draft = drafts.find((item) => item.key === key);
    if (draft) forget(draft);
    setDrafts((list) => list.filter((item) => item.key !== key));
  };

  // After sending: the list empties (the files are the message's now).
  const clear = () => {
    drafts.forEach(forget);
    setDrafts([]);
  };

  useEffect(() => {
    const pending = controllers.current;
    const shown = previews.current;
    return () => {
      pending.forEach((controller) => controller.abort());
      shown.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  return { addFiles, addUploaded, clear, drafts, remove, retry };
}
