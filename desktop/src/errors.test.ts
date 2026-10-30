import { describe, expect, it } from "vitest";
import { describeError } from "./errors";
import { fr } from "./i18n/fr";
import { versionLabel } from "./version";

describe("describeError", () => {
  it("falls back to a generic French sentence for anything empty", () => {
    for (const empty of [undefined, null, "", "   ", {}, 42]) expect(describeError(empty)).toBe(fr.errors.generic);
  });

  it("never lets JSON, a stack, a URL, an identifier or English text through", () => {
    for (const raw of [
      '{"statusCode":502,"message":"Bad Gateway"}',
      "TypeError: Cannot read properties of undefined (reading 'invoke')",
      "error sending request for url (https://api.example.test/api/sync/push)",
      "Request failed with status code 502",
      "Patient 0b9d8a3c-1c7e-4c58-9a35-3f1f6f0f6c11 not found",
      "connection refused",
      "thread 'main' panicked at src/lib.rs:12",
    ]) {
      expect(describeError(raw), raw).toBe(fr.errors.generic);
    }
  });

  it("translates the engine's technical words into plain sentences", () => {
    expect(describeError("Le grant ne correspond pas au contexte local.")).toBe(fr.errors.authorization);
    expect(describeError("Autorisation offline expirée ou invalide.")).toBe(fr.errors.authorization);
    expect(describeError("Recul de l’horloge détecté; reconnexion en ligne requise.")).toBe(fr.errors.authorization);
    expect(describeError("Le chiffrement SQLCipher est requis.")).toBe(fr.errors.storage);
    expect(describeError("Impossible d’ouvrir la base locale chiffrée.")).toBe(fr.errors.storage);
    expect(describeError("Outbox locale illisible.")).toBe(fr.errors.localWrite);
    expect(describeError("Séquence outbox indisponible.")).toBe(fr.errors.localWrite);
    expect(describeError("Erreur serveur 502.")).toBe(fr.errors.server);
    expect(describeError("Réponse serveur incomplète: syncCursor.")).toBe(fr.errors.server);
    expect(describeError("Connexion au serveur impossible.")).toBe(fr.errors.server);
    expect(describeError("Manifest du secret local fragmenté invalide dans le Gestionnaire d’informations d’identification Windows.")).toBe(fr.errors.vault);
    expect(describeError("Coffre-fort système indisponible pour ce compte Windows (Platform secure storage failure).")).toBe(fr.errors.vault);
  });

  it("keeps the engine's plain French sentences, without a library message in parentheses", () => {
    expect(describeError("Patient local introuvable.")).toBe("Patient local introuvable.");
    expect(describeError("Dossier verrouillé hors périmètre autorisé; modification interdite.")).toBe(
      "Dossier verrouillé hors périmètre autorisé; modification interdite.",
    );
    expect(describeError("Ce dossier n’est pas disponible hors connexion.")).toBe("Ce dossier n’est pas disponible hors connexion.");
    expect(describeError("Seuls les brouillons serveur peuvent être modifiés hors ligne.")).toBe(
      "Seuls les brouillons serveur peuvent être modifiés hors ligne.",
    );
    expect(describeError("Mot de passe incorrect (code 401)")).toBe("Mot de passe incorrect.");
  });

  it("uses the fallback of the context when the message is not usable", () => {
    expect(describeError("error sending request", fr.errors.update)).toBe(fr.errors.update);
    expect(describeError(new Error("Request timed out"), fr.errors.update)).toBe(fr.errors.update);
  });
});

describe("versionLabel", () => {
  it("reads as a beta for every 0.x release and for -beta pre-releases", () => {
    expect(versionLabel("0.1.0")).toBe("0.1.0 bêta");
    expect(versionLabel("0.1.0-beta.1")).toBe("0.1.0 bêta 1");
    expect(versionLabel("0.2.0-beta")).toBe("0.2.0 bêta");
    expect(versionLabel("1.0.0")).toBe("1.0.0");
    expect(versionLabel("1.2.0-rc.1")).toBe("1.2.0 rc.1");
  });
});
