# HealixDz Desktop — Offline-First V1

Cette implémentation suit la première verticale de la spécification : connexion en ligne, enregistrement d’un appareil, bootstrap clinique limité, consultation locale, puis synchronisation vers le Cloud.

## Frontières de sécurité

- Le Cloud reste la source centrale de vérité.
- Le bootstrap est calculé côté serveur à partir de l’utilisateur, du workspace, du rôle et du lien clinique. Un médecin affilié ne reçoit que les patients liés à ses consultations ou rendez-vous.
- Le Desktop utilise SQLCipher. La clé de base, la clé privée de l’appareil et le grant offline sont placés dans le coffre-fort du système d’exploitation.
- Aucune donnée clinique n’est stockée dans `localStorage`, `sessionStorage`, un fichier JSON ou les logs.
- Le grant offline RSA est vérifiable localement, expire par défaut après 24 heures et est revalidé côté serveur à chaque synchronisation. La révocation bloque le prochain accès réseau; l’expiration limite le risque d’un appareil durablement déconnecté.
- Changer d’utilisateur ou de workspace purge le périmètre clinique local précédent avant d’appliquer le nouveau bootstrap.

## API

Authentification Web existante, utilisée uniquement en mémoire pendant l’enregistrement :

- `POST /api/auth/login`
- `POST /api/devices/register`
- `GET /api/devices`
- `POST /api/devices/:deviceId/grant`
- `POST /api/devices/:deviceId/revoke`

Les routes de synchronisation utilisent `Authorization: Bearer <OfflineAccessGrant>` :

- `POST /api/sync/bootstrap`
- `POST /api/sync/push`
- `GET /api/sync/pull?cursor=...`
- `POST /api/sync/ack`

Le curseur est opaque. Chaque mutation contient un UUID `operationId`; le serveur conserve son résultat et le retourne à l’identique lors d’un retry. Les mises à jour de consultation exigent `baseVersion`. Une version divergente produit `CONFLICT` et ne remplace jamais silencieusement la donnée serveur.

### Immutabilité de l’outbox et retries

Chaque `SyncOperation` durable porte également un `payloadHash` SHA-256 (hexadécimal minuscule) calculé sur une représentation JSON canonique de `entityType`, `localEntityId`, `operation`, `baseVersion` et `payload`. Les clés des objets JSON sont triées récursivement ; l’ordre des tableaux reste significatif. `occurredAt` est volontairement exclu : il s’agit de métadonnée de transport, pas du contenu clinique.

> **Invariant : une fois une opération tentée, son `operationId` et son payload sémantique sont immuables.**

Le Desktop inscrit `attempt_count` et les horodatages de première/dernière tentative dans SQLCipher **avant** l’appel HTTP. Une panne DNS, TLS, un timeout ou un crash conserve donc l’opération figée et un retry renvoie exactement la même enveloppe. Tant que `attempt_count = 0`, les sauvegardes peuvent coalescer une création locale en une seule opération.

Quand un ACK est perdu puis qu’un clinicien modifie le brouillon, l’ancienne enveloppe est réessayée telle quelle. À son ACK, le mapping et la `serverVersion` sont appliqués sans écraser la version locale plus récente ; une nouvelle UPDATE, avec un nouvel `operationId` et la `baseVersion` de l’ACK, est alors créée. Une CREATE n’a donc jamais d’UPDATE dépendante envoyée avant son ACK.

Deux règles complètent ce mécanisme (révélées par le banc de [offline-reliability-testing.md](offline-reliability-testing.md)) :

- **Écho de sa propre écriture.** Le flux `SyncChange` ramène aussi les écritures de l’appareil lui-même. Un changement tiré dont la version est ≤ à la `base_version` locale (la dernière version serveur intégrée par l’ACK) est un écho : il n’écrase pas le travail local non envoyé et ne crée pas de conflit. Seule une version **strictement plus récente** que la base du travail local est une divergence (`sync_conflicts`).
- **Une seule session de synchronisation à la fois.** `sync_now` est sérialisé (un verrou de processus) : un second appel attend la fin du premier au lieu de sélectionner et d’envoyer les mêmes opérations. L’application d’un résultat déjà appliqué à une opération (ACK, CONFLICT, REJECTED) est sans effet, sous transaction SQLite `IMMEDIATE` : un même ACK n’enfile jamais deux UPDATE de suite.

Le serveur renvoie son résultat durable uniquement si le même appareil réessaie le même `operationId` avec le même `payloadHash`. Un autre appareil reçoit `OPERATION_ID_ALREADY_USED`; un payload différent reçoit `OPERATION_ID_PAYLOAD_MISMATCH`, sans retry automatique et sans exposer le payload clinique dans les logs. Les anciennes lignes serveur reçoivent un marqueur legacy distinct : elles sont traitées conservativement comme non comparables à une nouvelle enveloppe canonique.

## Preuve de possession (device PoP) et anti-rejeu

Chaque route `/api/sync/*` passe deux guards : le grant offline (`OfflineGrantGuard`) puis la preuve de possession (`DeviceProofGuard`). Avec le Bearer, la requête porte quatre en-têtes :

| En-tête | Contenu |
| --- | --- |
| `x-healix-device-id` | Identifiant de l’appareil enregistré |
| `x-healix-device-timestamp` | Horodatage de la signature (secondes Unix) |
| `x-healix-device-nonce` | Nonce aléatoire cryptographique, jamais réutilisé |
| `x-healix-device-signature` | Signature RSA-PSS / SHA-256 |

La chaîne canonique signée est strictement identique des deux côtés (`buildDeviceCanonicalString` côté serveur, `protocol.rs` côté desktop) ; le serveur la reconstruit depuis la requête, il ne lit jamais la chaîne elle-même :

```
METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256\nDEVICE_ID\n
```

- `PATH` est le chemin **sans** la chaîne de requête : le curseur de pull n’est pas secret et le corps, lui, est toujours couvert par `BODY_SHA256` (`SHA-256` hexadécimal ; le `GET` signe le hash du corps vide, `EMPTY_BODY_SHA256`). Le `\n` final supprime toute ambiguïté de concaténation.
- La signature RSA-PSS exige, **des deux côtés**, un sel de 32 octets (longueur du digest SHA-256). La vérification serveur passe par WebCrypto `subtle` avec `saltLength: 32` exact : sans mécanisme d’auto-récupération OpenSSL côté serveur, une signature produite avec un autre sel est rejetée net. Les règles sont gelées dans `backend/src/offline-devices/device-proof.ts` et `desktop/src-tauri/src/protocol.rs` ; les constantes nominatives sont aussi exposées (`CANONICAL_HEADERS`, `SIGNATURE_ALGORITHM`, `TIMESTAMP_TOLERANCE_SECONDS`) pour figer le contrat au niveau wire.
  - Piège Node documenté : `node:crypto` n’exporte pas `RSA_PKCS1_PSS_PADDING` au niveau racine (uniquement via `crypto.constants`). Un import nommé compile en `undefined` et fait **silencieusement** signer en PKCS#1 v1.5 ; toujours passer par `crypto.constants.RSA_PKCS1_PSS_PADDING` (ou le littéral `6`).
- - Anti-rejeu : la fenêtre d’horloge est de ±300 s (`DEVICE_TIMESTAMP_WINDOW_SECONDS`) ; après vérification de la signature, le guard insère le nonce dans la table durable `device_request_nonces` (clé unique par appareil). Une réémission de la même requête tombe sur le `P2002` de l’insertion et reçoit `401 Requête rejouée (nonce déjà utilisé)` : la requête n’est jamais traitée deux fois. Les lignes expirent avec la même fenêtre (TTL `DEVICE_NONCE_TTL_SECONDS`) et les nonces périmés sont supprimés au passage ; la table survit aux redémarrages du backend, un rejeu à froid reste donc détecté.

## Scope de synchronisation V1

Le périmètre est calculé **côté serveur** (`offline-scope.service.ts`, jamais côté desktop) à chaque bootstrap et à chaque reconciliation :

- `AFFILIATED_DOCTOR` (relation clinique assignée) : un patient est autorisé tant qu’au moins une condition tient pour ce `doctorProfileId` précis — une consultation créée dans la fenêtre récente (`recentConsultationDays`) ou encore ouverte (`DRAFT` / `IN_PROGRESS`), **ou** un rendez-vous planifié dans la fenêtre symétrique des rendez-vous (`upcomingAppointmentDays` dans le passé comme dans le futur). Voir un patient une fois « pour toujours » est le bug corrigé : `consultations.some({ doctorProfileId })` sans filtre temporel n’est plus acceptable.
- `INDEPENDENT_DOCTOR` : choix V1 assumé — le workspace est le propre cabinet du médecin, donc tout patient administrativement actif du workspace courant est autorisé. C’est une autorisation de cache annuaire du cabinet, **pas** un droit offline transversal aux workspaces.
- Les données sensibles hors cache (`nationalId`, téléphone, contacts d’urgence, notes cliniques) ne quittent jamais le serveur en V1 : ni le bootstrap ni le flux pull ne les sélectionnent.

Sens de la synchronisation :

- **Push** : les consultations uniquement. Le DTO rejette explicitement `PATIENT` et `APPOINTMENT` (read-only Cloud → Desktop).
- **Pull** : le flux est revalidé contre le scope **courant** à chaque appel — un changement enregistré alors qu’un patient était dans le scope cesse d’être livré dès qu’il en sort.
- `POST /api/sync/reconcile` : reconciliation légère sans payload clinique, appelée en tête de session de sync ; le desktop purge ou verrouille immédiatement un patient sorti du scope sans attendre un bootstrap complet.

## Purge locale des patients sortis du scope

Le serveur renvoie la liste autoritaire `authorizedPatientIds` (bootstrap complet et reconcile léger). Le desktop la réconcilie (`reconcile_patients_tx`) : une ligne de cache **propre** est purgée avec tout ce qui en dépend ; une ligne portant des données **non envoyées** (pending / conflicted) est **verrouillée** plutôt que purgée, pour qu’aucune écriture clinique locale ne disparaisse silencieusement. Le changement d’utilisateur ou de workspace, lui, purge la totalité du périmètre local avant d’appliquer le nouveau bootstrap (anti-contamination entre espaces cliniques).

Il n’y a **pas** de TOMBSTONE en V1 : la sortie d’un patient du scope est propagée par la liste autoritaire (pas par des événements de suppression dans le flux).

## Bootstrap transactionnel (snapshot)

`POST /api/sync/bootstrap` lit workspace, utilisateur, scope, patients, consultations, rendez-vous **et** le dernier `SyncChange.sequence` dans **une seule transaction `REPEATABLE READ`** (`timeout` 30 s, `maxWait` 10 s). Toutes les lectures partagent le même snapshot MySQL/MariaDB : une consultation mise à jour par le web après le snapshot ne peut être ni doublée, ni manquée — soit sa ligne (nouvelle version) est dans le bootstrap, soit son `SyncChange` (séquence > curseur) arrivera au pull suivant. L’invariant « écriture dans le bootstrap OU jamais perdue » est vérifié par le test de course `sync-bootstrap-race.integration.spec.ts`.

Les limites multi-appareils d’un même utilisateur partagent les règles de concurrence : la création d’une consultation complète (`READY_TO_SYNC`) est atomique, une seconde écriture locale se voit refuser le conflit par statut, et la version serveur ne change pas.

## Limites connues de la V1 (choix assumés)

- **Rétention du flux `SyncChange`** : les lignes ne sont pas purgées (pas de TTL, pas d’archivage). La croissance du flux est bornée par l’activité ; le chantier SyncChange retention est reporté et reste documenté ici.
- **TOMBSTONE** : non implémenté (purge par liste autoritaire, voir plus haut).
- La prescription offline et le patient d’urgence appartiennent aux verticales suivantes ; aucune nouvelle entité offline n’est introduite ici.

## Stockage local

Le schéma local est volontairement distinct de Prisma/MySQL. Il contient le cache clinique autorisé, les brouillons, l’outbox, le mapping UUID local → ID serveur, les métadonnées, les conflits et l’état du curseur. Les consultations, signes vitaux et diagnostics sont synchronisés comme un seul agrégat.

Les rendez-vous sont uniquement lisibles. L’IA, DICOM, l’administration, les abonnements et les fichiers patients restent online-only. La prescription offline et le patient d’urgence appartiennent respectivement aux verticales 2 et 3.

## Configuration

Le backend exige en production une paire RSA dédiée :

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out offline-private.pem
openssl pkey -in offline-private.pem -pubout -out offline-public.pem
```

Renseigner `OFFLINE_GRANT_PRIVATE_KEY`, `OFFLINE_GRANT_PUBLIC_KEY` (PEM ou PEM encodé en base64) et `OFFLINE_GRANT_LIFETIME_HOURS`. En développement seulement, une paire éphémère est générée si les variables sont absentes; les grants deviennent alors invalides au redémarrage du backend.

## Lancement Desktop

```bash
cd desktop
npm install
npm run tauri dev
```

`VITE_API_BASE_URL` peut remplacer `http://localhost:3001/api`. Hors localhost, le Desktop refuse une URL non HTTPS.
