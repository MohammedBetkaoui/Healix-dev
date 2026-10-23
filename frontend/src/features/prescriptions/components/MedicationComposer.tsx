import { Database, Plus } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

import { type ItemDraft, newItemDraft } from "../utils/prescription-form";
import { MedicationRow } from "./MedicationRow";

type MedicationComposerProps = {
  items: ItemDraft[];
  onChange: (items: ItemDraft[]) => void;
  t: TranslationFunction;
};

// Local keys of the lines: React identity only, never sent to the API.
let lineCounter = 0;
export const nextItemKey = () => `line-${++lineCounter}`;

export function MedicationComposer({ items, onChange, t }: MedicationComposerProps) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">{t("prescriptions.builder.areas.medications")}</h3><p className="mt-1 flex items-center gap-1.5 text-[.66rem] text-[var(--text-secondary)]"><Database size={13} className="text-[var(--medical)]" aria-hidden="true" />{t("prescriptions.builder.anppReady")}</p></div><button type="button" className="clinical-button" onClick={() => onChange([...items, newItemDraft(nextItemKey())])}><Plus size={15} aria-hidden="true" />{t("prescriptions.actions.addMedication")}</button></div>
      <div className="space-y-3">{items.map((item, index) => <MedicationRow key={item.key} index={index} item={item} onChange={(updated) => onChange(items.map((candidate) => candidate.key === item.key ? updated : candidate))} onRemove={() => onChange(items.filter((candidate) => candidate.key !== item.key))} t={t} />)}</div>
    </section>
  );
}
