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
