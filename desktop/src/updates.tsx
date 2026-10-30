import { useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

// ---------------------------------------------------------------------------
// App identity and self-update
//
// The footer shows the exact build the support team must identify (version +
// commit). An update is never applied while a consultation is open or while
// the outbox still holds operations (the Settings page passes the reason).
// Nothing ever installs without the user's click, and the downloaded package
// is verified by the updater plugin against the minisign public key before
// the installer runs.
// ---------------------------------------------------------------------------

export const DESKTOP_BUILD_SHA: string = import.meta.env.VITE_BUILD_SHA ?? "";
export const inTauriWindow =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function ReleaseFooter() {
  return (
    <footer className="release-footer">
      <span className="release-version">
        HealixDz Desktop v{__APP_VERSION__}
        {DESKTOP_BUILD_SHA ? (
          <small> · build {DESKTOP_BUILD_SHA}</small>
        ) : null}
      </span>
      {inTauriWindow ? <UpdateControl /> : null}
    </footer>
  );
}

type UpdatePhase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "uptodate" }
  | { kind: "available"; update: Update; targetVersion: string }
  | { kind: "applying"; update: Update; step: string }
  | { kind: "error"; message: string };

export function UpdateControl({ appearance = "login", blockedReason }: {
  // "login": the sign-in screen styles; "dashboard": the clinical buttons.
  appearance?: "login" | "dashboard";
  // Why an available update must wait (pending operations, sync running).
  blockedReason?: string | null;
}) {
  const [phase, setPhase] = useState<UpdatePhase>({ kind: "idle" });
  const buttonClass = appearance === "dashboard" ? "clinical-button" : undefined;
  const applyClass = appearance === "dashboard" ? "clinical-button clinical-button-primary" : "release-update-apply";

  const verifyUpdate = async () => {
    if (phase.kind === "checking" || phase.kind === "applying") return;
    setPhase({ kind: "checking" });
    try {
      // The plugin fetches latest.json, downloads nothing else, and checks
      // the minisign signature of the release against the embedded public
      // key before this branch can ever run.
      const update = await check();
      if (update) {
        setPhase({ kind: "available", update, targetVersion: update.version });
      } else {
        setPhase({ kind: "uptodate" });
      }
    } catch (error) {
      // Unreachable endpoint (offline, no published release yet) is a normal
      // state, not a support case.
      setPhase({ kind: "error", message: String(error) });
    }
  };

  const applyUpdate = async (phase: Extract<UpdatePhase, { kind: "available" }>) => {
    setPhase({ kind: "applying", update: phase.update, step: "Téléchargement..." });
    try {
      await phase.update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setPhase({ kind: "applying", update: phase.update, step: "Téléchargement..." });
        } else if (event.event === "Finished") {
          setPhase({ kind: "applying", update: phase.update, step: "Installation..." });
        }
      });
      setPhase({ kind: "applying", update: phase.update, step: "Redémarrage de l'application..." });
      await relaunch();
    } catch (error) {
      setPhase({ kind: "error", message: String(error) });
    }
  };

  return (
    <div className={appearance === "dashboard" ? "flex flex-wrap items-center gap-3 text-xs text-[var(--ink-soft)]" : "release-update"}>
      {phase.kind === "idle" && (
        <button type="button" className={buttonClass} onClick={() => void verifyUpdate()}>
          Vérifier la mise à jour
        </button>
      )}
      {phase.kind === "idle" && (
        <small>Les données locales et la configuration de l'appareil sont conservées par la mise à jour.</small>
      )}
      {phase.kind === "checking" && <small>Vérification de la dernière version publiée…</small>}
      {phase.kind === "uptodate" && (
        <small>HealixDz Desktop est à jour.</small>
      )}
      {phase.kind === "available" && (
        <>
          <button
            type="button"
            onClick={() => void applyUpdate(phase)}
            className={applyClass}
            disabled={Boolean(blockedReason)}
          >
            Installer la version {phase.targetVersion}
          </button>
          <small>{blockedReason ?? "L'application redémarre à la fin de l'installation."}</small>
        </>
      )}
      {phase.kind === "applying" && <small>{phase.step}</small>}
      {phase.kind === "error" && (
        <small aria-live="polite">Mise à jour indisponible : {phase.message}</small>
      )}
    </div>
  );
}
