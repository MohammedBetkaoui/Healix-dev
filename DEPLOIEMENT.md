# Déploiement Docker de HealixDz

Quatre conteneurs, décrits par [`docker-compose.yml`](docker-compose.yml) :

| Service | Image | Rôle | Port publié sur l'hôte |
| --- | --- | --- | --- |
| `mysql` | `mysql:8.4` | Base de données | aucun |
| `ai-service` | [`ai-service/Dockerfile`](ai-service/Dockerfile) | Inférence (PyTorch CPU) | aucun |
| `backend` | [`backend/Dockerfile`](backend/Dockerfile) | API NestJS, migrations, PDF (Chromium) | `3001` |
| `frontend` | [`frontend/Dockerfile`](frontend/Dockerfile) | Interface Next.js (serveur autonome) | `3000` |

- **Réseau.** MySQL et le service IA ne sont que sur un réseau interne, sans
  accès à Internet et sans port publié. Le backend est sur ce réseau et sur
  un second, qui lui donne la sortie (SMTP) et ses ports publiés.
- **Frontend.** Il partage l'espace réseau du backend
  (`network_mode: service:backend`). Le serveur Next.js appelle l'API à la
  même adresse que le navigateur (`NEXT_PUBLIC_API_URL`, par exemple
  `http://localhost:3001/api`). Dans un conteneur à part, `localhost`
  désignerait le frontend lui-même ; en partageant l'espace réseau du backend,
  cette adresse atteint bien l'API, sans modifier le code. Son port est donc
  publié par le service `backend`.
- **Volumes.** Deux volumes nommés : `healixdz_mysql-data` (la base) et
  `healixdz_patient-files` (documents patients, masques de segmentation,
  comptes rendus PDF).
- **Fichiers montés depuis le dépôt ou l'hôte, en lecture seule :**
  - les poids des modèles (`AI_MODELS_DIR`), jamais copiés dans une image ;
  - le rapport d'évaluation `ai-service/evaluation/brain-latest.json`, lu par
    le backend (`AI_EVALUATION_REPORT_PATH`).
- **Secrets.** Tous viennent du fichier `.env`, non versionné. Aucune image
  n'en contient.

## 1. Prérequis (Windows)

- **Docker Desktop** pour Windows, avec le moteur WSL 2 (choix par défaut à
  l'installation, qui peut demander un redémarrage). Dans *Settings >
  Resources*, comptez au moins **8 Go de mémoire** pour Docker : PyTorch,
  Chromium et MySQL tournent ensemble.
- Environ **10 Go d'espace disque** pour les images (PyTorch CPU et Chromium
  sont volumineux), plus la base et les fichiers patients.
- **Git**, pour récupérer et mettre à jour le dépôt.
- Les **poids des modèles** (voir ci-dessous) : ils ne sont pas dans le dépôt.

Les commandes ci-dessous sont à taper dans PowerShell, à la racine du dépôt.

## 2. Poids des modèles

Par défaut, le service IA lit les poids dans le dossier `models/` à la racine
du dépôt (Git l'ignore). Pour un autre dossier, indiquez son chemin dans
`AI_MODELS_DIR` du fichier `.env` (par exemple `C:\HealixDz\models`). Il est
monté **en lecture seule** dans le conteneur, à `/models`.

Les trois fichiers chargés par le service :

| Fichier | SHA-256 |
| --- | --- |
| `fold_5_best.pth` | `311d2cbb171266721871f46f7f841b1dffef0c0fec40853745f55be9939ae654` |
| `healixdz_seg_meningioma_v5_best.pth` | `95c94047da1daaf71744e6076c5f01401c0af09d5f87335477359681ba7c939d` |
| `healixdz_seg_pituitary_v5_best.pth` | `cfd8fc4e55e6a4d7ca97e9613a95451d9680426bdd714f818786ab0e9983dd89` |

Vérification des empreintes :

```powershell
Get-FileHash models\*.pth -Algorithm SHA256 | Format-Table Hash, Path
```

Sans le classifieur, le service démarre, mais il refuse les analyses
(erreur 503, classifieur non chargé). Si le dossier n'existe pas, Docker refuse de démarrer
le conteneur (`bind source path does not exist`).

## 3. Fichier `.env`

```powershell
Copy-Item .env.docker.example .env
notepad .env
```

Chaque variable est commentée dans
[`.env.docker.example`](.env.docker.example). À remplir au minimum :
`MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, les quatre secrets JWT et
`AI_SERVICE_TOKEN`. En production, ajoutez aussi `SMTP_HOST`, `MAIL_FROM` et
l'adresse publique `APP_PUBLIC_URL`.

Pour générer un secret dans PowerShell (64 caractères hexadécimaux) :

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') })
```

`.env` contient les secrets : ne le versionnez pas (Git l'ignore) et ne
l'envoyez à personne.

## 4. Première exécution

### Démonstration locale (sans SMTP)

[`docker-compose.dev.yml`](docker-compose.dev.yml) met le backend en mode
développement : sans SMTP, il démarre quand même, et chaque e-mail
(lien de réinitialisation compris) est écrit dans ses logs au lieu d'être
envoyé.

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
docker compose ps
docker compose logs -f backend
```

Pour ne pas répéter les deux `-f`, ajoutez à `.env` (sous Windows, le
séparateur est `;`) :

```dotenv
COMPOSE_FILE=docker-compose.yml;docker-compose.dev.yml
```

### Production

```powershell
docker compose build
docker compose up -d
docker compose ps
```

Par défaut, `NODE_ENV=production`. Sans `SMTP_HOST`, `MAIL_FROM` ni
`APP_PUBLIC_URL`, le backend **refuse de démarrer**, avec un message qui
nomme les variables manquantes (`docker compose logs backend`). C'est voulu :
en production, un e-mail ne doit jamais être perdu en silence.

Le premier build prend un moment (téléchargement de PyTorch et de Chromium).
Au démarrage, le backend applique les migrations en attente
(`prisma migrate deploy`), puis lance l'API. `docker compose ps` doit
afficher les quatre services `healthy`. L'application est alors sur
`APP_PUBLIC_URL`, par défaut <http://localhost:3000>. Utilisez exactement
cette adresse : <http://127.0.0.1:3000> est une autre origine pour le
navigateur, et l'API la refusera.

## 5. Premier compte administrateur

Le mécanisme existant est le *seed* du backend (`prisma/seed.ts`, compilé en
`dist/prisma/seed.js`). Il crée ou met à jour un compte `SUPER_ADMIN` à partir
des variables `ADMIN_SEED_*`, puis enregistre les formules d'abonnement. Il
est à lancer **une fois** à la première installation (puis à chaque fois
qu'on veut remettre à jour les formules), une fois la pile démarrée :

1. Dans `.env`, renseignez `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD` et
   `ADMIN_SEED_FULL_NAME`.
2. Lancez :

   ```powershell
   docker compose --profile seed run --rm admin-seed
   ```

   La sortie se termine par `Admin seed ready.` et
   `Subscription plans seed ready.`.
3. Videz ensuite `ADMIN_SEED_PASSWORD` dans `.env`.

L'administration se trouve à `APP_PUBLIC_URL` + `ADMIN_GATE_PATH` + `/login`,
par exemple <http://localhost:3000/hzdz-control-gate-2026/login>. Les comptes
d'établissement et de médecin indépendant se créent depuis la page
d'inscription de l'application.

Si l'administrateur a oublié son mot de passe : mettez
`ADMIN_SEED_PASSWORD` (nouveau mot de passe) et
`ADMIN_SEED_UPDATE_PASSWORD=true` dans `.env`, relancez la commande, puis
remettez `false` et videz le mot de passe. La réinitialisation par e-mail ne
concerne pas les comptes d'administration.

## 6. Sauvegarde et restauration

Sauvegardez **ensemble** la base et le volume des fichiers : un document cité
par la base doit exister dans le volume. Pour une copie parfaitement
cohérente, arrêtez l'application le temps de la sauvegarde
(`docker compose stop frontend backend`, puis `docker compose start backend frontend`).

### Sauvegarde

```powershell
New-Item -ItemType Directory -Force sauvegardes | Out-Null
$d = Get-Date -Format yyyy-MM-dd-HHmm

# Base : le dump est écrit dans le conteneur, puis copié (pas de
# redirection PowerShell, qui changerait l'encodage).
docker compose exec mysql sh -c 'mysqldump --single-transaction --routines --triggers --no-tablespaces -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" > /tmp/healixdz.sql'
docker compose cp mysql:/tmp/healixdz.sql "sauvegardes/healixdz-$d.sql"
docker compose exec mysql rm /tmp/healixdz.sql

# Fichiers patients
docker run --rm -v healixdz_patient-files:/data:ro -v "${PWD}\sauvegardes:/backup" alpine:3.20 tar czf "/backup/fichiers-patients-$d.tar.gz" -C /data .
```

Le dossier `sauvegardes/` contient des données de santé : gardez-le hors du
dépôt Git et sur un support chiffré.

### Restauration

Remplacez `<date>` par celle de la sauvegarde.

```powershell
docker compose stop frontend backend

# Base
docker compose cp "sauvegardes/healixdz-<date>.sql" mysql:/tmp/restore.sql
docker compose exec mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < /tmp/restore.sql && rm /tmp/restore.sql'

# Fichiers patients (le contenu actuel du volume est remplacé)
docker run --rm -v healixdz_patient-files:/data -v "${PWD}\sauvegardes:/backup:ro" alpine:3.20 sh -c "find /data -mindepth 1 -delete && tar xzf /backup/fichiers-patients-<date>.tar.gz -C /data"

docker compose start backend frontend
```

`tar` conserve le propriétaire des fichiers (l'utilisateur 1000 du
backend). Au redémarrage, le backend applique les éventuelles migrations
plus récentes que la sauvegarde.

## 7. Mise à jour

```powershell
git pull
docker compose build
docker compose up -d
```

`up -d` recrée les conteneurs dont l'image a changé ; le backend applique les
nouvelles migrations à son démarrage. Avec la configuration de
démonstration, ajoutez les deux `-f` (ou `COMPOSE_FILE`, voir plus haut).
Sauvegardez avant une mise à jour qui contient des migrations.

`PUBLIC_API_URL` et `ADMIN_GATE_PATH` sont écrits dans le frontend au moment
du build : après les avoir changés, lancez `docker compose build frontend`.

## 8. Mise en ligne : points d'attention

- **HTTPS et un seul domaine.** Les cookies de session ne sont rattachés
  qu'à l'hôte qui les pose. Servez donc l'interface et l'API sous le même
  domaine, derrière un proxy inverse HTTPS : `/api` vers `127.0.0.1:3001`, le
  reste vers `127.0.0.1:3000`. Réglez ensuite :
  - `APP_PUBLIC_URL=https://votre-domaine` ;
  - `PUBLIC_API_URL=https://votre-domaine/api` (puis reconstruisez le frontend) ;
  - `COOKIE_SECURE=true` ;
  - `TRUST_PROXY` selon votre proxy.

  Le serveur Next.js appelle alors l'API par l'adresse publique : le
  conteneur doit pouvoir résoudre et joindre ce domaine.
- **Limite de débit (comportement existant de l'application).** Le backend
  limite à 20 requêtes par minute et par IP. Les vérifications de session
  faites par le serveur Next.js arrivent toutes de la même adresse locale :
  avec beaucoup d'utilisateurs simultanés, cette limite peut être atteinte,
  et l'interface traite alors la réponse 429 comme une déconnexion. Ce n'est
  pas propre au déploiement Docker. Le corriger demande une modification du
  code, non faite ici.
- **Ports.** Ils ne sont publiés que sur `127.0.0.1` par défaut
  (`BIND_ADDRESS`). Ne mettez `0.0.0.0` que derrière un pare-feu.

## 9. Ce qui a été vérifié, et ce qui ne l'a pas été

Vérifications faites le 10 octobre 2026, sur le poste de développement
(Windows 11). **Docker n'y est pas installé**, ce qui limite ce qui a pu être
testé.

**Vérifié :**

- `docker compose config`, avec le binaire officiel autonome de Docker
  Compose v5.6.0, qui n'a pas besoin du moteur Docker :
  - la configuration est valide, seule et avec `docker-compose.dev.yml` ;
  - sans `.env`, chaque secret obligatoire manquant est signalé par son nom ;
  - le rendu final est conforme : aucun port publié pour `mysql` ni
    `ai-service`, seuls 3000 et 3001 sur `127.0.0.1`, réseau interne
    `internal: true`, poids et rapport d'évaluation montés en lecture seule,
    `NODE_ENV` à `production` par défaut et à `development` avec la variante.
- Les trois Dockerfile passent `hadolint` (v2.15.1). Seul l'avertissement
  DL3008 (versions apt non épinglées) est ignoré, volontairement : les mises
  à jour de sécurité de Debian doivent passer.
- Le contenu de l'image backend, simulé hors Docker :
  - dépendances de production seules (`npm ci --omit=dev`) ; la CLI Prisma
    est présente, `jest` absent ;
  - `prisma generate` réussit sans `DATABASE_URL` ;
  - sur une base MariaDB temporaire, le script d'entrée applique les
    migrations puis lance le seed (`Admin seed ready.`) ;
  - l'API démarre, `GET /api` répond 200, la connexion de l'administrateur
    créé par le seed réussit, et `forgot-password` répond ;
  - en `NODE_ENV=production` sans SMTP, l'API refuse de démarrer avec le
    message attendu.
- `output: "standalone"` est compatible avec la configuration actuelle de
  Next.js. Le build réussit, et le serveur autonome sert :
  - les pages publiques ;
  - la redirection d'une page protégée vers `/login` (le proxy est actif) ;
  - les fichiers statiques et ceux de `public/`.
- Les dépendances d'ai-service se résolvent toutes en roues Linux x86_64
  pour Python 3.12 (40 paquets, dont `torch 2.10.0+cpu` en manylinux 2.28),
  avec l'index PyTorch CPU : rien à compiler.
- Les commandes de la CI, lancées en local :
  - backend : build et jest ;
  - frontend : `tsc`, jest et `next build` ;
  - ai-service : pytest sans les poids (68 tests réussis, 4 ignorés) ;
  - `prisma migrate diff --from-migrations ... --exit-code` sur une base
    fantôme MariaDB. Toutes les migrations s'y rejouent ; les seules
    différences sont les 5 colonnes `Json`, que MariaDB stocke en `LONGTEXT`.
    Sur le MySQL 8 de la CI, `JSON` est un vrai type.

**Pas vérifié** (à faire sur une machine équipée de Docker) :

- la construction des trois images (`docker compose build`) ;
- le démarrage de la pile
  (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up`), la
  santé des quatre services, et le partage de l'espace réseau entre frontend
  et backend ;
- l'installation de Chromium par `npx playwright install --with-deps chromium`
  dans l'image Debian, et la génération d'un PDF dans le conteneur ;
- la connexion du backend à **MySQL 8.4** (authentification
  `caching_sha2_password` avec `allowPublicKeyRetrieval=true`) : seul MariaDB
  a été testé ;
- une connexion et une analyse de bout en bout dans les conteneurs. Pour la
  faire :
  1. créer un compte depuis l'inscription ;
  2. créer un patient et déposer une IRM ;
  3. lancer l'analyse cérébrale ;
  4. enregistrer une décision et télécharger le compte rendu PDF ;
- la première exécution du workflow GitHub Actions
  ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)), qui se fera au
  premier push.
