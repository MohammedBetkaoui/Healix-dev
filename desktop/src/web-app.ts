import { openUrl } from "@tauri-apps/plugin-opener";

// The HealixDz Web platform, where Healix AI lives. HTTPS in a release build;
// the local Next server in development. Without an address the Desktop shows
// no Web entry (the Rust side grants no opener scope either).
export function resolveWebAppUrl(env: { DEV: boolean; VITE_WEB_APP_URL?: string }): string | null {
  const configured = env.VITE_WEB_APP_URL?.trim();
  if (configured) {
    if (configured.startsWith("https://") || env.DEV) return configured.replace(/\/+$/, "");
    return null;
  }
  return env.DEV ? "http://localhost:3000" : null;
}

export const WEB_APP_URL = resolveWebAppUrl(import.meta.env);

// Healix AI for the open record, or the analyses hub.
export function healixAiUrl(base: string, patientId?: string): string {
  return patientId
    ? `${base}/doctor/patients/${encodeURIComponent(patientId)}`
    : `${base}/doctor/ai-analyses`;
}

export async function openHealixAi(patientId?: string) {
  if (!WEB_APP_URL) return;
  await openUrl(healixAiUrl(WEB_APP_URL, patientId));
}
