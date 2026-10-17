# Messagerie HealixDZ — conception et architecture

Rédigé le 2026-10-16, à partir du code (`main` au commit 41514c4) et des recherches citées en fin de document.

## 1. Le principe directeur

Une messagerie de santé n'est pas WhatsApp en interne. Trois règles reviennent dans toutes les références : NHS England, MPS et la doctrine MSSanté.

1. **La messagerie n'est pas le dossier patient.** Un avis reçu par message doit être reporté dans le dossier, avec son auteur. HealixDZ doit le permettre en un clic : « Verser au dossier ».
2. **Les données patient circulent dans un cadre identifié.**
   - Une discussion à propos d'un patient est une **discussion de cas**, rattachée à ce patient, avec le contrôle d'accès du dossier et un journal d'audit.
   - Hors de ce cadre, l'interface décourage la saisie d'identifiants de patient.
3. **Rien de clinique ne sort de la plateforme.** Les e-mails et notifications disent seulement « Nouveau message sur HealixDZ », jamais le nom du patient ni le contenu.

Le cadre légal algérien va dans le même sens. Ce qui suit vient de sources secondaires et doit être vérifié par un juriste.
- La loi 18-07 est en vigueur depuis le 10 août 2023, sous le contrôle de l'ANPDP. Elle impose une déclaration ou une autorisation des traitements, et une autorisation préalable pour tout transfert à l'étranger.
- La loi 25-11 (JO n° 48 du 24 juillet 2025) ajoute un délégué à la protection des données obligatoire, un registre des traitements et un carnet automatisé des opérations. Elle prévoit aussi une notification des violations sous 5 jours, mais le champ exact de cette obligation reste à confirmer.
- Conséquences pour HealixDZ :
  - hébergement en Algérie ;
  - aucun service tiers étranger pour les messages (pas de Firebase, pas de Pusher) ;
  - journal des accès ;
  - chiffrement au repos ;
  - durée de conservation définie.

## 2. Qui parle à qui

Les utilisateurs actuels sont des professionnels : administrateur d'établissement, médecin affilié, médecin indépendant. Les patients ne sont pas des utilisateurs, et le support (SUPER_ADMIN) en est un à part.

Un médecin indépendant est seul dans son espace. Une messagerie limitée à l'espace ne lui servirait à rien. La valeur de HealixDZ, c'est **l'échange entre confrères vérifiés**.

| Type de conversation | Participants | Données patient | Lot |
|---|---|---|---|
| **DIRECT** (1:1) | deux professionnels **vérifiés**, d'un même espace ou de deux espaces différents | à éviter (avertissement dans l'interface) | 1 |
| **GROUP** (équipe) | membres d'un même espace, avec un nom | à éviter | 1 |
| **CASE** (discussion de cas) | membres de l'espace du patient | oui : rattachée au patient, avec audit | 4 |
| **REFERRAL** (télé-expertise entre espaces) | demandeur + expert d'un autre espace | partage explicite, limité dans le temps, avec consentement | 5 |
| **SUPPORT** | professionnel ↔ équipe HealixDZ | non | plus tard |

**Annuaire et anti-spam**
- Seuls les comptes VERIFIED et ACTIVE apparaissent dans l'annuaire, et seulement s'ils ont choisi d'être joignables par des confrères (réglage « joignable par des confrères », activé par défaut pour les médecins).
- Le premier message d'une personne extérieure à l'espace arrive comme une **demande** : le participant est en statut PENDING. Le destinataire l'accepte ou la refuse. Il peut aussi **bloquer** l'expéditeur.
- Pas de groupe ouvert entre espaces dans les premiers lots.

## 3. Choix techniques et pourquoi

| Sujet | Choix | Raison |
|---|---|---|
| Écritures (envoyer, lire, modifier) | **REST** (contrôleurs Nest) | réutilise les gardes, la validation, le throttler par utilisateur, l'audit et les tests existants |
| Diffusion en temps réel | **WebSocket via Socket.IO** (`@nestjs/websockets`, `@nestjs/platform-socket.io`), du serveur vers le client uniquement | reconnexion, salles par utilisateur, accusés ; Caddy relaie les WebSocket sans configuration |
| Ordre et rattrapage | **numéro de séquence par conversation** (`seq`), attribué en transaction | ordre exact ; après une coupure, le client demande « tout ce qui suit seq N » ; aucun message perdu, même si un événement temps réel manque |
| Idempotence | `clientMessageId` (UUID du client), unique par expéditeur | un renvoi après une coupure réseau ne crée pas de doublon |
| Non-lus | `lastReadSeq` par participant ; non-lus = `lastSeq − lastReadSeq` | calcul en O(1), sans une ligne par message et par lecteur |
| Accusé de lecture « urgent » | table `MessageAck`, seulement pour les messages marqués « accusé requis » | règle clinique : un avis urgent doit être confirmé ; sinon on remonte au demandeur |
| Chiffrement | TLS pour le transport ; **AES-256-GCM applicatif** du corps des messages et des pièces jointes au repos (`MESSAGING_KEYS`, avec un identifiant de clé pour la rotation) | une fuite de sauvegarde ou de base ne révèle pas les messages ; s'ajoute au chiffrement `age` des sauvegardes |
| Chiffrement de bout en bout | **non** | incompatible avec l'audit, la conservation médico-légale, le « verser au dossier », le multi-appareil et l'accès de l'établissement ; la doctrine MSSanté repose aussi sur un espace de confiance contrôlé par l'opérateur |
| Recherche | par participant, titre ou patient ; **pas dans le texte** au premier lot | le texte est chiffré ; une recherche plein texte demanderait un index séparé, reporté |
| Montée en charge | aujourd'hui une seule instance du backend (adaptateur en mémoire) ; plus tard **Redis + `@socket.io/redis-adapter`**, clients en `transports: ['websocket']` (pas de sessions collantes) | même code, ajout d'un service dans docker-compose |
| Fournisseurs externes (Pusher, Firebase, Ably) | **exclus** | localisation des données (loi 18-07) |

**Pourquoi pas SSE ?** C'est possible et plus simple, mais les indicateurs de saisie et les rafales d'événements d'un usage multi-onglets fonctionnent mieux avec Socket.IO. Le choix « REST pour écrire, WebSocket pour diffuser » garde l'essentiel de la logique dans le REST, déjà testé.

## 4. Modèle de données (Prisma)

```prisma
enum ConversationType { DIRECT GROUP CASE REFERRAL SUPPORT }
enum ParticipantStatus { PENDING ACTIVE LEFT BLOCKED }
enum MessageKind { TEXT SYSTEM ATTACHMENT }
enum MessagePriority { NORMAL URGENT }

model Conversation {
  id            String           @id @default(cuid())
  type          ConversationType
  title         String?          @db.VarChar(120)        // GROUP, CASE
  workspaceId   String?          @map("workspace_id")    // GROUP, CASE
  patientId     String?          @map("patient_id")      // CASE
  directKey     String?          @unique @map("direct_key") @db.VarChar(64) // DIRECT : ids triés, une seule conversation par paire
  createdById   String           @map("created_by_id")
  lastSeq       Int              @default(0) @map("last_seq")
  lastMessageAt DateTime?        @map("last_message_at")
  archivedAt    DateTime?        @map("archived_at")
  createdAt     DateTime         @default(now()) @map("created_at")
  updatedAt     DateTime         @updatedAt @map("updated_at")
  @@index([workspaceId, lastMessageAt])
  @@index([patientId])
  @@map("conversations")
}

model ConversationParticipant {
  id             String            @id @default(cuid())
  conversationId String            @map("conversation_id")
  userId         String            @map("user_id")
  role           String            @db.VarChar(20)          // OWNER | MEMBER
  status         ParticipantStatus @default(ACTIVE)
  lastReadSeq    Int               @default(0) @map("last_read_seq")
  mutedUntil     DateTime?         @map("muted_until")
  joinedAt       DateTime          @default(now()) @map("joined_at")
  leftAt         DateTime?         @map("left_at")
  @@unique([conversationId, userId])
  @@index([userId, status])
  @@map("conversation_participants")
}

model Message {
  id              String          @id @default(cuid())
  conversationId  String          @map("conversation_id")
  seq             Int
  senderId        String?         @map("sender_id")        // null = message système
  clientMessageId String?         @map("client_message_id") @db.VarChar(64)
  kind            MessageKind     @default(TEXT)
  bodyCiphertext  Bytes?          @map("body_ciphertext")   // AES-256-GCM : iv(12) || tag(16) || données
  keyId           String?         @map("key_id") @db.VarChar(16)
  priority        MessagePriority @default(NORMAL)
  requiresAck     Boolean         @default(false) @map("requires_ack")
  replyToId       String?         @map("reply_to_id")
  editedAt        DateTime?       @map("edited_at")
  deletedAt       DateTime?       @map("deleted_at")       // suppression logique : « message supprimé »
  createdAt       DateTime        @default(now()) @map("created_at")
  @@unique([conversationId, seq])
  @@unique([senderId, clientMessageId])
  @@map("messages")
}

model MessageRevision { // historique des modifications (médico-légal), jamais montré par défaut
  id String @id @default(cuid())
  messageId String @map("message_id")
  bodyCiphertext Bytes @map("body_ciphertext")
  keyId String @map("key_id") @db.VarChar(16)
  createdAt DateTime @default(now()) @map("created_at")
  @@map("message_revisions")
}

model MessageAttachment { messageId, storagePath, mimeType, sizeBytes, sha256, originalName, patientDocumentId? }  // fichiers chiffrés sur disque
model MessageAck { messageId, userId, ackedAt  @@unique([messageId, userId]) }
model UserBlock { blockerId, blockedId, createdAt  @@unique([blockerId, blockedId]) }
model Notification { id, userId, type, entityType, entityId, readAt?, createdAt }   // centre de notifications (la cloche)
```

**Attribution du numéro de séquence**, dans une transaction MySQL :
```sql
UPDATE conversations SET last_seq = last_seq + 1, last_message_at = NOW() WHERE id = ?;
SELECT last_seq FROM conversations WHERE id = ?;   -- même transaction, ligne verrouillée
INSERT INTO messages (..., seq) VALUES (..., last_seq);
```

## 5. API REST (préfixe `/api/messaging`)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/conversations?cursor&type&status` | liste triée par `lastMessageAt`, avec non-lus, aperçu déchiffré et tronqué, et participants |
| POST | `/conversations` | création : DIRECT (dédoublonnée par `directKey`), GROUP ou CASE |
| GET | `/conversations/:id` | détail et participants |
| PATCH | `/conversations/:id` | titre, archivage, sourdine |
| POST/DELETE | `/conversations/:id/participants` | gestion des membres d'un GROUP par son OWNER |
| POST | `/conversations/:id/accept` · `/decline` | réponse à une demande de contact |
| GET | `/conversations/:id/messages?beforeSeq&limit` | historique, page par page |
| GET | `/conversations/:id/messages?afterSeq` | rattrapage après une reconnexion |
| POST | `/conversations/:id/messages` | `{ clientMessageId, body ≤ 4000, priority, requiresAck, replyToId?, attachmentIds? }` |
| PATCH | `/messages/:id` | modification par l'auteur dans les 15 minutes ; l'ancienne version va dans `MessageRevision` |
| DELETE | `/messages/:id` | suppression logique par l'auteur ; le contenu est conservé chiffré pour l'audit |
| POST | `/conversations/:id/read` | `{ seq }` met à jour `lastReadSeq` (jamais vers l'arrière) |
| POST | `/messages/:id/ack` | accusé d'un message urgent |
| POST | `/attachments` | envoi d'un fichier : PDF, PNG ou JPEG, 10 Mo au plus, type vérifié sur le contenu, chiffré sur disque |
| GET | `/attachments/:id` | téléchargement, réservé aux participants |
| POST | `/messages/:id/file-to-record` | CASE uniquement : crée une note dans le dossier du patient, avec auteur, date et lien vers le message (lot 4) |
| GET | `/directory?search&speciality&wilaya` | professionnels vérifiés et joignables |
| POST/DELETE | `/blocks/:userId` | bloquer ou débloquer |
| GET | `/unread-count` | total des non-lus pour le badge du menu |

**Autorisation à chaque appel**
- L'utilisateur doit être un participant ACTIVE.
- Pour une conversation CASE, il doit **en plus** avoir encore le patient dans son périmètre (`PatientsService.getPatientInScope`). Un médecin qui quitte l'établissement perd l'accès.
- Une erreur d'autorisation répond toujours 404, jamais 403, pour ne pas révéler l'existence d'une conversation.

## 6. Temps réel (Socket.IO)

- Passerelle `RealtimeGateway`, chemin `/api/realtime` (Caddy le relaie déjà, puisqu'il se trouve sous `/api/*`).
- **Authentification à la poignée de main** : le cookie `access_token` est vérifié comme le fait la stratégie JWT, et le compte doit être VERIFIED et ACTIVE. Sinon, déconnexion immédiate.
  - Le jeton d'accès dure 15 minutes. La connexion vérifie son expiration et ferme la socket avec le code `token_expired`. Le client fait alors un refresh REST, puis se reconnecte.
- **Salles** : `user:<id>`. Le serveur n'émet que vers des utilisateurs, jamais vers une « salle de conversation » à laquelle un client choisirait de s'abonner : aucune donnée n'est donc poussée sans contrôle d'accès.
- **Événements, du serveur vers le client uniquement**, avec seulement des identifiants (le client relit en REST) :
  - `message.created { conversationId, seq }` ;
  - `message.updated { conversationId, messageId }` ;
  - `conversation.updated { conversationId }` ;
  - `read.updated { conversationId, userId, seq }` ;
  - `typing { conversationId, userId }` : envoyé par `POST /conversations/:id/typing`, au plus une fois toutes les 3 secondes ;
  - `notification.created`.
- **Émission après la validation de la transaction**. Si une émission échoue, le client rattrape grâce à `afterSeq` à la reconnexion et à chaque retour de focus. Il n'y a donc pas besoin d'une table outbox.
- Pas de présence « en ligne » au premier lot : elle touche à la vie privée et n'est pas utile cliniquement.
- **CSP** : ajouter `wss://<APP_DOMAIN>` à `connect-src` en production. `'self'` ne couvre pas `wss:` sur tous les navigateurs.

## 7. Sécurité, conformité, audit

- **Journal** :
  - création, ajout ou retrait de participant, modification et suppression de message, export « verser au dossier », blocage ;
  - pour CASE : `MESSAGES_VIEWED` une fois par jour, par utilisateur et par conversation, dans le journal du patient.
- **Throttler** : 30 messages par minute et par utilisateur ; 10 pièces jointes par minute ; 20 nouvelles conversations par heure.
- **Contenu** : texte brut uniquement (pas de HTML ni de Markdown), liens rendus par l'interface et ouverts avec `rel="noopener noreferrer"`. Le texte est normalisé par `sanitizeTextInput`.
- **Notifications externes** : un e-mail récapitulatif seulement si un message reste non lu 30 minutes, sans aucun contenu, au plus 1 par heure, désactivable.
- **Conservation** : pas de suppression automatique au premier lot. La durée doit être fixée avec le délégué à la protection des données et un juriste, puis appliquée par une tâche planifiée qui archive. Elle est documentée dans le registre des traitements.
- **Sauvegardes** : les nouvelles tables sont dans le `mysqldump` ; les pièces jointes sont dans `uploads/` ; la clé `MESSAGING_KEYS` est sauvegardée **séparément**.
- **Avertissement contextuel** : dans une conversation DIRECT ou GROUP, un bandeau discret indique « Pour parler d'un patient, ouvrez une discussion de cas depuis son dossier ».

## 8. Interface

- Page **Messages** en trois colonnes (une seule colonne sur mobile) :
  - liste des conversations, avec filtres Tous / Non lus / Cas / Demandes ;
  - fil de messages ;
  - panneau de contexte : participants, et pour une conversation CASE la fiche du patient avec ses liens vers le dossier et les analyses IA.
- Fil :
  - regroupement par jour ;
  - envoi optimiste avec états « en cours » → « envoyé » → « lu par N » ;
  - nouvel essai sur échec ;
  - réponse citée ;
  - indicateur de saisie ;
  - séparateur « nouveaux messages » ;
  - chargement de l'historique en remontant.
- Zone de saisie : priorité urgente avec accusé, pièces jointes, Entrée pour envoyer et Maj+Entrée pour un retour à la ligne.
- Badge de non-lus dans le menu, cloche de notifications reliée à `Notification`.
- Depuis le dossier patient : bouton « Discuter du cas » qui crée ou ouvre la conversation CASE.
- RTL et arabe complets ; accessibilité : `aria-live` pour les nouveaux messages, focus géré, aucune information portée par la couleur seule.
- État de la connexion temps réel : « Reconnexion… » discret, l'envoi par REST restant possible.

## 9. Découpage en lots

1. **Lot 1 — socle backend** : schéma et migration, chiffrement, conversations DIRECT et GROUP, messages avec `seq` et `clientMessageId`, lecture, modification et suppression, annuaire, demandes, blocage, throttler, audit, tests (y compris l'intégration MySQL pour la concurrence sur `seq`).
2. **Lot 2 — temps réel** : passerelle Socket.IO, authentification, émission après la transaction, saisie, tests.
3. **Lot 3 — interface Messages** : page, hooks TanStack Query avec cache mis à jour par les événements, badges, cloche, i18n et RTL.
4. **Lot 4 — discussions de cas** : CASE, pièces jointes chiffrées, urgent avec accusé, « verser au dossier » (nouveau modèle `PatientClinicalNote`, source MESSAGING), audit patient.
5. **Lot 5 — télé-expertise entre espaces** : demande d'avis, partage explicite d'un résumé et de documents choisis, consentement patient `TELEEXPERTISE`, accès limité dans le temps et révocable, compte rendu d'avis. Une analyse d'impact est à faire avant.
6. **Plus tard** : Redis pour plusieurs instances du backend, e-mails récapitulatifs, recherche plein texte (index séparé), canal support.

## 10. État des lots

Mis à jour le 2026-10-17.

**Lot 1 — socle backend : fait** (fusionné dans `main`).
- Schéma et migration `messaging_core`, chiffrement AES-256-GCM
  (`MESSAGING_KEYS`).
- Conversations DIRECT et GROUP, demandes de contact.
- Messages avec `seq` et `clientMessageId`, lecture et non-lus.
- Annuaire, blocages, throttler, audit.

Écarts et précisions par rapport aux sections 4 et 5 :
- clés étrangères sur toutes les références ;
- route `DELETE /conversations/:id/participants/:userId` ;
- routes ajoutées : `GET /blocks`, `GET/PATCH /settings`
  (`discoverableByPeers`) ;
- un refus de demande passe le destinataire en `LEFT` ;
- un blocage passe la demande en attente en `BLOCKED`.

Ajouté après la revue du lot 1 : un GROUP n'est accessible qu'aux membres
`ACTIVE` de son espace.

**Lot 2 — temps réel : fait** (branche `feat/messaging-realtime`).
- Passerelle Socket.IO `/api/realtime`, transport WebSocket seul.
- Contrôles à la connexion, dans cet ordre : `Origin`, cookie, compte.
- Fermetures : à l'expiration du jeton, déconnexion forcée
  (`disconnectUser`), limite de 5 sockets par utilisateur.
- Événements émis après la validation de la transaction ; `typing` limité à
  un toutes les 3 s.
- Côté navigateur : client avec refresh sur `token_expired`, invalidation
  des requêtes TanStack Query, rattrapage `afterSeq`, CSP.

Précisions :
- l'auteur d'un événement le reçoit aussi sur ses autres onglets et
  appareils, sauf `typing` ;
- une mise en sourdine ne prévient que son auteur ;
- `read.updated` est envoyé à tous les participants (les accusés de lecture
  du lot 3 s'en servent).

**Lot 3 — interface Messages : fait** (branche `feat/messaging-interface`).
- Pages `/doctor/messages` et `/establishment/messages`, conversation
  ouverte dans `?c=` ; lien du menu avec badge de non-lus (« 99+ »).
- Trois colonnes (une seule sur mobile, avec retour) : liste filtrée
  (Toutes, Non lues, Demandes, Archivées), fil, panneau de contexte
  repliable.
- Envoi optimiste (`clientMessageId`), « non envoyé · Réessayer » avec le
  même identifiant ; modification et suppression par l'auteur pendant
  15 min.
- Demandes : bandeau Accepter / Refuser / Bloquer, un seul message avant
  l'acceptation ; nouvelle conversation par l'annuaire (recherche différée
  de 300 ms) ou groupe d'équipe.
- Lecture envoyée seulement quand le dernier message est visible et la
  fenêtre active, une fois par seconde au plus ; « X écrit… » pendant 5 s.
- `useRealtimeEvents` monté dans le shell clinique (le badge est sur toutes
  les pages), `registerOpenConversation` par le fil ; « Reconnexion… »
  discret.
- Français et arabe, RTL ; chaque message garde sa propre direction
  (`dir="auto"`).

Écarts et précisions par rapport à la section 8 :
- route ajoutée : `GET /messaging/workspace-members`, les membres actifs de
  l'espace de l'appelant, pour les groupes d'équipe (l'annuaire ne liste
  que les profils joignables, 20 au plus, et `GET /doctors` est réservé à
  l'administration) ;
- filtre « Cas », pièces jointes, urgent avec accusé et cloche : lots 4 et
  suivants ;
- « Lu » vient de `read.updated` seulement : l'API ne donne pas la position
  de lecture des autres participants, et l'état redevient « Envoyé » au
  rechargement de la page. À exposer dans un lot suivant ;
- une demande reçue n'est pas dans « Toutes » (l'API la liste à part) : son
  nombre est affiché sur le filtre « Demandes » et en tête de « Toutes » ;
- « Non lues » est filtré dans le navigateur, sur les conversations
  chargées ;
- le réglage « Joignable par des confrères » est en bas de la liste ; une
  personne bloquée se débloque depuis l'annuaire ou le panneau.

**Lots 4 et 5 : à faire.**

## Sources

- NHS England, *Instant messaging services a vital part of the NHS toolkit during a crisis* (2018) : https://www.england.nhs.uk/2018/11/instant-messaging-services-a-vital-part-of-the-nhs-toolkit-during-a-crisis/
- Medical Protection Society, *Group instant messaging in an acute care setting* : https://medicalprotection.org/uk/articles/group-instant-messaging-in-an-acute-care-setting
- ANS, doctrine MSSanté : https://esante.gouv.fr/doctrine/mssante
- Gide, alerte client ANPDP (juillet 2023) : https://www.gide.com/sites/default/files/2023-07gide_alerteclient_anpdp_fr_7.pdf
- UpGrowth, loi 25-11 (JO n° 48 du 24 juillet 2025) : https://www.upgrowth.dz/journal-officiel/loi-25-11-delegue-protection-donnees-personnelles
- AlgeriaTech News, *Why 2026 Is the Year Algeria's Data Rules Bite* : https://algeriatech.news/?p=21081
- OneUptime, *NestJS WebSocket Gateway with Redis Adapter* : https://oneuptime.com/blog/post/2026-03-31-redis-nestjs-websocket-gateway-adapter/view