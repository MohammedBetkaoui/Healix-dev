# Offline — banc de tests de fiabilité Desktop ↔ Backend

Ce banc démontre que les données cliniques offline **existantes** (Consultation et Prescription DRAFT) convergent vers le Cloud dans des situations de réseau dégradé : sans perte silencieuse, sans duplication, sans écrasement (pas de Last-Write-Wins), sans ACK fantôme, sans réutilisation d’`operationId`, sans fuite entre workspaces. Il n’ajoute aucune fonctionnalité métier ; il teste ensemble les mécanismes de [offline-first-v1.md](offline-first-v1.md).

## Architecture

```text
┌───────────────────────────────────────────────┐
│ Jest (backend/test/offline-e2e)               │  scénarios + sondes SQL (Prisma)
└──────┬────────────────────────────────┬───────┘
       │ spawn, 1 process / commande    │ lit / écrit
       ▼                                ▼
┌──────────────────┐             ┌──────────────┐
│ offline-e2e-     │             │ MySQL 8.4    │  base healixdz_offline_e2e
│ harness (Rust)   │             │ (Docker)     │
│ moteur Desktop   │             └──────▲───────┘
│ réel : SQLCipher │                    │
│ outbox, sync_now │             ┌──────┴───────┐
│ identité RSA,PoP │  HTTP       │ Backend      │  node dist/src/main.js
└──────┬───────────┘ ──────────► │ NestJS réel  │  (processus enfant, SIGKILL possible)
       │            ┌─────────┐  └──────▲───────┘
       └──────────► │ Fault   │ ────────┘
                    │ proxy   │  1 proxy par Desktop
                    └─────────┘
```

| Brique | Réel ? |
| --- | --- |
| Moteur de sync Desktop (`database.rs`, `network.rs`, `security.rs`, `protocol.rs`) | oui, le même code que l’application Tauri |
| Base locale | oui, SQLCipher (clé 256 bits, schéma et migrations locales réels) |
| Identité appareil, grant offline, Device PoP (RSA-PSS), nonce, horodatage, hash du corps | oui, vérifiés par le vrai backend |
| Backend NestJS, routes `/api/sync/*`, `/api/devices/*`, `/api/auth/login` | oui, build de production (`dist/`) |
| Prisma + MySQL | oui, migrations de production appliquées sur une base dédiée |
| Réseau | dégradé par le fault proxy |
| Coffre-fort des secrets | **fichier** dans le profil de test (voir Limites) |
| WebView, UI React | non (hors périmètre : le moteur est testé sans fenêtre) |

### Le moteur Desktop sans Tauri

L’application passe un `AppHandle` Tauri au moteur. Il est remplacé par `EngineEnv` (dossier de la base) ; les commandes Tauri de `lib.rs` ne sont plus que des adaptateurs minces. Le harnais (`src/e2e_harness.rs`, binaire `offline-e2e-harness`) appelle les mêmes fonctions que ces commandes, **un processus par commande** : « relancer l’application » = lancer la commande suivante sur le même profil. Tout ce qui est propre aux tests est derrière la feature Cargo `e2e-harness`, désactivée dans tout build livré :

- le coffre fichier (`HEALIX_E2E_SECRET_DIR`) à la place du coffre-fort OS ;
- des **points de panne** (`HEALIX_E2E_CRASH_AT`) qui terminent le processus à un endroit exact de `sync_now` : `after-attempt-marked`, `after-push-response`, `after-push-applied`, `after-pull-applied` ;
- un timeout HTTP raccourci (`HEALIX_E2E_HTTP_TIMEOUT_MS`) pour obtenir un vrai timeout à moindre coût.

### Fault proxy

Choix : un proxy HTTP écrit pour le banc (`support/fault-proxy.ts`, ≈ 250 lignes, dépendances Node uniquement) plutôt que Toxiproxy. Toxiproxy opère en TCP : il ne distingue pas « la réponse de `/sync/push` » de celle de `/sync/reconcile` qui la précède de quelques millisecondes ; un scénario « ACK perdu » deviendrait une course contre la montre. Le proxy HTTP cible une route, une fois, et rend ces scénarios déterministes. Il reste de l’infrastructure de test : le code métier n’en dépend pas, et les scénarios ne parlent qu’à `NetworkFaultController` (`goOffline`, `restoreNetwork`, `cutConnection`, `resetConnection`, `dropResponse`, `timeout`, `enableLatency`, `duplicateRequest`, `around`, `resetAll`) ; changer d’outil = réécrire cette classe.

Chaque Desktop a son propre proxy (donc son propre état réseau, et une adresse cliente distincte pour la limite de débit du login). Le proxy journalise chaque requête (méthode, chemin, statut amont, faute appliquée) : les scénarios vérifient aussi ce qui n’a **pas** été envoyé.

## Lancer

Prérequis : Node 22, Rust stable (+ dépendances système de Tauri sous Linux), Docker pour MySQL.

```bash
node scripts/test-offline-e2e.mjs                 # tout : MySQL, builds, suite, nettoyage
node scripts/test-offline-e2e.mjs --skip-build    # réutilise dist/ et le binaire du harnais
node scripts/test-offline-e2e.mjs -- scenarios/04 # un fichier de scénarios
cd backend && npm run test:offline-e2e:full       # équivalent
```

Sans Docker, avec un MySQL à soi : exporter `OFFLINE_E2E_DATABASE_URL` (la base doit s’appeler `healixdz_offline_e2e*` — le banc refuse tout autre nom), construire une fois (`npm run build` dans `backend/`, `cargo build --features e2e-harness --bin offline-e2e-harness` dans `desktop/src-tauri/`), puis `npm run test:offline-e2e` dans `backend/`.

`docker-compose.offline-e2e.yml` ne démarre que MySQL, en mémoire (tmpfs), port 33306. Le Backend est un processus du banc : il doit pouvoir être tué net, ou relancé, à un instant précis d’une requête, ce qu’un conteneur géré par Compose ne permet pas de façon déterministe.

Cycle de données : `global-setup.ts` applique les migrations ; chaque fichier de scénarios crée ses fixtures (médecins, patients « E2E Alpha »/« E2E Beta », données Cloud) avec `IntegrationFixtures` ; `stack.stop()` — exécuté même si un test échoue — tue le Backend, ferme les proxies, supprime les profils Desktop (bases SQLCipher et secrets) et les lignes MySQL créées.

## Scénarios

| Fichier | Contenu |
| --- | --- |
| `01-bootstrap-and-isolation` | bootstrap en ligne puis réseau coupé ; cache patients/rendez-vous/consultations/ordonnances/catalogue ; aucune donnée d’un autre workspace (Desktop et protocole) ; base réellement chiffrée |
| `02-offline-create-and-reconnect` | création hors ligne, coalescing avant la première tentative, `attempt_count = 0`, reconnexion normale (reconcile → push → pull → ack), mapping, versions ; ordonnance : une opération, dernier contenu, ni numéro ORD ni PDF |
| `04-lost-ack` | **P0** : ACK perdu après CREATE puis après UPDATE, modification locale, rejeu de X avec le payload A, nouvelle opération Y avec la version de l’ACK. Consultation **et** Prescription |
| `05-network-faults` | timeout ambigu (avec/sans traitement serveur), reset TCP avant/après traitement, latence en dessous/au-dessus du timeout, requête dupliquée |
| `06-desktop-restart` | Desktop tué avant tout HTTP, après la réponse du serveur, après application de l’ACK, après le pull ; modification locale après crash ; deux `sync_now` simultanés |
| `07-backend-restart` | Backend tué avant le traitement et juste après le commit ; pas d’opération à moitié appliquée ; nonce toujours refusé après redémarrage |
| `08-operation-idempotency` | même id + même payload ; même id + autre payload (`OPERATION_ID_PAYLOAD_MISMATCH`) ; id d’un autre appareil (`OPERATION_ID_ALREADY_USED`) ; PATIENT/APPOINTMENT non poussables ; aucun numéro/statut officiel dans un brouillon |
| `09-multi-device-conflict` | deux Desktops réels sur la version 5 : ACK v6 puis `CONFLICT`, Cloud inchangé, travail du second conservé |
| `10-scope-revocation` | patient retiré du scope : purge si propre ; verrouillage et conservation si données non synchronisées, sur plusieurs sessions, déverrouillage au retour |
| `11-device-proof-and-grants` | 7 altérations de la PoP, horodatage futur, nonce rejoué, appareil révoqué (reconcile/push/pull/ack), grant expiré, absence de refresh silencieux |
| `12-prescription-not-editable` | ordonnance validée côté Cloud pendant l’édition offline : `PRESCRIPTION_NOT_EDITABLE`, ordonnance intacte, édition conservée, pas de retry |

Les matrices Consultation/Prescription sont écrites une fois (`support/entities.ts`) et exécutées pour les deux agrégats.

Chaque test vérifie **trois niveaux** : la réponse, MySQL (lignes, `syncVersion`, `SyncOperation`, `payloadHash`, `SyncEntityMap`) et SQLCipher (entité locale, `sync_outbox`, `attempt_count`, statut, `base_version`, mapping, conflits).

## Invariants vérifiés

- Cloud = source de vérité ; jamais de Last-Write-Wins (`CONFLICT` explicite, travail local conservé dans `sync_conflicts`).
- Une opération tentée est immuable (même `operationId`, même enveloppe) ; seule une nouvelle opération (nouvel id, `baseVersion` de l’ACK) porte une modification ultérieure.
- Une entité = une ligne Cloud, un mapping, une `SyncOperation` par `operationId`, quel que soit le nombre de rejeux.
- Rien n’est exécuté quand la preuve de possession, le grant ou l’appareil est refusé.
- Les brouillons offline restent des brouillons : aucun numéro ORD, aucun PDF, aucune validation.
- Une donnée locale non synchronisée n’est jamais détruite par un changement de scope.

## Défauts trouvés par le banc, corrigés dans le moteur

Les assertions n’ont pas été affaiblies : les défauts ont été corrigés (`desktop/src-tauri/src`), chacun avec un test unitaire Rust de non-régression qui échoue sans le correctif.

1. **Écho de sa propre écriture traité comme un conflit** (`apply_pull`, `database.rs`). Après un ACK perdu suivi d’une modification locale, le `pull` ramène la version que l’appareil vient d’acquitter ; l’UPDATE de suite étant en attente, elle était enregistrée comme conflit (consultation : conflit parasite) ou gelait l’outbox (ordonnance : `CONFLICT`, la modification B n’était **jamais** envoyée). Une version serveur ≤ `base_version` locale est désormais un écho : ni conflit ni écrasement. Une version strictement plus récente reste un conflit.
2. **Deux `sync_now` simultanés** (`network.rs`, `database.rs`). Aucun verrou n’existait : chaque session appliquait l’ACK de X et mettait en file **deux** UPDATE pour la même modification. Les sessions sont désormais sérialisées (une seule à la fois ; la seconde attend puis n’a rien à faire), et l’application d’un résultat déjà appliqué est sans effet, sous transaction `IMMEDIATE`.
3. **Purge silencieuse après verrouillage** (`patient_unsent_state`, `database.rs`). Un patient sorti du scope avec une consultation/ordonnance non synchronisée était bien verrouillé à la première session, mais cette session poussait l’opération, le serveur la rejetait (`PATIENT_OUTSIDE_OFFLINE_SCOPE`, statut `REJECTED`), et la session suivante ne voyait plus « rien d’en attente » : le patient était **purgé avec le seul exemplaire du travail clinique**. Toute opération non acquittée (`status <> 'ACK'`, donc aussi `CONFLICT` et `REJECTED`) protège désormais le dossier. Conséquence assumée : une opération `REJECTED` pour sortie de scope n’est pas rejouée si le patient revient dans le scope (la donnée locale reste, déverrouillée, mais sa synchronisation demande une action explicite — voir Recommandations).

## Limites

- **Windows** : le moteur est testé sous Linux/macOS/Windows avec un coffre fichier. Ne sont **pas** couverts : Windows Credential Manager (fragmentation des secrets > 2 560 octets, comptes verrouillés), cycle de vie de l’application Windows, installeur, WebView2, UI. À valider sur une machine Windows avant packaging (voir Recommandations).
- **Horloge** : l’expiration locale du grant (`exp` du JWT, +60 s de tolérance de `jsonwebtoken` et +60 s d’`assert_clock`) ne peut pas être atteinte en quelques secondes sans horloge injectable ; seule l’expiration **serveur** (`OfflineAccessGrant.expiresAt`) est exercée de bout en bout.
- **Crash Backend en cours de transaction** : non contrôlable de l’extérieur. L’opération et la mutation clinique étant une seule transaction, les deux états observables (avant / après commit) sont testés, ainsi que l’absence d’opération orpheline.
- **Requête dupliquée** : le doublon exact (même nonce) est arrêté par l’anti-rejeu avant d’atteindre le service de sync ; le rejeu *re-signé* avec le même `operationId` (scénario 13) prouve l’idempotence du service lui-même.
- **Deux instances de l’application** sur la même base SQLCipher (deux processus) ne sont pas sérialisées par le verrou de session (en mémoire) ; l’idempotence de l’application des résultats, sous transaction `IMMEDIATE`, les protège néanmoins d’une double mise en file.
- Le proxy est un outil de test maison : il a ses propres limites (HTTP/1.1 uniquement, pas de TLS). Les fautes TCP bas niveau (fragmentation, MTU) ne sont pas simulées.

## Ajouter un scénario

1. `const stack = await OfflineE2EStack.start()` dans `beforeAll`, `stack.stop()` dans `afterAll`.
2. `stack.fixtures.clinic('label')` pour un cabinet et deux patients fictifs ; `stack.desktop(clinic, 'A')` puis `await desktop.register()`.
3. Piloter : `desktop.network.dropResponse(SYNC_PUSH)`, `desktop.sync()`, `adapter.save(...)`, `desktop.local()` pour lire SQLCipher, `stack.probe.*` pour lire MySQL.
4. Pas de `sleep` : `pollUntil()` ou l’état explicite du proxy (`allFaultsFired()`, `count()`).
5. Données synthétiques uniquement ; la trace (`trace()`) n’émet que des champs techniques.
