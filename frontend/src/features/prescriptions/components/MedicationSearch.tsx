import { Search } from "lucide-react";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { type TranslationFunction } from "@/lib/i18n";

import { useMedicationSearch } from "../hooks/use-medication-search";
import { type Medication } from "../types/prescription.types";
import { type ItemDraft } from "../utils/prescription-form";

type MedicationSearchProps = {
  item: ItemDraft;
  /** The prescriber picked a medication of the reference. */
  onSelect: (medication: Medication) => void;
  /** The prescriber typed a name that is not (or no longer) a reference entry. */
  onFreeText: (value: string) => void;
  t: TranslationFunction;
};

type Labelled = Pick<Medication, "dci" | "strength" | "brandName">;

export function medicationLabel(medication: Labelled | ItemDraft) {
  const brand = medication.brandName?.trim();
  return `${medication.dci}${medication.strength ? ` ${medication.strength}` : ""}${brand ? ` — ${brand}` : ""}`;
}

// The medication field of a line: typing queries the reference (GET
// /prescriptions/medications?q=, after a 300 ms pause); choosing a suggestion
// takes the entry of the reference, anything else stays a free text name.
export function MedicationSearch({ item, onFreeText, onSelect, t }: MedicationSearchProps) {
  const listId = useId();
  const [query, setQuery] = useState(() => (item.dci ? medicationLabel(item) : ""));
  const fromReference = Boolean(item.medicationId) && query === medicationLabel(item);
  const search = useMedicationSearch(query, !fromReference);
  const suggestions = search.data ?? [];
  return (
    <label className="block">
      <span className="mb-1.5 block text-[.68rem] font-medium text-[var(--text-secondary)]">{t("prescriptions.builder.medication")} *</span>
      <span className="relative block">
        <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={15} aria-hidden="true" />
        <Input
          className="h-10 rounded-[var(--radius-sm)] ps-9 text-[.78rem] shadow-none"
          list={listId}
          placeholder={t("prescriptions.builder.medicationPlaceholder")}
          value={query}
          onBlur={() => { if (item.medicationId) setQuery(medicationLabel(item)); }}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            const match = suggestions.find((medication) => medicationLabel(medication) === value);
            if (match) onSelect(match);
            else onFreeText(value);
          }}
        />
      </span>
      <datalist id={listId}>{suggestions.map((medication) => <option key={medication.id} value={medicationLabel(medication)} />)}</datalist>
      {search.isFetching ? <span className="mt-1 block text-[.64rem] text-[var(--text-muted)]" role="status">{t("prescriptions.states.searching")}</span> : null}
      {search.isError ? <span className="mt-1 block text-[.64rem] text-[var(--danger-ink)]" role="alert">{t("prescriptions.states.searchError")}</span> : null}
    </label>
  );
}
