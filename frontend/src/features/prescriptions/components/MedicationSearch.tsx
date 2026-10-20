import { Search } from "lucide-react";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { type TranslationFunction } from "@/lib/i18n";

import { type Medication } from "../types/prescription.types";

type MedicationSearchProps = {
  medications: Medication[];
  onSelect: (medication: Medication) => void;
  selected: Medication;
  t: TranslationFunction;
};

function medicationLabel(medication: Medication) {
  return `${medication.dci} ${medication.strength}${medication.brandName ? ` — ${medication.brandName}` : ""}`;
}

export function MedicationSearch({ medications, onSelect, selected, t }: MedicationSearchProps) {
  const listId = useId();
  const [query, setQuery] = useState(() => medicationLabel(selected));
  return (
    <label className="block">
      <span className="mb-1.5 block text-[.68rem] font-medium text-[var(--text-secondary)]">{t("prescriptions.builder.medication")}</span>
      <span className="relative block">
        <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={15} aria-hidden="true" />
        <Input
          className="h-10 rounded-[var(--radius-sm)] ps-9 text-[.78rem] shadow-none"
          list={listId}
          value={query}
          onBlur={() => setQuery(medicationLabel(selected))}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            const match = medications.find((medication) => medicationLabel(medication) === value);
            if (match) onSelect(match);
          }}
        />
      </span>
      <datalist id={listId}>{medications.map((medication) => <option key={medication.id} value={medicationLabel(medication)} />)}</datalist>
    </label>
  );
}

