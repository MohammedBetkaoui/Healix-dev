import type { ReactNode } from "react";
import { Settings } from "lucide-react";
import { ThemeControl } from "../components/ThemeControl";
import { PageHeader } from "../dashboard-ui";
import { API_BASE } from "../desktop-api";
import { fr } from "../i18n/fr";
import type { SessionStatus, SyncStatus } from "../types";
import { versionLabel } from "../version";
import { DESKTOP_BUILD_SHA, UpdateControl, inTauriWindow } from "../updates";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center sm:px-6">
      <dt className="text-xs font-semibold text-[var(--ink-soft)]">{label}</dt>
      <dd className="min-w-0 text-sm text-[var(--ink)]">{children}</dd>
    </div>
  );
}

export function SettingsPage({ session, sync }: { session: SessionStatus; sync: SyncStatus }) {
  // Never during a synchronization, never with operations still to send.
  const blockedReason =
    sync.state === "SYNCING"
      ? "Attendez la fin de la synchronisation avant d’installer la mise à jour."
      : sync.pendingCount > 0
        ? `Synchronisez d’abord ${fr.nav.pendingOperations(sync.pendingCount)} avant d’installer la mise à jour.`
        : null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Settings className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
        eyebrow={fr.nav.sections.management}
        title={fr.nav.items.settings}
      />
      <section className="surface-section overflow-hidden" aria-label={fr.nav.items.settings}>
        <dl className="divide-y divide-[var(--line)]">
          <Row label={fr.account.theme}><ThemeControl /></Row>
          <Row label="Mises à jour">
            {inTauriWindow ? <UpdateControl appearance="dashboard" blockedReason={blockedReason} /> : "Disponibles dans l’application installée."}
          </Row>
          <Row label="Version">
            <span className="clinical-figure">v{versionLabel(__APP_VERSION__)}{DESKTOP_BUILD_SHA ? ` · build ${DESKTOP_BUILD_SHA}` : ""}</span>
          </Row>
          <Row label="Serveur"><span className="clinical-figure break-all">{API_BASE || "—"}</span></Row>
          <Row label="Appareil">
            {session.workspace?.name ?? "—"}
            {session.user?.email ? <span className="block text-xs text-[var(--ink-faint)]">{session.user.email}</span> : null}
          </Row>
        </dl>
      </section>
    </div>
  );
}
