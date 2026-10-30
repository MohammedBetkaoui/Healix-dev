# Checklist de validation Windows — HealixDz Desktop

À exécuter à la main sur une **machine Windows propre** (sans Node.js,
npm, Rust, cargo ni Visual Studio Build Tools), avec l'installateur de
la release (`HealixDz-Desktop_X.Y.Z_x64-setup.exe` et/ou le MSI).
Marquer chaque case avec la date + la version testée.

> ⚠️ requires Windows : le Windows Credential Manager, la fragmentation
> de secrets et le redémarrage réel de la machine ne peuvent pas être
> validés depuis le banc E2E Linux.

Machine : … (Windows 11 x64 / Windows 10 x64, build …)
Release testée : `desktop-v…`

## 0. Avant l'installation

- [ ] `Get-FileHash -Algorithm SHA256` des installateurs ==
      `SHA256SUMS.txt` de la release.
- [ ] `Get-AuthenticodeSignature` : Status **Valid** sur l'exe et le msi
      (éditeur HealixDz, horodatage).
- [ ] WebView2 : noter si la machine possède déjà le runtime
      (`Get-ItemProperty HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A409ED89}`
      v2). Si absent, l'installateur doit télécharger le runtime sans
      erreur obscure.

## 1. Installation initiale

- [ ] Installation NSIS satisfaisante (pas de demande d'administrateur —
      mode par utilisateur), raccourci Bureau + menu Démarrer présents.
- [ ] `Programs and Features` : nom **HealixDz Desktop**, éditeur
      HealixDz, version correcte, icône du produit (pas une icône Tauri
      générique).
- [ ] L'application démarre depuis le raccourci sans Node/Rust installé
      sur la machine.
- [ ] Icône correcte : fenêtre, barre des tâches, Alt-Tab.

## 2. Première session (réseau actif)

- [ ] Connexion médecin + enregistrement de l'appareil (Device PoP)
      sans erreur.
- [ ] Bootstrap : patients autorisés visibles, catalogue médicaments
      présent.
- [ ] Windows Credential Manager : entrées du service
      `dz.healix.desktop` présentes (database-key-v1, device-private-key,
      offline-grant, grant-public-key ; fragments `-chunk-v1-*` +
      manifest si secret long).
- [ ] Aucun secret en clair sur le disque (pas de fichier JSON de secret
      dans %APPDATA%).

## 3. Travail hors ligne réel

- [ ] Couper le réseau.
- [ ] Créer une consultation (sauvegarde locale → outbox pending).
- [ ] Créer une ordonnance DRAFT (catalogue : item, dosage).
- [ ] Fermer proprement l'application.
- [ ] **Redémarrer Windows.**
- [ ] Rouvrir l'application : les deux brouillons sont là, sans
      re-authentification complète (grant encore valide).
- [ ] La base est toujours SQLCipher : le fichier de `%APPDATA%`
      `dz.healix.desktop` ne contient PAS l'en-tête plaintext SQLite
      (les 16 premiers octets ne sont pas `SQLite format 3`).
- [ ] Reconnecter le réseau → la synchronisation reprend (ACK
      retour, outbox vide, curseur avancé) et aucune donnée n'a été perdue.

## 4. Secrets longs (fragmentation §13)

- [ ] Secret court : écriture/lecture OK.
- [ ] Secret proche de la limite (~1 200 unités UTF-16) : write/read OK.
- [ ] Secret > limite (multi-fragments) : write → fragments visibles
      dans Credential Manager + manifest `-chunk-manifest-v1` ; read OK.
- [ ] Surécriture (réécriture → ancienne taille nettoyée), suppression
      (logout) : fragments + manifest disparaissent.
- [ ] Réinstallation/MAJ : les fragments restent lisibles (test réel via
      §3 + §5).

## 5. Mise à jour sans perte (§15/§52)

- [ ] L'écran de connexion de la version A affiche `vA` + build du
      commit.
- [ ] « Vérifier la mise à jour » détecte la version B publiée ;
      installer (clic utilisateur), redémarrage automatique.
- [ ] La nouvelle version affiche `vB` + build B.
- [ ] Base SQLCipher conservée et lisible ; consult/ordonnances présentes.
- [ ] Identité RSA inchangée (même `device-id` vu par le backend).
- [ ] Credential Manager toujours lisible (le serveur revalide
      l'identité + le grant sans ré-enregistrement).
- [ ] Outbox intacte (aucune opération/séquence perdue), curseur
      conservé, la synchro reprend proprement.
- [ ] **Alors seulement** : répéter 3 (consultation + ordonnance) et 1.

## 6. Désinstallation (§16)

- [ ] `Programs and Features` → désinstalle ; les données
      `%APPDATA%\dz.healix.desktop` et les entrées Credential Manager
      restent (vérifier).
- [ ] Réinstall + réouverture : les données sont de retour (aucune
      perte).

## 7. Résultat

| Scénario | Attendu | Résolu (date, machine) |
| --- | --- | --- |
| Installation propre | launched, icons OK |  |
| Bootstrap + hors ligne + données | zéro perte |  |
| Credential Manager après reboot | secrets récupérables |  |
| Redémarrage Windows | base lisible, header SQLCipher |  |
| Mise à jour A → B | données + identité conservées |  |
| Désinstallation | données conservées par design |  |
