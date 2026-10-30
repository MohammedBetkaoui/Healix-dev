import { useCallback, useEffect, useRef, useState } from "react";
import { Stethoscope } from "lucide-react";
import { formFromDetail, inputFromForm, newForm, type ConsultationForm, type FormProblems } from "../consultation-form";
import { ListState } from "../dashboard-ui";
import { useLoad } from "../data";
import { getConsultation, saveConsultationDraft } from "../desktop-api";
import { describeError } from "../errors";
import { ConsultationEditorPage, type SaveState } from "./ConsultationEditorPage";
import { ConsultationView } from "./ConsultationView";

// An unsaved change is saved at most this long after it was made.
export const AUTOSAVE_DELAY_MS = 10_000;

// How a save was asked for: "auto" (timer, leaving a field, leaving the page)
// does not start a synchronization, "manual" and "finished" do.
export type SaveKind = "auto" | "manual" | "finished";

function Editor({ initial, patientName, onSaved, onClose, onWritePrescription }: {
  initial: ConsultationForm;
  patientName: string;
  onSaved: (kind: SaveKind) => Promise<void>;
  onClose: () => void;
  onWritePrescription: (patientId: string, patientName: string) => void;
}) {
  const [form, setForm] = useState(initial);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "clean" });
  const [problems, setProblems] = useState<FormProblems | null>(null);
  const [finished, setFinished] = useState(false);
  const [dirty, setDirty] = useState(false);

  // The latest values, for the timer and the exit save (never a stale closure).
  const formRef = useRef(form);
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const change = useCallback((next: ConsultationForm) => {
    formRef.current = next;
    revisionRef.current += 1;
    dirtyRef.current = true;
    setForm(next);
    setDirty(true);
    setFinished(false);
    setSaveState((current) => (current.kind === "saving" ? current : { kind: "dirty" }));
  }, []);

  const doSave = useCallback(async (kind: SaveKind): Promise<boolean> => {
    const strict = kind !== "auto";
    const status = kind === "finished" ? "READY_TO_SYNC" : undefined;
    const built = inputFromForm(formRef.current, status, { lenient: !strict });
    if ("problems" in built) {
      setProblems(built.problems);
      setSaveState({ kind: "error", message: built.problems.messages[0] ?? "" });
      return false;
    }
    setProblems(null);
    const startedAt = revisionRef.current;
    setSaveState({ kind: "saving" });
    try {
      const saved = await saveConsultationDraft(built.input);
      // A later edit may have come in while saving: it is still to be saved.
      const stillDirty = revisionRef.current !== startedAt;
      formRef.current = {
        ...formRef.current,
        localId: saved.localId,
        localStatus: status ?? formRef.current.localStatus,
      };
      setForm(formRef.current);
      dirtyRef.current = stillDirty;
      setDirty(stillDirty);
      setSaveState(stillDirty ? { kind: "dirty" } : { kind: "saved", at: new Date() });
      await onSavedRef.current(kind);
      return true;
    } catch (cause) {
      const message = describeError(cause);
      setProblems({ vitals: {}, messages: [message] });
      setSaveState({ kind: "error", message });
      return false;
    }
  }, []);

  // One save at a time: a save asked for while another runs (a field blur then
  // a click on "Terminer") waits for it, then saves the latest values.
  const save = useCallback(async (kind: SaveKind): Promise<boolean> => {
    while (inFlight.current) await inFlight.current;
    const running = doSave(kind);
    inFlight.current = running.finally(() => {
      inFlight.current = null;
    });
    return running;
  }, [doSave]);

  const saveRef = useRef(save);
  saveRef.current = save;

  // The timer starts at the first unsaved change and is not pushed back by the
  // next ones: at most one automatic save every AUTOSAVE_DELAY_MS.
  const saving = saveState.kind === "saving";
  useEffect(() => {
    if (!dirty || saving) return;
    const timer = window.setTimeout(() => void saveRef.current("auto"), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [dirty, saving]);

  // Leaving the page never loses what was typed.
  useEffect(
    () => () => {
      if (dirtyRef.current) void saveRef.current("auto");
    },
    [],
  );

  const close = async () => {
    if (dirtyRef.current) await save("auto");
    onClose();
  };

  return (
    <ConsultationEditorPage
      patientName={patientName}
      value={form}
      onChange={change}
      saveState={saveState}
      problems={problems}
      finished={finished}
      onFieldBlur={() => {
        if (dirtyRef.current) void saveRef.current("auto");
      }}
      onSave={() => void save("manual")}
      onFinish={() =>
        void save("finished").then((done) => {
          if (done) setFinished(true);
        })
      }
      onWritePrescription={() => onWritePrescription(form.patientId, patientName)}
      onClose={() => void close()}
    />
  );
}

// A consultation page: the editor for a new one (opened from a record or an
// appointment, with the reason and the appointment already filled in) or for a
// local draft the doctor may still change; the read-only view for the rest.
export function ConsultationPage({ id, isNew, patientId, patientName, reason, appointmentId, onSaved, onClose, onWritePrescription }: {
  id: string;
  isNew: boolean;
  patientId?: string;
  patientName?: string;
  reason?: string;
  appointmentId?: string;
  onSaved: (kind: SaveKind) => Promise<void>;
  onClose: () => void;
  onWritePrescription: (patientId: string, patientName: string) => void;
}) {
  const loaded = useLoad(() => (isNew ? Promise.resolve(null) : getConsultation(id)), [id, isNew]);

  if (isNew) {
    if (!patientId) return null;
    return (
      <Editor
        key="new"
        initial={newForm(patientId, { reason, appointmentId })}
        patientName={patientName ?? ""}
        onSaved={onSaved}
        onClose={onClose}
        onWritePrescription={onWritePrescription}
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
          <Editor
            key={detail.localId}
            initial={formFromDetail(detail)}
            patientName={detail.patientName}
            onSaved={onSaved}
            onClose={onClose}
            onWritePrescription={onWritePrescription}
          />
        ) : (
          <ConsultationView consultation={detail} />
        )
      ) : null}
    </ListState>
  );
}
