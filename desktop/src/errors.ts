import { fr } from "./i18n/fr";

// Errors of the native commands are French sentences, but some carry a word
// of the engine (grant, outbox, SQLCipher, manifest…), an HTTP code or the raw
// text of a library. The doctor reads a plain sentence from fr.errors instead;
// the first rule that matches wins.
const RULES: Array<[RegExp, string]> = [
  [/\bgrant\b|autorisation offline|horloge|expirée/i, fr.errors.authorization],
  [/sqlcipher|sqlite|chiffrement|base locale|schéma local|mise à niveau locale|répertoire de données/i, fr.errors.storage],
  [/gestionnaire d.informations|manifest|secret local|clé locale|identité cryptographique|coffre-fort/i, fr.errors.vault],
  [/erreur serveur|réponse serveur|connexion au serveur|(?:consultation|ordonnance|patient|item|items|liste).*serveur|\bapi\b|catalogue/i, fr.errors.server],
  [/outbox|tombstone|\back\b|mapping|curseur|séquence|transaction|audit local|conflit pull|conflit .*non enregistré/i, fr.errors.localWrite],
];

// What must never reach the screen as it is: JSON, a stack, a URL, an
// identifier, or an English library message.
const TECHNICAL =
  /^\s*[{[]|\b(?:TypeError|ReferenceError|SyntaxError|Error|Exception|undefined|null|NaN|panicked|invoke|failed|denied|refused|timed out)\b|\bat\s+\S+\s+\(|https?:\/\/|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b(?:ECONN|ENOTFOUND|ETIMEDOUT)\w*|\b(?:HTTP|status)\s*\d{3}\b|\{[^}]*\}|__TAURI|0x[0-9a-f]+/i;

const FRENCH =
  /[àâçéèêëîïôûùüÿœ’]|\b(?:le|la|les|de|du|des|un|une|et|ou|pas|impossible|doit|vous|votre|cet|cette|ce|sur|avec|pour|dans|indisponible|invalide|requis|absent|illisible|corrompu|local|locale|introuvable|patient|dossier|ordonnance|consultation|brouillon|incorrect)\b/i;

// `fallback` replaces the generic sentence where the context is known (the
// update check, for instance).
export function describeError(cause: unknown, fallback: string = fr.errors.generic): string {
  const raw = typeof cause === "string" ? cause : cause instanceof Error ? cause.message : "";
  const message = raw.trim();
  if (!message) return fallback;
  if (TECHNICAL.test(message)) return fallback;
  for (const [pattern, sentence] of RULES) {
    if (pattern.test(message)) return sentence;
  }
  if (!FRENCH.test(message)) return fallback;
  // A plain French sentence of the engine ("Patient local introuvable."): kept,
  // without a trailing parenthesis that may hold a library message.
  const sentence = message.replace(/\s*\([^)]*\)\s*\.?$/, "").trim();
  return /[.!?…]$/.test(sentence) ? sentence : `${sentence}.`;
}
