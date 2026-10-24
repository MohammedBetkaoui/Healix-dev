# Déploiement Docker de HealixDz

Sept conteneurs applicatifs, plus celui des sauvegardes, décrits par
[`docker-compose.yml`](docker-compose.yml) :

| Service | Image | Rôle | Réseaux | Ports publiés |
| --- | --- | --- | --- | --- |
| `caddy` | `caddy:2.11-alpine` | Proxy inverse HTTPS, certificats Let's Encrypt | edge | `80`, `443` |
| `frontend` | [`frontend/Dockerfile`](frontend/Dockerfile) | Interface Next.js (serveur autonome) | edge | aucun |
| `viewer` | [`viewer/Dockerfile`](viewer/Dockerfile) | Visionneuse d'imagerie DICOM (OHIF Viewer 3.13.13, construite depuis ses sources, servie par nginx sous `/viewer/`) | edge | aucun |
| `backend` | [`backend/Dockerfile`](backend/Dockerfile) | API NestJS, migrations, PDF (Chromium) | edge, internal | aucun |
| `mysql` | `mysql:8.4` | Base de données | internal | aucun |
| `ai-service` | [`ai-service/Dockerfile`](ai-service/Dockerfile) | Inférence (PyTorch et TensorFlow, CPU) | internal | aucun |
| `orthanc` | `orthancteam/orthanc:26.9.1` | Stockage des études DICOM et API DICOMweb (section 12) | internal | aucun |
| `backup` | [`scripts/backup/Dockerfile`](scripts/backup/Dockerfile) | Sauvegarde nocturne de la base, des fichiers et du volume d'Orthanc | internal | aucun |

- **Un seul domaine.** Tout passe par Caddy, sur `https://APP_DOMAIN` :
  `/api/*` va au backend, `/viewer/*` à la visionneuse DICOM, le reste au
  frontend. Le navigateur appelle donc
  l'API sur la même origine que les pages, et les cookies de session valent
  pour les deux. Configuration : [`caddy/`](caddy/).
- **Réseaux.**
  - `edge` (Caddy, frontend, backend, visionneuse) : le frontend et la
    visionneuse n'ont aucun accès à MySQL, au service IA ni à Orthanc.
  - `internal` (backend, MySQL, service IA, Orthanc) : `internal: true`, sans
    route vers l'extérieur.
  - Le backend sort par `edge` (SMTP).
- **Temps réel (messagerie).** Le navigateur ouvre une WebSocket sur
  `wss://APP_DOMAIN/api/realtime`. Caddy la relaie au backend comme le reste
  de `/api/*`, sans réglage particulier. **Aucun service n'est ajouté** : les
  notifications partent du backend lui-même. Redis ne deviendra nécessaire
  que le jour où plusieurs instances du backend tourneront (section 10).
- **Appels serveur du frontend.** Le serveur Next.js vérifie les sessions en
  appelant directement le backend (`API_INTERNAL_URL=http://backend:3001/api`),
  sans repasser par l'adresse publique.
- **Volumes nommés :**
  - `healixdz_mysql-data` : la base ;
  - `healixdz_patient-files` : documents patients, masques de segmentation,
    comptes rendus PDF, et les pièces jointes de la messagerie
    (`messaging/<conversation>/`, chiffrées ; une pièce jointe jamais
    envoyée est supprimée après 24 heures par une tâche horaire du backend) ;
  - `healixdz_orthanc-data` : les études DICOM d'Orthanc, l'index (`index/`,
    une base SQLite) et les fichiers (`storage/`) ;
  - `healixdz_caddy-data` et `healixdz_caddy-config` : certificats et état de
    Caddy.
- **Fichiers montés depuis le dépôt ou l'hôte, en lecture seule :**
  - les poids des modèles (`AI_MODELS_DIR`), jamais copiés dans une image ;
    le backend lit dans ce dossier les cartes des modèles cardiologiques
    (`cardio-ecg-resnet1d-ptbxl.json`, `AI_CARDIO_MODEL_CARD_PATH`, et
    `cardio-seg-acdc-unet-effb4.json`, `AI_CARDIO_SEG_MODEL_CARD_PATH`) ;
  - les rapports d'évaluation `ai-service/evaluation/` : `brain-latest.json`
    (`AI_EVALUATION_REPORT_PATH`), `pathology-*.json`
    (`AI_PATHOLOGY_EVALUATION_DIR`) et `cardio-latest.json`
    (`AI_CARDIO_EVALUATION_PATH`) et `cardio-seg-latest.json`
    (`AI_CARDIO_SEG_EVALUATION_PATH`), cités par les comptes rendus PDF ;
  - la configuration de Caddy (`caddy/`).
- **Sauvegardes** : le dossier de l'hôte `BACKUP_DIR`, où écrit le service
  `backup` (section 8).
- **Secrets.** Tous viennent du fichier `.env`, non versionné. Aucune image
  n'en contient.

## 1. Prérequis

**Démonstration locale (Windows)**

- **Docker Desktop** pour Windows, avec le moteur WSL 2. Dans *Settings >
  Resources*, comptez au moins **8 Go de mémoire** pour Docker : PyTorch,
  TensorFlow, Chromium et MySQL tournent ensemble.
- Environ **13 Go d'espace disque** pour les images. Celle du service IA pèse
  à elle seule environ **2,4 Go** (TensorFlow 1,1 Go, PyTorch 0,7 Go), contre
  1,2 Go avant l'ajout des modèles de pathologie. Ces tailles sont mesurées
  sur les paquets Python installés pour Linux, plus l'image de base
  `python:3.12-slim` ; l'image elle-même n'a pas encore été construite.
- **Git**.

**Serveur de production**

- Un serveur Linux (Debian ou Ubuntu par exemple) avec **Docker Engine** et
  le plugin **Compose** v2.24 ou plus récent ; 8 Go de mémoire, 20 Go de
  disque au moins, plus la base et les fichiers patients.
- Un **nom de domaine** dont vous gérez le DNS.
- Les ports **80 et 443** joignables depuis Internet.

Dans les deux cas, les **poids des modèles** (voir ci-dessous) ne sont pas
dans le dépôt.

## 2. Poids des modèles

Par défaut, le service IA lit les poids dans le dossier `models/` à la racine
du dépôt (Git l'ignore). Pour un autre dossier, indiquez son chemin dans
`AI_MODELS_DIR` du fichier `.env` (par exemple `C:\HealixDz\models` ou
`/srv/healixdz/models`). Il est monté **en lecture seule** dans le conteneur,
à `/models`.

Les fichiers lus par le service :

| Fichier | SHA-256 |
| --- | --- |
| `fold_5_best.pth` | `311d2cbb171266721871f46f7f841b1dffef0c0fec40853745f55be9939ae654` |
| `healixdz_seg_meningioma_v5_best.pth` | `95c94047da1daaf71744e6076c5f01401c0af09d5f87335477359681ba7c939d` |
| `healixdz_seg_pituitary_v5_best.pth` | `cfd8fc4e55e6a4d7ca97e9613a95451d9680426bdd714f818786ab0e9983dd89` |
| `EfficientNetB0_BreakHis_phase2.keras` | `c8cbd905cc039ed4775c98043e04d357bcfcaf971c4b9cc592a3600f97348e6b` |
| `breakhis_inference_config.json` | `ea0646849ab49e9ce148f902895693f6a304f2e329d9cb2e591fe07c8025f552` |
| `pannuke_unet_efficientnetb0_phase2_best.keras` | `02b26d77988f7aa38a15f39e7ba9a7a8946380563e26d1ca705c805d688bbf3c` |
| `cardio-seg-acdc-unet-effb4.pt` | `252fb672137d89835c6acc7f10d7c3c8873b8a3925eb1f2061fa51105e23901c` |

`breakhis_inference_config.json` est le fichier `inference_config.json` du
notebook BreakHis (`notebooks/breakhis-classification-efficientnetb0.ipynb`),
renommé.

**Ancien fichier PanNuke écarté.** Un fichier
`pannuke_unet_efficientnetb0_phase2_best.keras` d'empreinte
`8d05b1f068d4fa9f25ed3ed9f05027d7fd68ef74af0bab15e798e6f324a5a248` a circulé :
c'était un mauvais modèle (Dice moyen des noyaux de 0,012 sur le test). Ne le
déployez pas ; si `models/` le contient encore, remplacez-le par le fichier
d'empreinte `02b26d77…` ci-dessus. Le service ne le refuse pas au chargement
(mêmes formes d'entrée et de sortie) : seule l'empreinte le distingue.

Vérification des empreintes :

```powershell
Get-FileHash models\*.pth, models\*.keras, models\*.json -Algorithm SHA256 | Format-Table Hash, Path   # Windows
```

```bash
sha256sum models/*.pth models/*.keras models/*.json   # Linux
```

Sans le classifieur, le service démarre, mais il refuse les analyses
(erreur 503, classifieur non chargé). De même, un modèle de pathologie
absent ou refusé (seuil autre que 0,13 dans `breakhis_inference_config.json`,
par exemple) laisse le service démarrer, et seul son point d'entrée répond 503. Si le dossier n'existe pas, Docker
refuse de démarrer le conteneur (`bind source path does not exist`).

## 3. Fichier `.env`

```powershell
Copy-Item .env.docker.example .env   # Windows ; Linux : cp .env.docker.example .env
```

Chaque variable est commentée dans
[`.env.docker.example`](.env.docker.example). À remplir au minimum :

- `APP_DOMAIN` et `ACME_EMAIL` (en démonstration locale : `localhost` et
  n'importe quelle adresse) ;
- `MYSQL_PASSWORD` et `MYSQL_ROOT_PASSWORD` ;
- les quatre secrets JWT et `AI_SERVICE_TOKEN` ;
- `ORTHANC_USERNAME` et `ORTHANC_PASSWORD`, le compte du backend auprès
  d'Orthanc : **24 caractères au moins**, lettres et chiffres uniquement
  (`openssl rand -hex 24`) ; en production, le backend refuse de démarrer
  avec un mot de passe plus court, absent ou par défaut ;
- `MESSAGING_KEYS`, la clé de chiffrement des messages (ci-dessous) ;
- en production, `SMTP_HOST`, `MAIL_FROM` et les identifiants SMTP.

Pour générer un secret (64 caractères hexadécimaux) :

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') })   # PowerShell
```

```bash
openssl rand -hex 32   # Linux, Git Bash
```

**Clé des messages (`MESSAGING_KEYS`).** Le texte des messages est chiffré
dans la base, et leurs pièces jointes sur le disque (AES-256-GCM) ; sans
cette variable, le backend ne démarre pas. Générez une clé de 32 octets :

```bash
openssl rand -base64 32   # Linux, Git Bash
```

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)   # PowerShell
```

puis écrivez-la précédée d'un identifiant : `MESSAGING_KEYS=k1:<clé>`.
Sauvegardez-la **à part** des sauvegardes de la base (section 8) : sans
elle, ni les messages ni les pièces jointes d'une sauvegarde ne se relisent.
Pour changer de clé, ajoutez-en une à la fin (`k1:<ancienne>,k2:<nouvelle>`)
et gardez l'ancienne tant que des messages ou des fichiers l'utilisent.

**Abonnements (`MANUAL_PAYMENTS_ENABLED`).** Un compte vérifié reçoit
automatiquement **14 jours d'essai gratuit** (10 analyses IA pour tout l'essai,
tous les modèles). Ensuite, il s'abonne **en payant par carte en ligne**,
sans validation de l'administration : l'abonnement est actif aussitôt (en
démonstration, le paiement est simulé : aucun débit réel). Les règlements
hors ligne (espèces, CCP, reçu BaridiMob) sont **désactivés par défaut**
(`MANUAL_PAYMENTS_ENABLED=false`) : l'interface ne les propose plus et le
backend refuse d'en créer (400 `PAYMENT_METHOD_DISABLED`). Les paiements
déjà en attente restent consultables et validables par l'administration.
Mettez `MANUAL_PAYMENTS_ENABLED=true` pour les réactiver ; le frontend lit la
même valeur au build (`NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED`) : après l'avoir
changée, `docker compose build frontend`.

`.env` contient les secrets : ne le versionnez pas (Git l'ignore) et ne
l'envoyez à personne.

## 4. Démonstration locale

[`docker-compose.dev.yml`](docker-compose.dev.yml) adapte la pile à un poste
de travail :

- Caddy sert le site en **HTTP simple sur <http://localhost>**, depuis cet
  ordinateur seulement, sans certificat ;
- le backend est en mode développement : sans SMTP, il démarre quand même, et
  chaque e-mail (lien de réinitialisation compris) est écrit dans ses logs.

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
docker compose ps
docker compose logs -f backend
```

Le site est alors sur <http://localhost>. Si le port 80 est déjà pris (IIS,
Apache de XAMPP…), mettez dans `.env` `DEV_HTTP_PORT=8080` et
`DEV_PUBLIC_URL=http://localhost:8080`, puis relancez la commande.

Pour ne pas répéter les deux `-f`, ajoutez à `.env` (sous Windows, le
séparateur est `;`) :

```dotenv
COMPOSE_FILE=docker-compose.yml;docker-compose.dev.yml
```

Le frontend est construit pour l'adresse de démonstration : pour repasser en
production, reconstruisez-le (`--build`).

## 5. Serveur de production

### DNS

Créez un enregistrement `A` (et `AAAA` si le serveur a une adresse IPv6) pour
`APP_DOMAIN`, vers l'adresse publique du serveur. Vérifiez la propagation
avant le premier démarrage :

```bash
dig +short healix.exemple.dz
```

### Ports

Ouvrez dans le pare-feu du serveur (et de l'hébergeur) :

- **80/tcp** : validation Let's Encrypt et redirection vers HTTPS ;
- **443/tcp** et **443/udp** (HTTP/3) : le site.

Rien d'autre n'est publié : le frontend, le backend, MySQL et le service IA
ne sont joignables que par les réseaux Docker. Gardez SSH pour
l'administration.

### Fichier `.env`

Voir la section 3 : `APP_DOMAIN` (le nom de domaine, sans `https://`),
`ACME_EMAIL`, les secrets, et un **SMTP réel** (sans lui, le backend refuse
de démarrer en production).

### Premier démarrage

```bash
git clone https://github.com/MohammedBetkaoui/Healix-dev.git /srv/healixdz
cd /srv/healixdz
cp .env.docker.example .env && nano .env
# Poids : dans /srv/healixdz/models, ou AI_MODELS_DIR dans .env
docker compose build
docker compose up -d
docker compose ps
```

Le premier build prend un moment (PyTorch, TensorFlow et Chromium). Au démarrage, le
backend applique les migrations en attente (`prisma migrate deploy`), puis
lance l'API. `docker compose ps` doit afficher les six services `healthy` (dont `backup`).

### Vérification du certificat

Caddy demande le certificat dès qu'il démarre :

```bash
docker compose logs caddy | grep -i -E "certificate obtained|error"
curl -I http://healix.exemple.dz    # 308 vers https://
curl -I https://healix.exemple.dz   # HTTP/2 200
echo | openssl s_client -connect healix.exemple.dz:443 -servername healix.exemple.dz 2>/dev/null \
  | openssl x509 -noout -issuer -dates   # émetteur Let's Encrypt, dates de validité
```

En cas d'échec, c'est presque toujours le DNS (pas encore propagé) ou le
port 80 fermé : Caddy réessaie seul ; corrigez, puis suivez
`docker compose logs -f caddy`. Le certificat est renouvelé automatiquement ;
il est conservé dans le volume `healixdz_caddy-data` : ne le supprimez pas
(Let's Encrypt limite le nombre de certificats émis par semaine).

## 6. Sécurité

Réglages appliqués par défaut en production ; rien à faire, sauf la
restriction facultative de l'administration.

- **En-têtes**, posés par Caddy sur toutes les réponses
  ([`caddy/healixdz-site.caddy`](caddy/healixdz-site.caddy)) :
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` ;
  - `X-Content-Type-Options: nosniff` ;
  - `Referrer-Policy: strict-origin-when-cross-origin` ;
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()` ;
  - `Server` et `X-Powered-By` sont retirés.
- **Content-Security-Policy.** Une seule par réponse :
  - **Pages** : posée par Next.js ([`frontend/src/proxy.ts`](frontend/src/proxy.ts)),
    avec un nonce neuf à chaque requête. Les scripts ne s'exécutent que
    s'ils portent ce nonce, ou s'ils sont chargés par un script qui le porte
    (`'strict-dynamic'`). Pas de `'unsafe-eval'` en production, et
    `frame-ancestors 'none'`. Toutes les pages sont donc rendues à la
    requête : c'est le prix des nonces.
  - Les styles en ligne restent permis (`style-src 'unsafe-inline'`) : React
    rend côté serveur des attributs `style="…"`, qu'un nonce ne peut pas
    couvrir. Les scripts en ligne, eux, ne le sont pas.
  - `object-src blob:` et `frame-src blob:` : l'administration affiche les
    PDF dans un cadre à partir d'une URL `blob:`, et la visionneuse PDF de
    Chrome compte comme un plugin.
  - **API** : `default-src 'none'; frame-ancestors 'none'`, posée par Caddy
    sur `/api/*` (des données et des fichiers, jamais des pages).
- **Cookies.** `Secure` en production (`COOKIE_SECURE=true`) : jamais envoyés
  en HTTP. Ceux de l'application sont en `SameSite=Lax`, et non `Strict` :
  - avec `Strict`, un lien vers HealixDz ouvert depuis une messagerie ou un
    autre site arriverait sans session, et l'utilisateur, pourtant connecté,
    serait renvoyé vers la page de connexion ;
  - `Lax` suffit contre la falsification de requêtes : les modifications
    passent par `POST`, `PATCH` ou `DELETE`, pour lesquels le navigateur
    n'envoie pas ces cookies depuis un autre site.

  Les cookies de l'administration, que l'on ne rejoint jamais par un lien
  externe, sont en `SameSite=Strict`.
- **Adresse du client.** Le backend ne croit l'en-tête `X-Forwarded-For`
  que s'il vient de Caddy (`TRUST_PROXY` = l'adresse fixe de Caddy,
  `CADDY_IP`). La limite de débit et le journal d'audit voient ainsi l'IP du
  client, et non celle de Caddy. Caddy ignore le `X-Forwarded-For` envoyé par
  le client, retire `True-Client-IP` et `CF-Connecting-IP`, et pose
  `X-Real-IP` : un client ne peut pas choisir l'adresse enregistrée.
- **Limites de débit**, par minute et par route
  ([`backend/src/common/guards/app-throttler.guard.ts`](backend/src/common/guards/app-throttler.guard.ts)) :
  - un utilisateur connecté (jeton d'accès valide, vérifié par le backend) a
    son propre compteur : `THROTTLE_USER_LIMIT`, 600 par défaut. Plusieurs
    utilisateurs derrière une même adresse (un cabinet, ou le conteneur
    frontend qui vérifie les sessions) ne se gênent donc pas ;
  - sans jeton valide (absent, expiré ou falsifié), le compteur est celui de
    l'adresse IP : `THROTTLE_ANON_LIMIT`, 120 par défaut ;
  - la connexion (5 par minute, application et administration), la demande
    de réinitialisation du mot de passe (3 par 15 minutes), la
    réinitialisation elle-même (5 par 15 minutes) et les actions de
    l'administration (20 par minute) gardent leurs limites, toujours par IP,
    même avec un jeton valide.

  Au-delà, le backend répond 429 avec l'en-tête `Retry-After`. L'interface
  ne le prend jamais pour une déconnexion : un message donne le délai et la
  requête repart une fois ; une page qui ne peut pas vérifier la session
  affiche « Service momentanément indisponible, réessayez ». Pour changer
  les limites : `THROTTLE_USER_LIMIT` et `THROTTLE_ANON_LIMIT` dans `.env`,
  puis `docker compose up -d backend`.
- **WebSocket temps réel** (`/api/realtime`). Elle sert seulement à prévenir le
  navigateur : les messages s'écrivent et se lisent en REST. Les événements
  ne portent que des identifiants, jamais le texte d'un message.
  - Transport WebSocket seul (pas de long-polling), donc pas de sessions
    collantes.
  - À la connexion, dans cet ordre :
    1. l'en-tête `Origin` doit être celui du site (`APP_PUBLIC_URL`, ou
       `FRONTEND_URL` hors production). CORS ne s'applique pas aux
       WebSocket, et le navigateur y joint les cookies : c'est la seule
       protection contre le détournement depuis un autre site ;
    2. le cookie `access_token` doit être valide ;
    3. le compte doit être vérifié, ni suspendu ni refusé.
  - Une socket est fermée à l'expiration du jeton d'accès (15 minutes), à la
    déconnexion, au changement de mot de passe et à la suspension du compte.
    Elle est aussi fermée si le client lui envoie des messages : le client
    n'a rien à envoyer. Au plus 5 sockets par utilisateur.
  - La CSP des pages autorise `wss://APP_DOMAIN` dans `connect-src`.
- **CORS désactivé** (`CORS_ENABLED=false`) : pages et API partagent une
  seule origine, le navigateur n'a donc jamais d'appel inter-origines à
  faire, et aucun autre site ne reçoit d'en-tête `Access-Control-Allow-*`.
  Il ne reste utile qu'en développement sans Docker (`next dev` sur 3000,
  l'API sur 3001).
- **Restreindre l'administration à certaines adresses** (facultatif,
  recommandé). Dans `.env`, listez les IP ou plages autorisées (bureaux,
  VPN), séparées par des espaces :

  ```dotenv
  ADMIN_ALLOWED_IPS=203.0.113.10 198.51.100.0/24
  ```

  puis `docker compose up -d caddy`. Les pages de l'administration
  (`ADMIN_GATE_PATH`) et son API (`/api/admin`) répondent alors 403 aux
  autres adresses. Par défaut, la restriction est désactivée. Gardez aussi
  un `ADMIN_GATE_PATH` difficile à deviner (il est écrit dans le frontend :
  reconstruisez-le après un changement).

## 7. Premier compte administrateur

Le mécanisme existant est le *seed* du backend (`prisma/seed.ts`, compilé en
`dist/prisma/seed.js`). Il crée ou met à jour un compte `SUPER_ADMIN` à partir
des variables `ADMIN_SEED_*`, puis enregistre les formules d'abonnement. Il
est à lancer **une fois** à la première installation (puis à chaque fois
qu'on veut remettre à jour les formules), une fois la pile démarrée :

1. Dans `.env`, renseignez `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD` et
   `ADMIN_SEED_FULL_NAME`.
2. Lancez :

   ```bash
   docker compose --profile seed run --rm admin-seed
   ```

   La sortie se termine par `Admin seed ready.` et
   `Subscription plans seed ready.`.
3. Videz ensuite `ADMIN_SEED_PASSWORD` dans `.env`.

L'administration se trouve à `https://APP_DOMAIN` + `ADMIN_GATE_PATH` +
`/login` (en démonstration : <http://localhost/hzdz-control-gate-2026/login>).
Les comptes d'établissement et de médecin indépendant se créent depuis la page
d'inscription de l'application.

Si l'administrateur a oublié son mot de passe : mettez
`ADMIN_SEED_PASSWORD` (nouveau mot de passe) et
`ADMIN_SEED_UPDATE_PASSWORD=true` dans `.env`, relancez la commande, puis
remettez `false` et videz le mot de passe. La réinitialisation par e-mail ne
concerne pas les comptes d'administration.

## 8. Sauvegarde et restauration

Les sauvegardes contiennent des **données de santé**. Chiffrez-les
(ci-dessous), gardez-en une copie hors du serveur, et testez une
restauration au moins une fois par mois.

### Sauvegardes automatiques

Le service `backup` (image [`scripts/backup/`](scripts/backup/)) tourne en
permanence. Chaque nuit à `BACKUP_TIME` (02:30, fuseau `BACKUP_TZ`), il
dépose dans `BACKUP_DIR` (par défaut `./backups`) :

| Fichier | Contenu |
| --- | --- |
| `healixdz-db-<date UTC>.sql.gz[.age]` | la base, `mysqldump --single-transaction` (copie cohérente, sans bloquer l'application) |
| `healixdz-files-<date UTC>.tar.gz[.age]` | le volume des fichiers patients (documents, masques, comptes rendus) et les pièces jointes de la messagerie (`messaging/`, déjà chiffrées par `MESSAGING_KEYS`) |
| `healixdz-orthanc-<date UTC>.tar.gz[.age]` | le volume d'Orthanc : l'index SQLite (`index/`, archivé **en premier**) puis les fichiers DICOM (`storage/`) |
| `….sha256` | l'empreinte SHA-256 de chaque archive, vérifiable avec `sha256sum -c` |

**Cohérence de l'index d'Orthanc.** Le livre d'Orthanc prévient que la copie
d'un index SQLite pendant qu'Orthanc y écrit peut être incohérente (Orthanc
suppose être seul à l'utiliser), et le conteneur de sauvegarde ne peut pas
l'arrêter. Deux précautions : l'index est archivé **avant** les fichiers
(l'archive ne cite donc jamais un fichier qui lui manque : un fichier sans
entrée est un simple orphelin) ; et si l'index change pendant la copie (ou
si un journal SQLite montre une écriture en cours), la copie est refaite,
trois fois au plus. Après trois échecs, l'archive est gardée avec
l'avertissement `WARNING … may hold an inconsistent index` dans
`docker compose logs backup` : refaites alors une sauvegarde hors d'un import.
La nuit (02:30), personne n'importe : c'est le cas normal. Une copie à froid
(`docker compose stop orthanc`, puis la sauvegarde, puis `start`) reste la
seule garantie complète.

Les archives de plus de `BACKUP_RETENTION_DAYS` jours (14) sont supprimées
après chaque sauvegarde réussie. Une sauvegarde en échec rend le conteneur
`unhealthy` (`docker compose ps`) jusqu'à la suivante qui réussit ; le
détail est dans `docker compose logs backup`.

Sous Linux, le dossier doit appartenir à l'utilisateur 1000 :

```bash
mkdir -p backups && sudo chown 1000:1000 backups
```

Lancer une sauvegarde tout de suite (avant une mise à jour, par exemple) :

```bash
docker compose exec backup healixdz-backup
```

### Chiffrement (recommandé)

Avec une clé publique [age](https://age-encryption.org) dans
`BACKUP_AGE_RECIPIENT`, chaque archive est chiffrée au fil de l'eau : aucune
copie en clair n'est jamais écrite sur le disque.

1. Sur un poste d'administration, **pas sur le serveur**, générez la paire de
   clés (age pour Windows : `age-keygen.exe`, dans l'archive de la release
   officielle) :

   ```bash
   age-keygen -o healixdz-backup.key
   ```

   La ligne `# public key: age1…` du fichier est la clé publique.
2. Mettez-la dans `.env` (`BACKUP_AGE_RECIPIENT=age1…`), puis
   `docker compose up -d backup`.
3. Rangez `healixdz-backup.key` (la clé privée) hors du serveur, en deux
   exemplaires (coffre-fort de mots de passe, support chiffré). Sans elle,
   les sauvegardes chiffrées sont **irrécupérables** ; volée avec elles, elle
   les rend lisibles.

### Clé des messages (`MESSAGING_KEYS`)

Les sauvegardes de la base contiennent les messages **chiffrés**. Pour les
relire après une restauration, il faut la clé de `MESSAGING_KEYS` :

- gardez-en une copie hors du serveur, **séparée** des sauvegardes de la base
  et de la clé `age` (par exemple un autre coffre-fort) : volée avec une
  sauvegarde, elle révèle les messages ; perdue, ils sont **illisibles** ;
- rotation : ajoutez une nouvelle clé **à la fin**
  (`MESSAGING_KEYS=k1:<ancienne>,k2:<nouvelle>`), puis
  `docker compose up -d backend`. Les nouveaux messages sont chiffrés avec
  `k2` ; les anciens restent lisibles grâce à `k1`, qu'il ne faut jamais
  retirer tant qu'un message l'utilise (aucun rechiffrement automatique
  n'existe encore) ;
- une restauration se fait avec le même `MESSAGING_KEYS` que lors de la
  sauvegarde (ou une liste qui contient toutes ses clés).

### Restauration sur une pile vide (procédure testée)

Cas d'un nouveau serveur, ou d'une perte des volumes. Les sauvegardes sont
dans `BACKUP_DIR`.

1. Préparez la pile comme pour un premier démarrage (même `.env`, mêmes
   poids), sans données : seul MySQL démarre.

   ```bash
   docker compose build
   docker compose up -d mysql
   ```

2. Restaurez la base, puis les fichiers, puis le volume d'Orthanc. Indiquez
   les noms des trois archives d'une même sauvegarde (la troisième est
   facultative : sans elle, le volume d'Orthanc n'est pas touché, ce qui
   convient à une sauvegarde faite avant l'import DICOM) :

   ```bash
   docker compose --profile restore run --rm restore \
     healixdz-db-20261010T023000Z.sql.gz healixdz-files-20261010T023000Z.tar.gz \
     healixdz-orthanc-20261010T023000Z.tar.gz
   ```

   Sauvegarde chiffrée : montez la clé privée pour cette seule commande.

   ```bash
   docker compose --profile restore run --rm \
     -v /chemin/vers/healixdz-backup.key:/run/age/identity:ro \
     restore healixdz-db-….sql.gz.age healixdz-files-….tar.gz.age \
     healixdz-orthanc-….tar.gz.age
   ```

   Le script ([`scripts/backup/restore.sh`](scripts/backup/restore.sh))
   procède ainsi :
   - il vérifie les empreintes SHA-256 et relit entièrement les deux archives
     (déchiffrées si besoin) **avant** d'écrire quoi que ce soit ;
   - il s'arrête si la base a déjà des tables ou si un des volumes n'est pas
     vide ;
   - il restaure ensuite la base, puis les fichiers, puis le volume d'Orthanc.
     Ce conteneur-là tourne en **root** (`user: "0:0"` dans le service
     `restore`) : `tar` rend ainsi à chaque fichier son propriétaire d'origine
     (utilisateur 1000 pour les fichiers patients, 999 pour Orthanc).
3. Démarrez le reste de la pile ; le backend applique les migrations plus
   récentes que la sauvegarde, s'il y en a :

   ```bash
   docker compose up -d
   ```

4. Vérifiez :
   - une connexion ;
   - l'ouverture d'un document patient ;
   - le téléchargement d'un compte rendu PDF ;
   - la liste des études DICOM d'un dossier (section 12), l'aperçu d'une
     coupe et l'ouverture d'une étude dans la visionneuse.

**Remplacer des données existantes** (retour en arrière sur le même
serveur) :
1. Arrêtez ce qui écrit : `docker compose stop caddy frontend backend orthanc backup`.
2. Relancez la commande de restauration avec `--force` juste après `restore`.
   Les tables de la base et le contenu du volume sont alors remplacés.
3. Faites une sauvegarde de l'état actuel avant, si elle peut servir.

## 9. Mise à jour

```bash
docker compose exec backup healixdz-backup   # sauvegarde juste avant
git pull
docker compose build
docker compose up -d
```

`up -d` recrée les conteneurs dont l'image a changé ; le backend applique les
nouvelles migrations à son démarrage. Avec la configuration de
démonstration, ajoutez les deux `-f` (ou `COMPOSE_FILE`, voir plus haut).

`PUBLIC_API_URL` (déduite de `APP_DOMAIN`), `ADMIN_GATE_PATH`,
`ENABLE_DEMO_MODULES` et `MANUAL_PAYMENTS_ENABLED` sont écrits dans le
frontend au moment du build : après les avoir changés, lancez
`docker compose build frontend`.

**Migration des abonnements (une seule fois, au premier démarrage qui la
contient).** Elle ajoute les quotas de chaque plan (sans relancer le seed) et
donne un **essai de 14 jours, qui commence à ce moment-là**, à chaque compte
déjà vérifié (établissement ou médecin indépendant) qui n'a pas
d'abonnement actif, et qui n'a pas déjà eu son essai : aucun compte existant
n'est bloqué du jour au lendemain. Ses médecins affiliés suivent
l'abonnement de leur établissement. Sauvegardez avant (première commande
ci-dessus). Les comptes suspendus n'en reçoivent pas.

## 10. Points d'attention

- **Limite de débit des sessions expirées.** Quand le jeton d'accès d'un
  utilisateur a expiré, le serveur Next.js vérifie puis rafraîchit sa
  session sans jeton valide : ces appels arrivent tous du conteneur frontend
  et partagent le compteur anonyme de son adresse (`THROTTLE_ANON_LIMIT`,
  120 par minute et par route). Chaque utilisateur actif n'en fait qu'à
  l'expiration de son jeton (15 minutes) : la limite n'est atteinte qu'avec
  beaucoup d'utilisateurs simultanés, et la page affiche alors « Service
  momentanément indisponible, réessayez », sans déconnexion. Augmentez
  `THROTTLE_ANON_LIMIT` si cela arrive.
- **Une seule instance du backend.** Les salles temps réel (une par
  utilisateur) sont gardées en mémoire par le backend. Avec plusieurs
  instances derrière Caddy, un événement émis par l'une n'atteindrait pas les
  sockets ouvertes sur une autre. Il faudrait alors :
  - ajouter un service Redis à `docker-compose.yml` ;
  - brancher `@socket.io/redis-adapter` dans le backend (même code
    d'émission).

  Les sessions collantes ne sont pas nécessaires : le transport est
  WebSocket seul. En attendant, un événement perdu n'est pas grave : le
  client rattrape les messages au retour de la connexion (`afterSeq`).
- **Docker Desktop.** Sous Windows et macOS, les connexions arrivent dans les
  conteneurs avec l'adresse de la passerelle Docker, et non celle du client :
  en démonstration locale, tous les navigateurs partagent donc la même
  adresse. Sur un serveur Linux, l'adresse réelle du client est conservée.

- **Abonnement expiré = lecture seule.** Quand l'essai ou l'abonnement d'un
  compte se termine (la tâche horaire du backend le constate, au plus une
  heure plus tard, mais la création est refusée dès l'échéance passée), le
  compte et ses médecins affiliés continuent de **lire et télécharger** leurs
  dossiers, de converser et de gérer leur compte ; ils ne peuvent plus
  **créer** (patient, rendez-vous, consultation, ordonnance, rapport,
  analyse IA, document, invitation de médecin) : 403 `SUBSCRIPTION_INACTIVE`.
  Un abonnement à l'échéance dépassée se règle par un nouveau paiement par
  carte. Les quotas (patients, médecins, analyses IA du mois à l'heure
  d'Alger) sont comptés et appliqués par le backend : 403 `QUOTA_EXCEEDED`.
- **Contrat sur devis (`EST_CUSTOM`).** Il ne se paie pas en ligne (400
  `PLAN_REQUIRES_CONTACT`) : l'administration l'active depuis la console des
  abonnements, avec la date de fin et les quotas du contrat.

## 11. Check-list de mise en production

À cocher avant d'ouvrir le service à de vrais utilisateurs.

**Serveur et réseau**

- [ ] Le DNS de `APP_DOMAIN` pointe vers le serveur (`A`, et `AAAA` s'il a de
      l'IPv6).
- [ ] Seuls 80 et 443 (et SSH) sont ouverts.
- [ ] Le certificat est obtenu : `curl -I https://APP_DOMAIN` répond, avec
      un émetteur Let's Encrypt (section 5).
- [ ] `docker compose ps` : les six services sont `healthy`.

**Secrets et configuration**

- [ ] `.env` créé depuis `.env.docker.example`, protégé (`chmod 600 .env`),
      jamais versionné.
- [ ] Tous les secrets sont générés au hasard (64 caractères) et différents
      les uns des autres : `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, les quatre
      secrets JWT, `AI_SERVICE_TOKEN` ; `ORTHANC_PASSWORD` fait au moins
      24 caractères.
- [ ] `MESSAGING_KEYS` est généré (`openssl rand -base64 32`), et une copie
      est rangée hors du serveur, à part des sauvegardes (section 8).
- [ ] `ADMIN_GATE_PATH` est changé pour un chemin difficile à deviner ; si
      possible, `ADMIN_ALLOWED_IPS` est renseigné (section 6).
- [ ] Production réelle : `docker-compose.dev.yml` n'est **pas** utilisé (ni
      `-f`, ni `COMPOSE_FILE`), donc `NODE_ENV=production` ;
      `COOKIE_SECURE` n'est pas remis à `false` dans `.env`.
- [ ] `curl -I https://APP_DOMAIN` montre `Strict-Transport-Security` et
      `Content-Security-Policy`.

**Fonctionnement**

- [ ] **SMTP réel** : une demande « mot de passe oublié » sur une vraie
      adresse arrive bien, et le lien fonctionne.
- [ ] **Poids présents** : leurs empreintes SHA-256 correspondent
      (section 2), et une analyse cérébrale de bout en bout donne un résultat.
- [ ] **Administrateur créé** (section 7), puis `ADMIN_SEED_PASSWORD` vidé.

**Sauvegardes**

- [ ] `BACKUP_AGE_RECIPIENT` est renseigné, et la clé privée est conservée
      hors du serveur, en deux exemplaires.
- [ ] Une sauvegarde manuelle a réussi (`docker compose exec backup
      healixdz-backup`).
- [ ] Les archives sont copiées hors du serveur.
- [ ] **Une restauration a été testée** sur une autre machine, ou une pile
      vide (section 8), avec connexion et ouverture d'un document.

## 12. Imagerie DICOM (Orthanc)

Les études DICOM (IRM, scanner...) d'un dossier patient sont importées dans
**Orthanc**, un serveur DICOM ; HealixDz garde, pour chaque étude, une ligne
(`dicom_studies`) qui dit quel établissement ou cabinet, et quel patient, y a
accès.

- **Orthanc** : image `orthancteam/orthanc:26.9.1` (version exacte ; jamais
  `latest`, ni la variante `-full`, inutile ici). Variables de l'image
  ([documentation](https://orthanc.uclouvain.be/book/users/docker-orthancteam.html)) :
  `ORTHANC__` + le nom de l'option en majuscules séparées par `_`, `__` entre
  deux niveaux ; `*_PLUGIN_ENABLED` active un plugin.
- **Réseau.** Réseau `internal` seul, aucun port publié, **aucun port DICOM**
  (`DicomServerEnabled=false` : rien n'écoute que l'API HTTP). Les interfaces
  web d'Orthanc sont désactivées (Explorer 1 et 2, WebDAV). Seul le backend
  lui parle.
- **Authentification.** HTTP, avec un seul compte (`ORTHANC_USERNAME`,
  `ORTHANC_PASSWORD` du `.env`). Au moins 24 caractères, lettres et chiffres
  uniquement (le couple est écrit dans un objet JSON) ; en production, le
  backend refuse de démarrer sinon, comme pour les secrets JWT. Pour le
  changer : modifier `.env`, puis `docker compose up -d orthanc backend`.
- **Plugin DICOMweb** actif, avec `PublicRoot=/api/dicomweb/` : l'API que la
  visionneuse lit par le backend (ci-dessous). Il n'est joignable par aucun
  navigateur.
- **Volume** `healixdz_orthanc-data` monté sur `/var/lib/orthanc` : `index/`
  (SQLite) et `storage/` (fichiers). Le processus tourne sous l'utilisateur
  `orthanc` de l'image (999). Sauvegardé chaque nuit (section 8).
- **Santé.** Sonde de l'image (`/probes/test-aliveness.py`, qui appelle
  `/changes`) ; le backend attend `healthy`. Orthanc arrêté ou injoignable :
  les routes DICOM répondent 502 `DICOM_STORE_UNAVAILABLE`, le reste de
  l'application fonctionne.

**Import** (`POST /api/dicom/studies/upload`, formulaire multipart : le
champ `files` et `patientId`). Médecins et établissements, abonnement actif
requis (lecture et liste restent ouvertes en lecture seule).

| Limite | Valeur |
| --- | --- |
| Envoyé en une fois | 512 Mio (Caddy lève sa limite de 21 Mio pour cette seule route) |
| Fichiers par import | 2 000 |
| ZIP décompressé | 2 Gio (taille déclarée par l'archive, vérifiée à la lecture) |
| Un fichier DICOM | 512 Mio |

- **Fichiers .dcm** (plusieurs) **ou un seul .zip**, jamais les deux.
- Chaque fichier doit porter `DICM` à l'octet 128, sinon il est **ignoré** et
  compté dans `skipped`. Les valides partent un à un vers Orthanc.
- Les fichiers reçus attendent dans un dossier temporaire du conteneur
  backend (`/tmp`, jusqu'à 512 Mio), supprimé à la fin de la requête, qu'elle
  réussisse ou non. Un ZIP est lu entrée par entrée, **jamais extrait sur le
  disque**, et **refusé en entier**, avant tout envoi, s'il contient : un chemin absolu, un segment `..` ou une
  barre oblique inverse ; un ZIP imbriqué (par son nom, ou par son contenu) ;
  une entrée chiffrée ; plus de 2 000 fichiers ; plus de 2 Gio décompressés ;
  ou s'il est corrompu : 422 `DICOM_ZIP_UNSAFE` et la raison.
- Un ZIP peut contenir **plusieurs études** : une ligne chacune.
- Aucun fichier valide : 422 `DICOM_NO_VALID_FILE`.
- **Identité.** Le nom, la date de naissance et le sexe du fichier DICOM sont
  comparés à ceux du dossier. Une différence est un **avertissement** conservé
  avec l'étude (en orange dans l'interface), jamais un refus : un en-tête est
  souvent saisi à la main, orthographié autrement, ou anonymisé.
- Une étude déjà dans le dossier d'**un autre patient du même espace** n'est
  pas rattachée à celui-ci (avertissement `STUDY_ATTACHED_TO_ANOTHER_PATIENT`).
  Une même étude peut en revanche être importée par **deux espaces** : deux
  lignes, une seule copie dans Orthanc.
- Si Orthanc échoue en cours d'import, les études qu'il avait commencé à
  créer, et que nulle ligne ne référence, sont supprimées d'Orthanc.
- Journal d'audit : `DICOM_STUDY_IMPORTED`, `DICOM_STUDY_DELETED`.

**Suppression** (`DELETE /api/dicom/studies/:id`). La ligne disparaît ; l'étude
est supprimée d'Orthanc **seulement si aucune autre ligne** (un autre espace)
ne la référence. Les documents et analyses faits à partir de ses coupes ne
sont pas touchés.

**Isolation.** Une étude, ou une coupe, d'un autre espace répond 404, comme
une étude inconnue. Les identifiants d'Orthanc reçus du navigateur sont
vérifiés (cinq groupes de 8 chiffres hexadécimaux) avant d'entrer dans une URL.

**Visionneuse** (`viewer`, OHIF Viewer 3.13.13).

- **Construction.** [`viewer/Dockerfile`](viewer/Dockerfile) construit OHIF à
  partir de ses sources, au commit exact de la version 3.13.13
  (`1fa151f5133934c953a2ab4c0056ca91f929c32f`, vérifié pendant la
  construction), avec Node 24.15.0, pnpm 12.8.1 (le `packageManager` d'OHIF),
  `pnpm install --frozen-lockfile`, puis nginx-unprivileged 1.30.6. Pas
  l'image officielle `ohif/app` : le chemin de base (`PUBLIC_URL`) est figé à
  la construction (« baked into the build and cannot be changed without
  rebuilding the image », documentation d'OHIF), et la visionneuse doit vivre
  sous `/viewer/`, à côté des pages. **La construction demande plusieurs Go
  de mémoire** (celle d'OHIF aussi) et télécharge le code de GitHub et les
  paquets de npm : `docker compose build viewer`.
- **Aucune sortie vers l'extérieur.** Le service worker d'OHIF, qui charge
  Workbox depuis un stockage Google, est remplacé par un fichier qui
  n'enregistre rien (et supprime celui d'un ancien build). Les deux scripts
  « inline » de `index.html` sont déplacés dans des fichiers
  ([`viewer/externalize-inline-scripts.mjs`](viewer/externalize-inline-scripts.mjs),
  test : `node --test viewer/externalize-inline-scripts.test.mjs`) : la
  construction échoue s'il en reste un, ou s'il n'y en avait aucun à
  déplacer (la page d'OHIF a changé).
- **Configuration.** [`viewer/app-config.js`](viewer/app-config.js), montée en
  lecture seule : une seule source DICOMweb, `qidoRoot`, `wadoRoot` et
  `wadoUriRoot` sur `/api/dicomweb` (même origine, donc le cookie de
  session), images et miniatures lues par trames (`wadors`),
  `enableStudyLazyLoad`, pas de liste d'études, pas de dialogue « usage
  investigationnel », ni envoi, ni chargement de fichiers locaux, ni autre
  source. Une modification se prend en rechargeant la page, sans
  reconstruire.
- **Route.** `/viewer/*` → conteneur `viewer` (port 8080 : nginx-unprivileged
  n'est pas root, il écoute au-dessus de 1024). La page ne contient aucune
  donnée ; les images ne viennent que du proxy authentifié.
- **Content-Security-Policy de `/viewer`** (posée par Caddy) :
  `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'
  blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline';
  connect-src 'self'; font-src 'self' data:; frame-ancestors 'self'`.
  `'wasm-unsafe-eval'` pour les décodeurs d'images WebAssembly (pas
  `'unsafe-eval'`) ; `frame-ancestors 'self'` : seule une page de
  HealixDz peut l'encadrer. Si la console du navigateur signale pourtant une
  violation citant `'unsafe-eval'` à l'ouverture d'une étude, le correctif
  connu est de l'ajouter à `script-src` dans `caddy/healixdz-site.caddy`
  (la configuration d'OHIF lui-même, en mode « Report-Only », l'autorise) :
  à décider en connaissance de cause, jamais par défaut.
- **Session.** L'iframe lit l'API avec le cookie d'accès (15 minutes) mais ne
  sait pas le renouveler : la page de l'étude le fait à l'ouverture, puis
  toutes les 10 minutes, tant qu'elle est ouverte. Session terminée : un
  message l'indique.

**Proxy DICOMweb** (`GET /api/dicomweb/*`, dans le backend). Cookie de
session, mêmes gardes que la lecture d'un dossier, **sans** abonnement actif
requis (un compte en lecture seule voit ses images).

| Requête | Réponse |
| --- | --- |
| tout verbe autre que GET (STOW-RS compris) | 405, `Allow: GET`, rien n'est envoyé à Orthanc |
| `/studies/{StudyInstanceUID}` et tout ce qui est dessous (metadata, series, instances, frames, rendered, bulkdata) | relayé si l'étude est une ligne de l'espace de l'appelant, sinon 404 |
| `/studies?StudyInstanceUID={uid}` (un seul UID, plus `limit`, `offset`, `fuzzymatching`, `includefield`) | relayé aux mêmes conditions |
| `/studies` sans UID, `/series` ou `/instances` à la racine, recherche par nom ou par date, liste d'UID, chemin avec `..`, `%`, `\` ou `//` | 404, sans requête à la base ni à Orthanc |
| Orthanc refuse le compte du backend (401, 403), échoue (5xx), redirige ou ne répond pas | 502 `DICOM_STORE_UNAVAILABLE` (jamais un 401 : le navigateur croirait sa session perdue) |

- Orthanc n'est joint qu'avec son propre compte : ni cookie ni
  `Authorization` du navigateur ne lui sont transmis. Seuls `Accept`,
  `Range` et `If-None-Match` partent ; reviennent `Content-Type` (le
  `multipart/related; boundary=…` compris), `Content-Length`, `Content-Range`,
  `Accept-Ranges`, `ETag`, `Last-Modified`, avec `Cache-Control: private` et
  `X-Content-Type-Options: nosniff`.
- Le corps est relayé **en flux**, jamais gardé en mémoire ; le navigateur qui
  part annule la requête faite à Orthanc.
- Limite de débit propre à cette route : 6 000 requêtes par minute et par
  utilisateur (une étude se charge par centaines de trames), au lieu des 600
  habituels.
- Audit : `DICOM_STUDY_VIEWED`, **une fois** par utilisateur, par étude et par
  tranche fixe de 30 minutes (pas par image), écrit avant l'envoi de la
  première image.
- Une même requête ne peut désigner qu'une étude : le proxy ne permet pas de
  lister Orthanc.

**Analyser une coupe** (`POST /api/dicom/instances/{orthancInstanceId}/analyze`,
corps `{ "pipeline": "brain" | "cardio-seg-mri" }`). Depuis la page d'une
étude, le médecin choisit une série d'IRM, une coupe (curseur et aperçu) et
une chaîne ; le backend :

1. refuse (422 `DICOM_PIPELINE_NOT_SUPPORTED`) une chaîne qui ne lit pas une
   coupe (pathologie, ECG) ou une série qui n'est pas de modalité `MR`, et
   (422 `DICOM_MULTIFRAME_NOT_SUPPORTED`) une instance à plusieurs images ;
2. vérifie, **avant d'écrire quoi que ce soit**, le consentement
   `DIAGNOSTIC_AI` du patient, l'abonnement, la chaîne dans le plan et le
   quota du mois ;
3. enregistre la coupe comme **document du dossier** (type `DICOM` avec le
   fichier de l'instance pour la segmentation cardiaque, qui en lit
   l'espacement des pixels ; type `MEDICAL_IMAGE` avec le PNG rendu par
   Orthanc, fenêtrage du fichier, pour la chaîne cérébrale, qui ne lit que
   PNG et JPEG), nommé `serie-3-coupe-12.dcm` ou `.png`, avec l'étude, les
   UID de la série et de l'instance et leurs numéros ;
4. lance ensuite la **création d'analyse habituelle** (aucune règle n'est
   répétée) : l'analyse compte dans le quota, sa décision reste celle du
   médecin, son compte rendu PDF et la chronologie du patient nomment « Série
   3, coupe n° 12 ».

Si la création est refusée après l'écriture du document (course sur le quota),
le document et son fichier sont retirés ; si une analyse a été créée puis a
échoué, le document reste : la source fait partie du dossier. Supprimer
l'étude garde les documents et analyses faits à partir de ses coupes (le lien
à l'étude passe à vide, les numéros restent). Écriture : abonnement actif
requis. La migration `patient_document_dicom_slice` ajoute cinq colonnes
nulles et deux index à `patient_documents` ; elle ne change aucune ligne.

**Montée de version d'Orthanc.** Changez l'étiquette dans
`docker-compose.yml` après lecture des notes de version, et faites une
sauvegarde juste avant (section 9) : Orthanc peut migrer son index au
démarrage.

## 13. Ce qui a été vérifié, et ce qui ne l'a pas été

**Imagerie DICOM, import (24 octobre 2026, sans Docker).**

Vérifié :
- `docker compose config` (Compose v5.6.0), seul et avec
  `docker-compose.dev.yml` : valide ; `orthanc` n'est que sur `internal`, sans
  port publié ; l'absence de `ORTHANC_PASSWORD` est refusée.
- Caddy 2.11.7 : `caddy validate` passe pour les deux Caddyfile ; `caddy
  adapt` montre deux `request_body` exclusifs : 512 Mio pour
  `/api/dicom/studies/upload`, 21 Mio pour tout le reste.
- Les routes d'Orthanc utilisées existent dans son OpenAPI (`orthanc-openapi.json`,
  version 1.13.0 de l'API) : `POST /instances`, `GET /studies/{id}`,
  `/series?expand`, `/instances?expand&requested-tags`,
  `/instances/{id}/rendered` (`window-center`, `window-width`),
  `/studies/{id}/statistics`, `DELETE /studies/{id}`.
- Sauvegarde et restauration du volume d'Orthanc, scripts exécutés hors
  conteneur (Git Bash, outils MySQL simulés) : l'index est archivé avant les
  fichiers ; la copie est refaite quand l'index change (ou qu'un journal
  existe) et l'avertissement s'affiche après trois échecs ; restauration dans
  un volume vide, refus d'un volume non vide sans `--force`, remplacement avec
  `--force`, volume d'Orthanc intact avec deux archives seulement, archive
  altérée refusée.
- Tests jest du backend (1 400, dont les tests d'intégration sur MariaDB) :
  ZIP dangereux (`../`, chemin absolu, barre oblique inverse, ZIP imbriqué par
  son nom et par son contenu, trop de fichiers, taille décompressée, en-tête
  qui ment sur la taille, entrée chiffrée), fichiers non DICOM ignorés,
  avertissement d'identité, ZIP à deux études, étude partagée entre deux
  espaces, suppression qui épargne Orthanc, 404 entre espaces, refus sans
  abonnement actif, démarrage refusé sans mot de passe d'au moins 24
  caractères.

**Visionneuse et proxy (24 octobre 2026, sans Docker).**

Vérifié :
- Avec un vrai Caddy 2.11.7 devant des serveurs de remplacement : `/viewer/*`
  va à la visionneuse avec la Content-Security-Policy ci-dessus (et les
  en-têtes de sécurité du site), `/api/*` au backend avec la sienne
  (`default-src 'none'`), le reste au frontend, `/viewerx` n'est pas la
  visionneuse ; les limites de corps sont appliquées : 20 Mio passent et
  22 Mio donnent 413 sur l'API ; 25 Mio passent et 520 Mio donnent 413 sur
  `/api/dicom/studies/upload`. Avec une barre finale, la limite large ne
  s'applique pas (413 dès 21 Mio : c'est le sens sûr) ; une autre casse,
  que Nest et Caddy lisent de la même façon, la reçoit.
- La spécification OpenAPI d'Orthanc et les sources d'OHIF 3.13.13, lues : les URL relatives de
  `wadoRoot` sont prises en charge (`getWADORSImageId`, `fixBulkDataURI`),
  l'iframe demande `routerBasename` sans barre finale et `PUBLIC_URL` avec
  (documentation d'OHIF), et `index.html` contient bien deux scripts inline.
- Tests : proxy sur HTTP (garde, verbes, chemins, flux qui arrive avant la fin
  de l'envoi d'Orthanc, annulation, en-têtes, audit une fois par tranche), le
  script qui déplace les scripts inline, la page de l'étude (iframe,
  renouvellement de la session), la liste, l'import et le résumé (jest), le
  CSP des pages (`frame-src 'self'`).

**Analyse d'une coupe (24 octobre 2026, sans Docker ni service IA).**

Vérifié, sur une base MySQL de test migrée, avec Orthanc et le service IA
remplacés : la chaîne cardiaque reçoit le fichier DICOM de l'instance et la
chaîne cérébrale son PNG rendu ; la coupe devient un document avec l'étude, les
UID et les numéros ; le quota du mois est consommé (2 sur 2 puis refus, sans
document ni analyse en plus) ; un patient sans consentement, une chaîne hors
plan, une chaîne de pathologie, une série de scanner et une instance
multi-image sont refusés sans rien écrire ; un médecin d'un autre espace
reçoit 404 ; la chronologie nomme la coupe, y compris après la suppression de
l'étude ; le compte rendu l'imprime et son empreinte ne change que pour une
coupe (les comptes rendus déjà faits gardent la leur) ; la route est fermée
aux comptes en lecture seule. Côté interface : le panneau (série, curseur,
chaîne, consentement, lecture seule, erreurs, arabe), la redirection vers la
page de l'analyse, et la coupe dans l'évolution.

Pas vérifié : une vraie coupe d'IRM passée par Orthanc puis par le service IA
(ni le rendu PNG d'Orthanc, ni la qualité de la prédiction de la chaîne
cérébrale sur ce rendu, ni la lecture de l'espacement des pixels d'un vrai
fichier), et les clics du panneau dans un navigateur (les tests rendent le
panneau, ils ne le manipulent pas).

Pas vérifié (Docker absent) :
- la construction de l'image de la visionneuse (`pnpm install
  --frozen-lockfile` sur le dépôt d'OHIF, mémoire nécessaire, durée) ;
- le fonctionnement d'OHIF sous cette Content-Security-Policy (le risque
  connu : `'unsafe-eval'`, voir plus haut), son chargement par trames
  (`omitQuotationForMultipartRequest`, réécriture des URL absolues d'Orthanc
  par `bulkDataURI`), et une étude qui défile pendant plus de 20 minutes ;
- nginx avec `viewer/nginx.conf`, et la sonde de santé de la visionneuse.

**Pas vérifié** (à faire sur une machine équipée de Docker) :
- le démarrage d'Orthanc avec ces variables (noms vérifiés dans la
  documentation et dans le dépôt de l'image, mais jamais exécutés), sa santé,
  et le fonctionnement sous l'utilisateur 999 sur un volume neuf ;
- que `AllowedHosts` (`orthanc`, `orthanc:8042`) convient au plugin DICOMweb
  quand le backend l'appelle ;
- la sauvegarde et la restauration du volume d'Orthanc **dans les
  conteneurs** : lecture des fichiers d'Orthanc par l'utilisateur 1000 (ils
  doivent être lisibles par tous), restauration en root avec les
  propriétaires d'origine ;
- un import réel de bout en bout (un fichier envoyé à un vrai Orthanc).


**Temps réel (17 octobre 2026, sans Docker).** Vérifié par les tests
d'intégration du backend : un vrai serveur, de vrais clients
`socket.io-client`, MySQL 8.4. Ils couvrent :
- les refus à la connexion (sans cookie, cookie invalide ou expiré, mauvaise
  `Origin`, compte non vérifié ou suspendu) ;
- la fermeture des sockets (expiration du jeton, déconnexion, limite de 5
  sockets) ;
- la diffusion d'un message à son seul destinataire, et la saisie limitée à
  un événement toutes les 3 s.

**Pas encore vérifié :** le relais par Caddy d'une vraie WebSocket en HTTPS
(`wss://`). À contrôler au premier déploiement, une fois l'interface
Messages livrée (lot 3).

D'après vos vérifications, la pile précédente (quatre services, sans Caddy)
démarre et ses quatre services sont `healthy` sur MySQL 8.4 ; la génération
d'un PDF dans le conteneur fonctionne.

Vérifications faites le 10 octobre 2026 sur le poste de développement
(Windows 11), **sans Docker**, qui n'y est pas installé.

**Vérifié :**

- `docker compose config` (binaire officiel autonome de Compose v5.6.0) :
  - la configuration est valide, seule et avec `docker-compose.dev.yml` ;
  - seul `caddy` publie des ports : 80, 443 et 443/udp en production, et
    `127.0.0.1:80` seul en démonstration (`ports: !override`) ;
  - le frontend n'est que sur `edge` ; MySQL et le service IA ne sont que sur
    `internal` (`internal: true`) ;
  - les adresses déduites de `APP_DOMAIN` sont correctes, et
    `API_INTERNAL_URL` vaut `http://backend:3001/api`.
- Les deux Caddyfile passent `caddy validate` et `caddy fmt` (Caddy 2.11.7).
- Avec ce Caddy devant les serveurs de développement :
  - `/api` va au backend, les pages au frontend, sauf
    `/api/auth/local-logout`, une route du frontend (effacement des cookies
    quand le backend ne répond pas), qui reste servie par Next.js ;
  - les pages sont compressées (gzip) ;
  - un corps de 21 Mio passe et un corps de 22 Mio est refusé par Caddy (413).
- Le choix de l'URL de l'API côté serveur (`API_INTERNAL_URL`, sinon
  `NEXT_PUBLIC_API_URL`) est couvert par des tests jest.
- **En-têtes** (`curl -I` à travers ce Caddy) :
  - HSTS, `nosniff`, `Referrer-Policy` et `Permissions-Policy` sont présents
    sur les pages et sur l'API ; `Server` et `X-Powered-By` sont absents ;
  - une seule `Content-Security-Policy` par réponse : celle de Next.js
    (nonce différent à chaque requête) sur les pages, et
    `default-src 'none'` sur l'API.
- **Adresse du client :**
  - des en-têtes falsifiés (`X-Forwarded-For`, `X-Real-IP`, `True-Client-IP`,
    `CF-Connecting-IP`) n'atteignent pas le backend : il reçoit l'adresse vue
    par Caddy ;
  - tests jest (application Nest de test) : derrière le proxy de confiance,
    chaque client a son propre compteur de limitation ; un
    `X-Forwarded-For` venant d'une autre source est ignoré, et ne donne pas
    de nouveau compteur.
- **CORS** (tests jest) : désactivé, aucune origine ne reçoit
  `Access-Control-Allow-Origin` ; activé, seule `FRONTEND_URL` est admise.
- **Restriction de l'administration** : avec une liste qui exclut le
  client, les pages de l'administration et `/api/admin` répondent 403 ; le
  reste du site n'est pas touché. Sans liste, tout passe.
- **Aucune erreur CSP** dans Chromium (Playwright) :
  - montage testé : build de production du frontend derrière ce Caddy, même
    origine pour les pages et l'API ;
  - pages publiques (accueil fr et ar, connexion, inscription, mot de passe
    oublié, nouveau mot de passe, connexion de l'administration) ;
  - pages connectées (tableau de bord, patients, dossier patient, analyses
    IA, suivi des analyses, résultat d'une analyse) ;
  - zéro violation, et l'image de la visionneuse, en URL `blob:`, s'affiche.

  Ce test a révélé trois blocages, corrigés : le script du thème
  (`next-themes`) et celui de la page d'accueil n'avaient pas de nonce, et
  zod testait `new Function` (désactivé par `z.config({ jitless: true })`).

- **Sauvegarde et restauration**, scripts exécutés hors conteneur (Git Bash)
  sur la MariaDB locale, avec une base synthétique (migrations et seed) et
  des fichiers factices, jamais la vraie base :
  - sauvegarde non chiffrée, puis restauration dans une base vide et un
    dossier vide : base identique (25 tables, comparaison des dumps) et
    fichiers identiques (comparaison des SHA-256) ;
  - même chose chiffrée avec age 1.3.2 : l'archive commence par
    `age-encryption.org/v1` et ne contient aucune donnée lisible ;
  - sans la clé privée, la restauration s'arrête avant d'écrire ;
  - cible non vide sans `--force` : refus, rien n'est écrit ; avec
    `--force`, base et fichiers sont remplacés ;
  - archive altérée : rejetée à la vérification de l'empreinte ;
  - rétention : une archive de 15 jours est supprimée, une de 13 jours
    gardée, les autres fichiers ne sont pas touchés ;
  - planificateur : déclenchement à l'heure dite, état `ok` ou `failed`,
    reprogrammation au lendemain, heure invalide refusée ; le contrôle de
    santé devient « unhealthy » après un échec ;
  - ShellCheck et `bash -n` ne signalent rien ; hadolint passe le Dockerfile
    de sauvegarde.

**Pas vérifié** (à faire sur une machine équipée de Docker) :

- le build des images et le démarrage des six services avec leur santé ;
- l'obtention d'un certificat Let's Encrypt (qui demande un vrai domaine) et
  HSTS sur une vraie connexion HTTPS ;
- l'affichage d'un PDF dans le cadre de l'administration (`object-src blob:`) ;
- Firefox et Safari : seul Chromium a été testé ;
- la sauvegarde et la restauration **dans les conteneurs** : le `mysqldump`
  de MySQL 8.4 (les tests ont utilisé le client MariaDB 10.4) ;
  l'utilisateur 1000 face au dossier `BACKUP_DIR` sous Linux ; le fuseau
  `BACKUP_TZ` dans l'image ; une restauration complète suivie d'un
  `docker compose up -d`.
