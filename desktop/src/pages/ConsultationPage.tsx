import { useState } from "react";
import { Stethoscope, TriangleAlert } from "lucide-react";
import { ListState, Notice } from "../dashboard-ui";
import { useLoad } from "../data";
import { getConsultation, saveConsultationDraft } from "../desktop-api";
import { emptyDraft } from "../drafts";
import { describeError } from "../errors";
import { ConsultationEditorPage } from "./ConsultationEditorPage";
import { ConsultationView } from "./ConsultationView";
import type { ConsultationDraftInput, ConsultationDetail } from "../types";

type DraftStatus = ConsultationDraftInput["localStatus"];
const DRAFT_STATUSES: DraftStatus[] = ["LOCAL_DRAFT", "IN_PROGRESS", "READY_TO_SYNC"];

// The editor's starting value for a consultation already on the device.
export function draftFromDetail(detail: ConsultationDetail): ConsultationDraftInput {
  return {
    localId: detail.localId,
    patientId: detail.patientId,
    localStatus: DRAFT_STATUSES.includes(detail.localStatus as DraftStatus)
      ? (detail.localStatus as DraftStatus)
      : "LOCAL_DRAFT",
    chiefComplaint: detail.chiefComplaint,
    historyPresentIllness: detail.historyPresentIllness,
    clinicalExamination: detail.clinicalExamination,
    assessment: detail.assessment,
    carePlan: detail.carePlan,
    followUpPlan: detail.followUpPlan,
  };
}

function Editor({ initial, patientName, onSaved, onClose }: {
  initial: ConsultationDraftInput;
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
      <ConsultationEditorPage
        patientName={patientName}
        value={draft}
        onChange={setDraft}
        onCancel={onClose}
        onSave={async () => {
          setError("");
          try {
            const saved = await saveConsultationDraft(draft);
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

// A consultation page: the editor for a new one (opened from a record or an
// appointment, with the reason already filled in) or for a local draft the
// doctor may still change; the read-only view for everything else.
export function ConsultationPage({ id, isNew, patientId, patientName, reason, onSaved, onClose }: {
  id: string;
  isNew: boolean;
  patientId?: string;
  patientName?: string;
  reason?: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const loaded = useLoad(() => (isNew ? Promise.resolve(null) : getConsultation(id)), [id, isNew]);

  if (isNew) {
    if (!patientId) return null;
    return (
      <Editor
        key="new"
        initial={{ ...emptyDraft(patientId), chiefComplaint: reason ?? "" }}
        patientName={patientName ?? ""}
        onSaved={onSaved}
        onClose={onClose}
      />
    );
  }
  const detail = loaded.data;
  return (
    <ListState
      loading={loaded.loading}
      error={loaded.error}
      empty={!detail}
      emptyIcon={Stethoscope}
      emptyTitle="Consultation introuvable"
      emptyText="Elle n’est plus disponible sur cet appareil."
    >
      {detail ? (
        detail.editable ? (
          <Editor key={detail.localId} initial={draftFromDetail(detail)} patientName={detail.patientName} onSaved={onSaved} onClose={onClose} />
        ) : (
          <ConsultationView consultation={detail} />
        )
      ) : null}
    </ListState>
  );
}
