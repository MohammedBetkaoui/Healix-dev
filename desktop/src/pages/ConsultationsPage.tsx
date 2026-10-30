import { useMemo, useState } from "react";
import { ClipboardList, Search } from "lucide-react";
import { ListState, PageHeader, StatusBadge, cn, inputClass } from "../dashboard-ui";
import { useLoad } from "../data";
import { formatDateOnly } from "../dates";
import { listConsultations } from "../desktop-api";
import { fr } from "../i18n/fr";
import { consultationState } from "../statuses";
import type { ConsultationState, ConsultationSummary } from "../types";

export type ConsultationFilter = "ALL" | ConsultationState;

const FILTERS: Array<{ key: ConsultationFilter; label: string }> = [
  { key: "ALL", label: "Tous" },
  { key: "DRAFT", label: "Brouillons" },
  { key: "PENDING_SYNC", label: "En attente de synchro" },
  { key: "SYNCED", label: "Synchronisées" },
  { key: "CONFLICT", label: "Conflits" },
];

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr-FR");

// The filter and the search of the page, kept apart so they are testable.
export function filterConsultations(items: ConsultationSummary[], filter: ConsultationFilter, search: string) {
  const needle = normalize(search.trim());
  return items.filter(
    (item) =>
      (filter === "ALL" || item.state === filter) &&
      (!needle ||
        normalize([item.patientName, item.chiefComplaint ?? "", item.firstDiagnosis ?? ""].join(" ")).includes(needle)),
  );
}

export function ConsultationsPage({ version, onOpen }: { version: number; onOpen: (localId: string) => void }) {
  const loaded = useLoad(() => listConsultations(), [version]);
  const [filter, setFilter] = useState<ConsultationFilter>("ALL");
  const [search, setSearch] = useState("");
  const all = useMemo(() => loaded.data ?? [], [loaded.data]);
  const shown = useMemo(() => filterConsultations(all, filter, search), [all, filter, search]);
  const count = (key: ConsultationFilter) => (key === "ALL" ? all.length : all.filter((item) => item.state === key).length);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ClipboardList className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
        eyebrow={fr.nav.sections.clinical}
        title={fr.nav.items.consultations}
        description="Les consultations de cet appareil. Un brouillon se reprend ; une consultation synchronisée se lit seulement."
      />

      <section className="surface-section p-4 sm:p-5" aria-label="Filtres des consultations">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--ink-soft)]">Recherche</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute start-3.5 top-3.5 h-4 w-4 text-[var(--ink-faint)]" strokeWidth={1.8} aria-hidden="true" />
              <input
                className={cn(inputClass, "pe-4 ps-10")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Patient, motif, diagnostic…"
                type="search"
              />
            </span>
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="État">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] border px-3.5 text-sm font-medium transition",
                  filter === key
                    ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]"
                    : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink-soft)] hover:bg-[var(--panel-soft)]",
                )}
                onClick={() => setFilter(key)}
              >
                {label}
                <span className="clinical-figure rounded bg-[var(--panel-soft)] px-1.5 py-0.5 text-[0.62rem] text-[var(--ink-soft)]">{count(key)}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="surface-section overflow-hidden" aria-label="Consultations">
        <ListState
          loading={loaded.loading}
          error={loaded.error}
          empty={shown.length === 0}
          emptyIcon={ClipboardList}
          emptyTitle={all.length === 0 ? "Aucune consultation sur cet appareil" : "Aucune consultation ne correspond"}
          emptyText={all.length === 0 ? "Démarrez une consultation depuis un rendez-vous ou un dossier patient." : "Essayez un autre filtre ou une autre recherche."}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[0.78rem]">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--panel-soft)] text-[0.7rem] text-[var(--ink-soft)]">
                  <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">Date</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">Patient</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">Motif</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">Diagnostic</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">État</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => {
                  const state = consultationState(item.state);
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
                      <td className="whitespace-nowrap px-4 py-3.5 text-[var(--ink-soft)]">{formatDateOnly(item.date)}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-[var(--ink)]">{item.patientName}</td>
                      <td className="max-w-[16rem] truncate px-4 py-3.5 text-[var(--ink-soft)]">{item.chiefComplaint || "—"}</td>
                      <td className="max-w-[14rem] truncate px-4 py-3.5 text-[var(--ink-soft)]">{item.firstDiagnosis || "—"}</td>
                      <td className="px-4 py-3.5"><StatusBadge label={state.label} tone={state.tone} /></td>
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
