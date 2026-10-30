# Distribution Windows de HealixDz Desktop

Processus complet et reproductible : build natif Windows (NSIS + MSI,
x64), signature de code, artefacts de mise à jour signés, checksums
SHA-256 et GitHub Release.

## 1. Pré-requis (une seule fois)

| Élément | Où | Rôle |
| --- | --- | --- |
| Variable de dépôt `DESKTOP_API_BASE_URL` | Settings > Secrets and variables > Actions > Variables | URL HTTPS de l'API HealixDz compilée dans l'installateur (`VITE_API_BASE_URL`). Obligatoire pour toute release officielle. |
| Secret `WINDOWS_CERTIFICATE_BASE64` | Environment **production** | Certificat Authenticode `.pfx` de l'éditeur, encodé en base64. |
| Secret `WINDOWS_CERTIFICATE_PASSWORD` | Environment **production** | Mot de passe du `.pfx`. |
| Secret `TAURI_SIGNING_PRIVATE_KEY` | Environment **production** | Clé privée de signature du canal de mise à jour (Tauri updater, minisign). |
| Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Environment **production** | Mot de passe de la clé updater (facultatif si la clé n'en porte pas). |
| Environment GitHub `production` | Settings > Environments | Porte les secrets de signature ; recommandé : approbation manuelle (protector) sur les tags `desktop-v*`. |

Aucune clé privée ne se trouve dans le dépôt : `desktop/.updater/`
(gitignored) ne contient qu'une clé **de test** dont seule la partie
publique est référencée dans `desktop/src-tauri/tauri.conf.json`
(`plugins.updater.pubkey`).

### Certificat Authenticode

- Un **certificat de test** (par exemple `New-SelfSignedCertificate` +
  `signtool sign /fd sha256`) valide uniquement la *mécanique* du
  pipeline : ce n'est **pas** un certificat de confiance publique.
  Test signing ≠ production trusted signing.
- La signature de production (OV/EV) attache l'identité de l'éditeur à
  l'exécutable. Une signature validée **améliore** la réputation
  SmartScreen, mais l'avertissement initial peut persister tant que le
  certificat/le binaire n'ont pas d'historique de réputation : ne pas
  tenter de contourner SmartScreen.

### Rotation de la clé updater

La clé publique embarquée est celle de la clé de test initiale. Pour
une production officielle :

1. générer la paire dédiée :
   `cd desktop && npx tauri signer generate --ci -w <chemin-sécurisé>/healixdz-updater.key`
   — clé privée dans le coffre-fort de secrets, jamais en Git ;
2. reporter la **partie publique** dans `plugins.updater.pubkey`
   (une rotation implique de publier une version qui embarque la
   nouvelle clé) ;
3. la partie privée avec le contenu texte du fichier va dans
   `TAURI_SIGNING_PRIVATE_KEY`, le mot de passe éventuel dans
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

## 2. Versioning

- Source de vérité : `desktop/package.json`.
- `node scripts/set-desktop-version.mjs 0.2.0` met à jour
  `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`
  et l'entrée `healixdz-desktop` de `Cargo.lock`.
- Semver : PATCH = bug fix, MINOR = fonctionnalité compatible, MAJOR =
  rupture de compatibilité.
- Tags : `desktop-vX.Y.Z` ; pré-release : `desktop-v0.2.0-beta.1`
  (publiée avec l'option *prerelease* GitHub, jamais proposée par le
  canal stable `releases/latest`).

## 3. Procédure exacte pour publier `desktop-vX.Y.Z`

```bash
# 1. Vérifier la configuration (versions, icônes, updater, HTTPS…)
cd desktop && node scripts/release-check.mjs

# 2. Bump de version (committé) si nécessaire, avec test local complet
node scripts/set-desktop-version.mjs 0.1.1

# Build front-end local : sans URL de production, le build échoue
# volontairement (garde-fou §40). Pour un artefact distribuable :
#   export VITE_API_BASE_URL=https://…   ($env:VITE_API_BASE_URL en PowerShell)
npm run build
cd src-tauri && cargo test && cd ..

# 3. Tagger un commit de main déjà vert (les 5 jobs standard) : le
#    workflow de release re-vérifie la CI de ce commit exact.

# 4. Tag annoté = notes de release officielles
git tag -a desktop-v0.1.1 -F docs/release/desktop-v0.1.1.md
git push origin desktop-v0.1.1
```

Le workflow **Desktop Release (Windows)** (`.github/workflows/desktop-release.yml`)
exécute alors, sur `windows-latest` :

1. validation tag ↔ versions configurées (les quatre fichiers) ;
2. validation de la configuration de packaging (`release-check.mjs`) ;
3. `npm ci`, `cargo test` (moteur Rust complet sur Windows) ;
4. `npx tauri build --bundles nsis,msi` (Tauri exécute lui-même le build
   front-end avec `VITE_API_BASE_URL` + `VITE_BUILD_SHA`) ;
5. collecte des artefacts avec des noms normalisés
   (`HealixDz-Desktop_X.Y.Z_x64-setup.exe`,
   `HealixDz-Desktop_X.Y.Z_x64_en-US.msi`) et contrôle des métadonnées
   de version des exécutables (`ProductVersion`, `ProductName`) ;
6. **signature Authenticode** de l'exe et du msi avec horodatage
   RFC 3161, et vérification `Get-AuthenticodeSignature → Valid` ; sans
   secrets de signature, une release officielle échoue explicitement
   (jamais publiée « signée » alors qu'elle ne l'est pas) ;
7. **artefacts updater** : `release-package/latest.json`
   (`windows-x86_64`, URL de release + signature minisign calculée sur
   le fichier **après** signature Authenticode) + `SHA256SUMS.txt`
   (calcul APRÈS signature, jamais avant) ;
8. **smoke test** réalisé *sur le runner Windows* : installation
   silencieuse NSIS, démarrage réel de l'application, fermeture,
   désinstallation ;
9. contrôle de la CI standard verte sur le commit taggé (les cinq
   jobs) ;
10. création (ou mise à jour idempotente) de la GitHub Release et
    chargement des assets.

Artefacts d'une release stable :

```
HealixDz Desktop v0.1.0
├── HealixDz-Desktop_0.1.0_x64-setup.exe   (NSIS, installation par utilisateur)
├── HealixDz-Desktop_0.1.0_x64_en-US.msi
├── HealixDz-Desktop_0.1.0_x64-setup.exe.sig   (canal de mise à jour)
├── latest.json                                 (manifest updater signé)
└── SHA256SUMS.txt
```

Vérifications locales avant passation d'un paquet :

```powershell
certutil -hashfile HealixDz-Desktop_0.1.0_x64-setup.exe SHA256       # == SHA256SUMS.txt
Get-AuthenticodeSignature .\HealixDz-Desktop_0.1.0_x64-setup.exe     # Status = Valid
```

## 4. Diffusion client (mise à jour depuis l'application)

HealixDz Desktop intègre le mécanisme de mise à jour officiel de Tauri 2
(`tauri-plugin-updater`) :

1. le bouton « Vérifier la mise à jour » (écran de connexion, unique
   endroit proposé) consulte `latest.json` sur le canal stable ;
2. la version disponible est affichée, jamais téléchargée à
   l'insu de l'utilisateur, et jamais installée automatiquement
   pendant une consultation ou une synchronisation ;
3. sur clic, `check/download/install` : le manifeste téléchargé
   **dessus** est l'exécutable du canal, validé par sa signature
   minisign contre la clé publique embarquée ; l'installateur est en
   plus Authenticode signé ;
4. `relaunch()` du plugin process redémarre l'application après
   installation ;
5. au retour, tout l'état local est conservé : base SQLCipher, clés du
   Credential Manager, identité d'appareil RSA, Outbox, curseur.

## 5. Données locales à travers une mise à jour (§15/§33)

- La base SQLCipher vit dans `%APPDATA%\dz.healix.desktop` ; les
  migrations locales intégrées s'exécutent à l'ouverture : une base
  d'une version antérieure s'ouvre normalement (aucun « delete and
  recreate »).
- Windows Credential Manager conserve les entrées du service
  `dz.healix.desktop` (clé SQLCipher `database-key-v1`, clé privée RSA
  `device-private-key`, grant `offline-grant`, `grant-public-key`).
- Outbox, curseur de synchro et cache patients sont conservés ; les ACK
  en attente reprennent normalement.
- **Downgrade non supporté** : ouvrir une base récente avec une
  application plus ancienne n'est pas garanti (schéma local en avant).
  En cas de release défaillante → publier une version corrective
  (`0.2.0` défectueuse ⇒ `0.2.1`).

## 6. Désinstallation (§16)

- La désinstallation NSIS supprime les fichiers du programme
  uniquement. Les données cliniques chiffrées (`%APPDATA%`
  `dz.healix.desktop`), les entrées Credential Manager et la base
  locale **ne sont pas supprimées silencieusement** — application
  médicale : aucune destruction implicite de données.
- Purge totale (assistance ou départ définitif d'un poste) : supprimer
  manuellement les entrées Credential Manager du service
  `dz.healix.desktop` puis le répertoire de données
  `%APPDATA%\dz.healix.desktop`.

## 7. WebView2 (§11)

`webviewInstallMode: downloadBootstrapper` (valeur Tauri officielle) :
si le runtime WebView2 n'est pas déjà présent (Windows 11 l'intègre ;
Windows 10 en général aussi via Edge), un petit bootstrapper le
télécharge pendant l'installation — il faut donc Internet **vingt
secondes à une minute** au premier lancement de l'installateur sur une
machine jamais mise à jour. Le mode `offlineInstaller` (runtime
embarqué, +200 Mo) reste possible si des installations hors ligne sans
Webview intégré doivent être supportées un jour (décision produit) ; ce
n'est pas l'option courante.

## 8. Environnements (§39/§42)

- **Développement** : `npm run tauri dev`, `VITE_API_BASE_URL` est
  libre (fallback `http://localhost:3001/api` documenté), aucune
  signature attendue.
- **Build de test CI** (dispatch manuel du workflow) : front-end
  construit avec `VITE_IGNORE_MISSING_API_BASE=1` — artefact non signé,
  chargé en artifact Actions, jamais en Release.
- **Production** : `VITE_API_BASE_URL` = variable de dépôt HTTPS
  (`DESKTOP_API_BASE_URL`) ; le build échoue sans elle ; un fallback
  localhost dans un build release est impossible (rupture explicite au
  chargement de l'app + vérification du workflow).
- Aucun log n'embarque access/refresh token, OfflineAccessGrant, clé
  privée RSA, clé SQLCipher ou payload clinique (§42) : le moteur Rust
  n'écrit rien dans des fichiers de diagnostic, les erreurs s'affichent
  dans l'interface.

## 9. Limites connues (§34/§67)

- **Validation Windows réelle (machine propre)** : la checklist
  manuelle `docs/windows-release-checklist.md` est à repasser sur
  Windows 11 x64 et idéalement Windows 10 x64. Le banc E2E offline
  Linux ne simule pas le Windows Credential Manager (§38) ; seules les
  cases « machine réelle » valident ce niveau.
- **Signature en production** : pipeline explicite, mais la première
  release officielle dépend du certificat Authenticode réel et de la
  rotation de la clé updater (§1).
- **Canal beta** : le tag `desktop-v0.2.0-beta.1` est publié en
  prerelease ; il n'est pas proposé par le canal stable. Un channel
  dédié côté updater pourra être ajouté plus tard.
- **ARM64 Windows** : pas de cible en V1 (x64 uniquement).
- **Crash reporting** : pas de système externe (§43). Le support
  s'appuie sur l'identité de build affichée dans l'UI
  (`vX.Y.Z · build <sha>`).
