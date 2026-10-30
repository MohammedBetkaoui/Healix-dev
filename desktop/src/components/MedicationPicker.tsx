import { useEffect, useState } from "react";
import { Field, inputClass } from "../dashboard-ui";
import { searchLocalMedications } from "../desktop-api";
import type { LocalMedication, PrescriptionItemInput } from "../types";

export function MedicationPicker({
  selected,
  onSelect,
}: {
  selected: PrescriptionItemInput;
  onSelect: (medication: LocalMedication) => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<LocalMedication[]>([]);
  useEffect(() => {
    if (query.trim().length < 2) {
      setMatches([]);
      return;
    }
    void searchLocalMedications(query).then(setMatches).catch(() => setMatches([]));
  }, [query]);
  return (
    <div className="relative mb-4">
      <Field label="Rechercher dans le catalogue local (DCI, marque, dosage)">
        <input
          className={inputClass}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={selected.dci || "ex. para"}
        />
      </Field>
      {matches.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)] p-1.5 shadow-[var(--shadow-raised)]">
          {matches.map((medication) => (
            <button
              key={medication.id}
              type="button"
              className="w-full rounded-[var(--radius-sm)] px-3 py-2.5 text-start text-sm font-medium text-[var(--ink-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              onClick={() => {
                onSelect(medication);
                setQuery("");
                setMatches([]);
              }}
            >
              {medication.dci} — {medication.brandName ?? "Sans marque"} — {medication.strength}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
