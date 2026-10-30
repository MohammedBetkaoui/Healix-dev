import { useState } from "react";
import { FileText, TriangleAlert } from "lucide-react";
import { ListState, Notice } from "../dashboard-ui";
import { useLoad } from "../data";
import { getLocalPrescription, listPrescriptions, savePrescriptionDraft } from "../desktop-api";
import { emptyPrescriptionDraft } from "../drafts";
import { describeError } from "../errors";
import { prescriptionStatus } from "../statuses";
import type { LocalPrescription, PrescriptionDraftInput } from "../types";
import { PrescriptionEditorPage } from "./PrescriptionEditorPage";
import { PrescriptionView } from "./PrescriptionView";

export function draftFromPrescription(prescription: LocalPrescription): PrescriptionDraftInput {
  return {
    localId: prescription.localId,
    patientId: prescription.patientId,
    type: prescription.type,
    validUntil: prescription.validUntil,
    items: prescription.items,
  };
}

function Editor({ initial, patientName, onSaved, onClose }: {
  initial: PrescriptionDraftInput;
  patientName: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  return (
    <div className="space-y-4">
      {error ? (
        <Notice tone="danger" icon={<TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />}>
          {error}
        </Notice>
      ) : null}
      <PrescriptionEditorPage
        patientName={patientName}
        value={draft}
        onChange={setDraft}
        onCancel={onClose}
        onSave={async () => {
          setError("");
          try {
            const saved = await savePrescriptionDraft(draft);
            setDraft((current) => ({ ...current, localId: saved.localId }));
            await onSaved();
          } catch (cause) {
            setError(describeError(cause));
          }
        }}
      />
    </div>
  );
}

// A prescription page: the editor for a new draft or one the doctor may still
// change; the read-only view for a validated, canceled or conflicting one.
export function PrescriptionPage({ id, isNew, patientId, patientName, onSaved, onClose }: {
  id: string;
  isNew: boolean;
  patientId?: string;
  patientName?: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const loaded = useLoad(async () => {
    if (isNew) return null;
    const prescription = await getLocalPrescription(id);
    // The patient's name and whether the record is locked come with the list.
    const rows = await listPrescriptions(prescription.patientId);
    const row = rows.find((item) => item.localId === prescription.localId);
    return { prescription, patientName: row?.patientName ?? "", patientLocked: row?.patientLocked ?? false };
  }, [id, isNew]);

  if (isNew) {
    if (!patientId) return null;
    return <Editor key="new" initial={emptyPrescriptionDraft(patientId)} patientName={patientName ?? ""} onSaved={onSaved} onClose={onClose} />;
  }
  const data = loaded.data;
  return (
    <ListState
      loading={loaded.loading}
      error={loaded.error}
      empty={!data}
      emptyIcon={FileText}
      emptyTitle="Ordonnance introuvable"
      emptyText="Elle n’est plus disponible sur cet appareil."
    >
      {data ? (
        prescriptionStatus({ ...data.prescription, patientLocked: data.patientLocked }).editable ? (
          <Editor
            key={data.prescription.localId}
            initial={draftFromPrescription(data.prescription)}
            patientName={data.patientName}
            onSaved={onSaved}
            onClose={onClose}
          />
        ) : (
          <PrescriptionView prescription={data.prescription} patientName={data.patientName} patientLocked={data.patientLocked} />
        )
      ) : null}
    </ListState>
  );
}
