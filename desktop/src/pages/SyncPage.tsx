import { CheckCircle2, Lock, RefreshCw, TriangleAlert, WifiOff } from "lucide-react";
import { Button, MetricStrip, Notice, PageHeader, cn, formatDate } from "../dashboard-ui";
import { fr } from "../i18n/fr";
import type { SyncStatus } from "../types";

// The former sync banner, as a page: where the offline workspace stands.
// Its tone follows the sync state, and the written state always accompanies
// the colour.
export function SyncPage({ status, onSync }: { status: SyncStatus; onSync: () => void }) {
  const syncing = status.state === "SYNCING";
  const label =
    syncing
      ? fr.connection.syncing(status.processed ?? 0, status.total ?? status.pendingCount)
      : status.state === "OFFLINE"
        ? fr.connection.offline
        : status.state === "SCOPE_REVOKED" || status.state === "LOCKED"
          ? `${status.lockedCount ?? 0} dossiers verrouillés hors périmètre`
          : status.state === "CONFLICT"
            ? `${status.conflictCount} éléments nécessitent votre attention`
            : status.state === "AUTH_EXPIRED"
              ? fr.connection.expired
              : fr.connection.online;
  const tone =
    status.state === "OFFLINE" || status.state === "SCOPE_REVOKED" || status.state === "LOCKED"
      ? { className: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]", icon: status.state === "OFFLINE" ? WifiOff : Lock }
      : status.state === "CONFLICT" || status.state === "AUTH_EXPIRED"
        ? { className: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]", icon: TriangleAlert }
        : syncing
          ? { className: "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]", icon: RefreshCw }
          : { className: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]", icon: CheckCircle2 };
  const Icon = tone.icon;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<RefreshCw className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
        eyebrow={fr.nav.sections.management}
        title={fr.nav.items.sync}
        description="Les opérations faites hors ligne partent vers le serveur dès que la connexion revient."
        actions={
          <Button onClick={onSync} disabled={syncing}>
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} strokeWidth={1.8} aria-hidden="true" />
            Synchroniser maintenant
          </Button>
        }
      >
        <MetricStrip
          items={[
            { icon: RefreshCw, tone: status.pendingCount ? "accent" : "success", value: String(status.pendingCount), label: "Opérations en attente" },
            { icon: TriangleAlert, tone: status.conflictCount ? "accent" : "success", value: String(status.conflictCount), label: "Conflits" },
            { icon: Lock, tone: "neutral", value: String(status.lockedCount ?? 0), label: "Dossiers hors périmètre" },
            { icon: CheckCircle2, tone: "neutral", value: formatDate(status.lastSyncedAt), label: "Dernière synchronisation", compact: true },
          ]}
        />
      </PageHeader>

      <section
        aria-label={fr.nav.items.sync}
        role={status.state === "CONFLICT" ? "alert" : "status"}
        className={cn("flex items-start gap-3 rounded-[var(--radius-md)] border px-5 py-4", tone.className)}
      >
        <Icon aria-hidden="true" size={18} strokeWidth={1.9} className={cn("mt-0.5 shrink-0", syncing && "animate-spin")} />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-0.5 text-xs opacity-90">
            {status.pendingCount ? fr.nav.pendingOperations(status.pendingCount) : "Toutes les données sont synchronisées"}
            {" · "}Dernière synchronisation : {formatDate(status.lastSyncedAt)}
          </p>
        </div>
      </section>

      {status.conflictCount > 0 ? (
        <Notice tone="danger" icon={<TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />}>
          {fr.nav.conflicts(status.conflictCount)} : les éléments concernés sont signalés « Conflit — attention requise » dans les dossiers patients, en lecture seule.
        </Notice>
      ) : null}
    </div>
  );
}
