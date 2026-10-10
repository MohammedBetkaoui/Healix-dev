# Déploiement Docker de HealixDz

Cinq conteneurs, décrits par [`docker-compose.yml`](docker-compose.yml) :

| Service | Image | Rôle | Réseaux | Ports publiés |
| --- | --- | --- | --- | --- |
| `caddy` | `caddy:2.11-alpine` | Proxy inverse HTTPS, certificats Let's Encrypt | edge | `80`, `443` |
| `frontend` | [`frontend/Dockerfile`](frontend/Dockerfile) | Interface Next.js (serveur autonome) | edge | aucun |
| `backend` | [`backend/Dockerfile`](backend/Dockerfile) | API NestJS, migrations, PDF (Chromium) | edge, internal | aucun |
| `mysql` | `mysql:8.4` | Base de données | internal | aucun |
| `ai-service` | [`ai-service/Dockerfile`](ai-service/Dockerfile) | Inférence (PyTorch CPU) | internal | aucun |

- **Un seul domaine.** Tout passe par Caddy, sur `https://APP_DOMAIN` :
  `/api/*` va au backend, le reste au frontend. Le navigateur appelle donc
  l'API sur la même origine que les pages, et les cookies de session valent
  pour les deux. Configuration : [`caddy/`](caddy/).
- **Réseaux.**
  - `edge` (Caddy, frontend, backend) : le frontend n'a aucun accès à MySQL ni
    au service IA.
  - `internal` (backend, MySQL, service IA) : `internal: true`, sans route
    vers l'extérieur.
  - Le backend sort par `edge` (SMTP).
- **Appels serveur du frontend.** Le serveur Next.js vérifie les sessions en
  appelant directement le backend (`API_INTERNAL_URL=http://backend:3001/api`),
  sans repasser par l'adresse publique.
- **Volumes nommés :**
  - `healixdz_mysql-data` : la base ;
  - `healixdz_patient-files` : documents patients, masques de segmentation,
    comptes rendus PDF ;
  - `healixdz_caddy-data` et `healixdz_caddy-config` : certificats et état de
    Caddy.
- **Fichiers montés depuis le dépôt ou l'hôte, en lecture seule :**
  - les poids des modèles (`AI_MODELS_DIR`), jamais copiés dans une image ;
  - le rapport d'évaluation `ai-service/evaluation/brain-latest.json`, lu par
    le backend (`AI_EVALUATION_REPORT_PATH`) ;
  - la configuration de Caddy (`caddy/`).
- **Secrets.** Tous viennent du fichier `.env`, non versionné. Aucune image
  n'en contient.

## 1. Prérequis

**Démonstration locale (Windows)**

- **Docker Desktop** pour Windows, avec le moteur WSL 2. Dans *Settings >
  Resources*, comptez au moins **8 Go de mémoire** pour Docker : PyTorch,
  Chromium et MySQL tournent ensemble.
- Environ **10 Go d'espace disque** pour les images.
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

Les trois fichiers chargés par le service :

| Fichier | SHA-256 |
| --- | --- |
| `fold_5_best.pth` | `311d2cbb171266721871f46f7f841b1dffef0c0fec40853745f55be9939ae654` |
| `healixdz_seg_meningioma_v5_best.pth` | `95c94047da1daaf71744e6076c5f01401c0af09d5f87335477359681ba7c939d` |
| `healixdz_seg_pituitary_v5_best.pth` | `cfd8fc4e55e6a4d7ca97e9613a95451d9680426bdd714f818786ab0e9983dd89` |

Vérification des empreintes :

```powershell
Get-FileHash models\*.pth -Algorithm SHA256 | Format-Table Hash, Path   # Windows
```

```bash
sha256sum models/*.pth   # Linux
```

Sans le classifieur, le service démarre, mais il refuse les analyses
(erreur 503, classifieur non chargé). Si le dossier n'existe pas, Docker
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
- en production, `SMTP_HOST`, `MAIL_FROM` et les identifiants SMTP.

Pour générer un secret (64 caractères hexadécimaux) :

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') })   # PowerShell
```

```bash
openssl rand -hex 32   # Linux, Git Bash
```

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

Le premier build prend un moment (PyTorch et Chromium). Au démarrage, le
backend applique les migrations en attente (`prisma migrate deploy`), puis
lance l'API. `docker compose ps` doit afficher les cinq services `healthy`.

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

## 6. Premier compte administrateur

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

## 7. Sauvegarde et restauration

Sauvegardez **ensemble** la base et le volume des fichiers : un document cité
par la base doit exister dans le volume.

### Sauvegarde

```bash
mkdir -p sauvegardes
d=$(date +%Y-%m-%d-%H%M)

# Base : le dump est écrit dans le conteneur, puis copié.
docker compose exec mysql sh -c 'mysqldump --single-transaction --triggers --no-tablespaces -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" > /tmp/healixdz.sql'
docker compose cp mysql:/tmp/healixdz.sql "sauvegardes/healixdz-$d.sql"
docker compose exec mysql rm /tmp/healixdz.sql

# Fichiers patients
docker run --rm -v healixdz_patient-files:/data:ro -v "$PWD/sauvegardes:/backup" alpine:3.20 tar czf "/backup/fichiers-patients-$d.tar.gz" -C /data .
```

Le dossier `sauvegardes/` contient des données de santé : gardez-le hors du
dépôt Git et sur un support chiffré.

### Restauration

Remplacez `<date>` par celle de la sauvegarde.

```bash
docker compose stop frontend backend

# Base
docker compose cp "sauvegardes/healixdz-<date>.sql" mysql:/tmp/restore.sql
docker compose exec mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < /tmp/restore.sql && rm /tmp/restore.sql'

# Fichiers patients (le contenu actuel du volume est remplacé)
docker run --rm -v healixdz_patient-files:/data -v "$PWD/sauvegardes:/backup:ro" alpine:3.20 sh -c "find /data -mindepth 1 -delete && tar xzf /backup/fichiers-patients-<date>.tar.gz -C /data"

docker compose start backend frontend
```

## 8. Mise à jour

```bash
git pull
docker compose build
docker compose up -d
```

`up -d` recrée les conteneurs dont l'image a changé ; le backend applique les
nouvelles migrations à son démarrage. Avec la configuration de
démonstration, ajoutez les deux `-f` (ou `COMPOSE_FILE`, voir plus haut).
Sauvegardez avant une mise à jour qui contient des migrations.

`PUBLIC_API_URL` (déduite de `APP_DOMAIN`) et `ADMIN_GATE_PATH` sont écrits
dans le frontend au moment du build : après les avoir changés, lancez
`docker compose build frontend`.

## 9. Points d'attention

- **Limite de débit (comportement existant de l'application).** Le backend
  limite à 20 requêtes par minute et par IP. Les vérifications de session
  faites par le serveur Next.js arrivent toutes du conteneur frontend : avec
  beaucoup d'utilisateurs simultanés, cette limite peut être atteinte, et
  l'interface traite alors la réponse 429 comme une déconnexion. Le corriger
  demande une modification du code, non faite ici.
- **Docker Desktop.** Sous Windows et macOS, les connexions arrivent dans les
  conteneurs avec l'adresse de la passerelle Docker, et non celle du client :
  en démonstration locale, tous les navigateurs partagent donc la même
  adresse. Sur un serveur Linux, l'adresse réelle du client est conservée.

## 10. Ce qui a été vérifié, et ce qui ne l'a pas été

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

**Pas vérifié** (à faire sur une machine équipée de Docker) : le build des
images, le démarrage des cinq services et leur santé, l'obtention d'un
certificat Let's Encrypt (qui demande un vrai domaine).
