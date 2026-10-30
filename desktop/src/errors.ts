// Errors of the native commands are already French sentences; anything else
// (a network stack message, an unexpected object) becomes a generic sentence.
export function describeError(cause: unknown): string {
  const raw = typeof cause === "string" ? cause : cause instanceof Error ? cause.message : "";
  return raw.trim() || "Une erreur est survenue. Réessayez.";
}
