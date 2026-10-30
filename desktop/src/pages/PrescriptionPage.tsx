import { useState } from "react";
import { FileText, TriangleAlert } from "lucide-react";
import { ListState, Notice } from "../dashboard-ui";
import { useLoad } from "../data";
import { getLocalPatient, getLocalPrescription, listPrescriptions, savePrescriptionDraft } from "../desktop-api";
import { emptyPrescriptionDraft } from "../drafts";
import { describeError } from "../errors";
import { prescriptionStatus } from "../statuses";
import { printIdentityOf, type PrintIdentity } from "../print/build-print-input";
import type { LocalPatient, LocalPrescription, PrescriptionDraftInput, SessionStatus } from "../types";
import { PrescriptionEditorPage, type AllergyOverride } from "./PrescriptionEditorPage";
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

function Editor({ initial, patientName, patient, identity, onSaved, onClose }: {
  initial: PrescriptionDraftInput;
  patientName: string;
  patient: LocalPatient | null;
  identity: PrintIdentity;
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
        patient={patient}
        identity={identity}
        value={draft}
        onChange={setDraft}
        onCancel={onClose}
        onSave={async (allergyOverride?: AllergyOverride) => {
          setError("");
          try {
            const saved = await savePrescriptionDraft(allergyOverride ? { ...draft, allergyOverride } : draft);
            setDraft((current) => ({ ...current, localId: saved.localId }));
            await onSaved();
            return saved.localId;
          } catch (cause) {
            setError(describeError(cause));
            return null;
          }
        }}
      />
    </div>
  );
}

// A prescription page: the editor for a new draft or one the doctor may still
// change; the read-only view for a validated, canceled or conflicting one.
export function PrescriptionPage({ id, isNew, patientId, patientName, session, onSaved, onClose }: {
  id: string;
  isNew: boolean;
  patientId?: string;
  patientName?: string;
  // The printed identity (prescriber, cabinet) comes with the session.
  session: SessionStatus;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const identity = printIdentityOf(session);
  const loaded = useLoad(async () => {
    if (isNew) return null;
    const prescription = await getLocalPrescription(id);
    // The patient's name and whether the record is locked come with the list.
    const rows = await listPrescriptions(prescription.patientId);
    const row = rows.find((item) => item.localId === prescription.localId);
    return { prescription, patientName: row?.patientName ?? "", patientLocked: row?.patientLocked ?? false };
  }, [id, isNew]);
  // The patient of the prescription: its medical summary feeds the safety
  // checks, its identity the printed page. Read on its own: it may lie beyond
  // the first 200 patients of a search.
  const owner = isNew ? patientId : loaded.data?.prescription.patientId;
  const patientLoad = useLoad(() => (owner ? getLocalPatient(owner) : Promise.resolve(null)), [owner]);
  const patient = patientLoad.data;

  if (isNew) {
    if (!patientId) return null;
    return <Editor key="new" initial={emptyPrescriptionDraft(patientId)} patientName={patientName ?? ""} patient={patient} identity={identity} onSaved={onSaved} onClose={onClose} />;
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
            patient={patient}
            identity={identity}
            onSaved={onSaved}
            onClose={onClose}
          />
        ) : (
          <PrescriptionView prescription={data.prescription} patientName={data.patientName} patientLocked={data.patientLocked} patient={patient} identity={identity} />
        )
      ) : null}
    </ListState>
  );
}
