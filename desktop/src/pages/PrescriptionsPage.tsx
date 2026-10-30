import { useMemo, useState } from "react";
import { Pill as PillIcon, Search } from "lucide-react";
import { ListState, PageHeader, StatusBadge, cn, inputClass } from "../dashboard-ui";
import { useLoad } from "../data";
import { formatDateOnly } from "../dates";
import { listPrescriptions } from "../desktop-api";
import { fr } from "../i18n/fr";
import { prescriptionStatus } from "../statuses";

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr-FR");

export function PrescriptionsPage({ version, onOpen }: { version: number; onOpen: (localId: string) => void }) {
  const loaded = useLoad(() => listPrescriptions(), [version]);
  const [search, setSearch] = useState("");
  const all = useMemo(() => loaded.data ?? [], [loaded.data]);
  const needle = normalize(search.trim());
  const shown = all.filter(
    (item) => !needle || normalize(`${item.patientName} ${item.medications ?? ""} ${item.number ?? ""}`).includes(needle),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<PillIcon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
        eyebrow={fr.nav.sections.care}
        title={fr.nav.items.prescriptions}
        description="Les ordonnances de cet appareil. Un brouillon se reprend ; la validation officielle se fait en ligne."
      />

      <section className="surface-section p-4 sm:p-5" aria-label="Recherche des ordonnances">
        <label className="block max-w-xl">
          <span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--ink-soft)]">Recherche</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute start-3.5 top-3.5 h-4 w-4 text-[var(--ink-faint)]" strokeWidth={1.8} aria-hidden="true" />
            <input
              className={cn(inputClass, "pe-4 ps-10")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Patient, médicament, n° d’ordonnance…"
              type="search"
            />
          </span>
        </label>
      </section>

      <section className="surface-section overflow-hidden" aria-label="Ordonnances">
        <ListState
          loading={loaded.loading}
          error={loaded.error}
          empty={shown.length === 0}
          emptyIcon={PillIcon}
          emptyTitle={all.length === 0 ? "Aucune ordonnance sur cet appareil" : "Aucune ordonnance ne correspond"}
          emptyText={all.length === 0 ? "Créez un brouillon depuis un dossier patient." : "Essayez une autre recherche."}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[0.78rem]">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--panel-soft)] text-[0.7rem] text-[var(--ink-soft)]">
                  <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">Date</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">Patient</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">Médicaments</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">État</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => {
                  const status = prescriptionStatus(item);
                  return (
                    <tr
                      key={item.localId}
                      className="cursor-pointer border-b border-[var(--line-soft)] align-middle transition last:border-0 hover:bg-[var(--panel-soft)] focus-visible:bg-[var(--panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
                      tabIndex={0}
                      onClick={() => onOpen(item.localId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpen(item.localId);
                        }
                      }}
                    >
                      <td className="whitespace-nowrap px-4 py-3.5 text-[var(--ink-soft)]">{formatDateOnly(item.updatedAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-[var(--ink)]">
                        {item.patientName}
                        {item.number ? <span className="clinical-figure block text-[0.66rem] font-normal text-[var(--ink-faint)]">{item.number}</span> : null}
                      </td>
                      <td className="max-w-[20rem] px-4 py-3.5 text-[var(--ink-soft)]">
                        <span className="clinical-figure mr-2 text-[0.66rem]">{item.itemCount}</span>
                        <span className="truncate">{item.medications || "Sans médicament"}</span>
                      </td>
                      <td className="px-4 py-3.5"><StatusBadge label={status.label} tone={status.tone} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ListState>
      </section>
    </div>
  );
}
