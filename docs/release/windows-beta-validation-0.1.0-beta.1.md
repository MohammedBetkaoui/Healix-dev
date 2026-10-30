# Journal de qualification Windows — HealixDz Desktop 0.1.0-beta.1

> **Statut : EN COURS — qualification NON terminée.**
> Ce document sépare strictement ce qui a été **vérifié** (avec sa
> source) de ce qui est **non testé**. Aucune case n'est cochée sans
> preuve. HealixDz Desktop n'est **pas** déclaré « prêt pour la
> production » : cette étape vise une *Release Candidate / Beta
> Qualification*, pas une certification de dispositif médical.
>
> Ne jamais inscrire ici : mot de passe de certificat, `.pfx`, clé
> privée updater, JWT, `OfflineAccessGrant`, clé privée RSA, clé SQLCipher.
> Données de test : patients, consultations et ordonnances **fictifs**
> uniquement.

## 1. Identification

| Élément | Valeur |
| --- | --- |
| Version Desktop en dépôt | 0.1.0 (`desktop/package.json`) |
| Version de qualification visée | 0.1.0-beta.1 (tag `desktop-v0.1.0-beta.1`, non créé) |
| Commit de référence (`main`) | `bc8337f5d4b8208545df82189f38794490816c6b` |
| Correctifs de cette étape | non commités au moment de la rédaction (voir §4) |
| Machine / build Windows testé | **non testé** (renseigner : édition, build, x64, date) |
| API de test | **non configurée** (HTTPS staging requis ; jamais `localhost`) |

## 2. État vérifié du pipeline (source : API GitHub Actions)

| Contrôle | Résultat | Preuve |
| --- | --- | --- |
| CI standard sur `bc8337f` | **succès** — Backend, Frontend, Desktop, AI service, Offline E2E Reliability | CI #59 |
| Desktop Release (Windows) sur `bc8337f` | **succès** (`workflow_dispatch`, build de test NON signé) | run #3 (id 41081424706) |
| Étapes de ce run | version, config de release, `npm ci`, `cargo test`, build NSIS + MSI, collecte des artefacts, manifeste updater + SHA-256, **smoke NSIS** (install silencieuse, lancement, désinstallation), upload | succès |
| Signature Authenticode / Release GitHub | **ignorées** (normal : pas de tag, pas de secrets de production) | étapes 14 et 19 « skipped » |
| Runs précédents #1 (`1a06d78`) et #2 (`e9a6456`) | échec, corrigés par `e9a6456` puis `bc8337f` | — |

Un `workflow_dispatch` produit un artefact de test **non signé**, jamais
une release officielle. Le chemin `tag desktop-v*` conserve l'exigence
de configuration de production (environment `production`, secrets de
signature, URL d'API HTTPS) : cette protection n'a pas été modifiée.

## 3. Ce qui est vérifié par du code (CI / tests automatisés)

| Sujet | Statut | Détail |
| --- | --- | --- |
| Logique des secrets longs (coffre en mémoire) | **réussi en local** — 24 tests `security` (court, limite 1 200/1 201 unités, multi-fragments, Unicode, surécriture long→plus court et long→court, suppression, manifest corrompu, fragment manquant, écriture interrompue à chaque point, restes d'écriture interrompue, format de la première version, logout) | `cargo test` : 48 réussis, 0 échec, 6 ignorés ; `cargo fmt --check` OK |
| Compilation du harnais E2E après changement de `cfg` | **réussi en local** | `cargo check --features e2e-harness --bin offline-e2e-harness` |
| Vrai Credential Manager (données synthétiques) | **réussi en local** — 6 tests : court, autour de la limite (1…6 000 unités), Unicode et multi-fragments reconstruits exactement, nettoyage à la surécriture, nettoyage à la suppression, manifest corrompu / fragment manquant | exécutés le 2026-10-30 sur le poste de développement (Windows 11 Pro 10.0.26300, **poste non propre**, session utilisateur courante) ; service `dz.healix.desktop.test`, aucun reste dans le coffre. **Pas encore exécuté sur un runner GitHub** : workflow `desktop-windows-secrets.yml` à lancer après push |
| SQLCipher chiffré (en-tête ≠ `SQLite format 3`) | **non testé** sur machine réelle | checklist §3 |
| Redémarrage Windows | **non testé** — un runner GitHub ne redémarre pas | manuel obligatoire |

## 4. Constats d'audit de `security.rs` et correctifs

Audit du code de stockage des secrets (lecture + tests) :

1. **`delete_secret` — ordre.** L'invariant « lire le nombre de
   fragments avant de supprimer le manifest » était respecté. Le code
   n'en dépend plus : la suppression balaye désormais *tous* les index
   de fragments, de sorte qu'un manifest absent ou corrompu ne laisse
   plus de fragments orphelins.
2. **Écriture interrompue (défaut réel).** Une réécriture « secret
   fragmenté → secret fragmenté » écrasait les fragments en place avant
   de mettre à jour le manifest. Une interruption au milieu laissait
   l'ancien manifest pointer sur un mélange d'anciens et de nouveaux
   fragments, **lu sans erreur** ; le commentaire du code (« l'ancien
   reste lisible ») n'était vrai que pour un ancien secret non
   fragmenté. Correctif : deux jeux de fragments alternés (A :
   `<nom>-chunk-v1-<i>`, manifest `<n>` ; B : `<nom>-chunk-v1b-<i>`,
   manifest `b:<n>`). Le nouveau jeu est écrit dans le jeu inutilisé,
   puis le manifest bascule en une seule écriture ; l'ancien jeu reste
   complet jusque-là. Le format du jeu A est celui de la première
   version : les secrets déjà installés restent lisibles.
3. **Manifest corrompu.** Avant : `delete_secret` supprimait le
   manifest sans supprimer les fragments, et `set_secret` échouait
   définitivement. Après : lecture = erreur explicite (jamais un secret
   partiel) ; une écriture répare l'état et supprime les restes.
4. **Plus de 128 fragments.** Avant : le manifest écrit (`129`) était
   lui-même invalide, le secret devenait illisible. Après : refus
   *avant* toute écriture.
5. **Isolation des tests.** Les tests utilisent le service
   `dz.healix.desktop.test` : ils ne peuvent ni lire ni effacer les
   secrets d'une installation de HealixDz Desktop.

Politique de déconnexion (inchangée, désormais couverte par un test) :
`clear_session` supprime `offline-grant` et `grant-public-key` ;
`installation-id`, `device-private-key` et `database-key-v1` sont
conservés.

Compatibilité : une version antérieure à ce correctif lit un manifest
du jeu A mais pas du jeu B (`b:<n>`) — un retour arrière après une
réécriture en jeu B n'est pas supporté (pas de downgrade).

## 5. Qualification sur machine réelle — à réaliser

Statuts : **NON TESTÉ** tant qu'aucune preuve n'est consignée ici.
Procédure détaillée : `docs/windows-release-checklist.md`.

| # | Contrôle | Statut |
| --- | --- | --- |
| 1 | SHA-256 de l'artefact CI = `SHA256SUMS.txt` | NON TESTÉ |
| 2 | Métadonnées Windows (produit, éditeur, version, x64, icône, menu Démarrer) | NON TESTÉ |
| 3 | Installation propre (machine sans Node/Rust/Build Tools) | NON TESTÉ |
| 4 | NSIS (installation, lancement, version, SHA de build) | NON TESTÉ sur machine réelle (smoke CI : succès) |
| 5 | MSI | NON TESTÉ sur machine réelle (build CI : succès) |
| 6 | WebView2 présent / absent (`downloadBootstrapper`) | NON TESTÉ |
| 7 | Premier login (API HTTPS de staging) → enregistrement appareil → grant → bootstrap | NON TESTÉ |
| 8 | Credential Manager : `installation-id`, `database-key-v1`, `device-private-key`, `offline-grant`, `grant-public-key` (service `dz.healix.desktop`) | NON TESTÉ |
| 9 | Aucun secret en clair dans `%APPDATA%` / `%LOCALAPPDATA%` | NON TESTÉ |
| 10 | SQLCipher : les 16 premiers octets ≠ `SQLite format 3` | NON TESTÉ |
| 11 | Secrets longs sur le vrai Credential Manager (court, limite, multi-fragments, Unicode, surécriture, suppression) | tests automatisés **réussis sur le poste de développement** (§3) ; à refaire sur la machine de qualification propre via l'application installée |
| 12 | Hors ligne : 1 consultation + 1 brouillon d'ordonnance (aucune validation officielle) | NON TESTÉ |
| 13 | Fermeture complète puis relance hors ligne | NON TESTÉ |
| 14 | **Redémarrage Windows réel**, puis ouverture hors ligne | NON TESTÉ |
| 15 | Reconnexion → synchronisation, outbox résolue, curseur avancé | NON TESTÉ |
| 16 | Aucun doublon côté serveur (1 consultation, 1 ordonnance) | NON TESTÉ |
| 17 | Device ID identique avant / après redémarrage / après synchronisation | NON TESTÉ |
| 18 | Logout (+ données non envoyées : aucune suppression silencieuse) puis relogin | NON TESTÉ |
| 19 | Mise à jour A → B : base, clé, identité RSA, grant, curseur, outbox, brouillons conservés | NON TESTÉ |
| 20 | Outbox non synchronisée traversant la mise à jour | NON TESTÉ |
| 21 | Updater : B détectée via `latest.json`, installation sur clic explicite | NON TESTÉ |
| 22 | Updater : paquet corrompu / signé par une autre clé → rejeté | NON TESTÉ |
| 23 | Désinstallation (données + Credential Manager conservés) puis réinstallation | NON TESTÉ |
| 24 | **Impression d'une ordonnance** (brouillon puis validée) : la boîte d'impression de Windows s'ouvre depuis la fenêtre de l'application (WebView2) | **NON TESTÉ** — la page imprimable est vérifiée (tests + rendu A4 + PDF dans `docs/release/captures/`), l'ouverture de la boîte depuis un iframe de WebView2 ne l'a pas été |
| 25 | Impression vers « Microsoft Print to PDF » : mise en page A4 identique à l'aperçu, marges, cachet/signature, pied de page | NON TESTÉ |
| 26 | Impression vers une imprimante réelle | NON TESTÉ |
| 27 | Si l'impression échoue : « Enregistrer la version imprimable » télécharge la même page (téléchargement depuis WebView2) | NON TESTÉ |
| 28 | Consultation hors ligne complète : constantes (bornes, IMC, valeurs anormales), diagnostics, enregistrement automatique, « Terminer » → « Rédiger l'ordonnance » | tests automatisés réussis (Vitest, parcours simulé) ; **NON TESTÉ** sur l'application installée |
| 29 | Consultation d'un rendez-vous : le rendez-vous passe à « Consultation faite », compteur d'opérations en attente +1, synchronisation au retour du réseau, **aucun doublon** côté serveur | NON TESTÉ (test d'intégration backend écrit, exécuté en CI uniquement) |
| 30 | Une consultation créée sur le web avec constantes et diagnostics, **modifiée seulement sur le motif** depuis le Desktop : constantes et diagnostics intacts côté serveur après synchronisation | NON TESTÉ sur machine réelle (règle vérifiée en Rust et par le contrat serveur) |
| 31 | Alerte d'allergie : enregistrement et impression bloqués tant que la confirmation et son motif manquent ; la confirmation est dans le journal local | tests automatisés réussis ; **NON TESTÉ** sur l'application installée |
| 32 | Identité du prescripteur et du cabinet : présente après une connexion en ligne, **effacée à la déconnexion**, absente avec un serveur ancien (bouton Imprimer grisé, avec la raison) | tests Rust réussis ; NON TESTÉ sur l'application installée |
| 33 | Le jeu de démonstration (`npm run seed:demo`) charge un cabinet complet et arrive sur le Desktop (rendez-vous du jour, ordonnance validée via le flux) | NON TESTÉ — le script compile et refuse la production, il n'a **pas été exécuté** sur une base |

Les versions A et B doivent être **cohérentes avec le versioning
réel** (aujourd'hui 0.1.0) : par exemple `0.1.0-beta.1` puis
`0.1.0-beta.2`, via `node scripts/set-desktop-version.mjs`.

## 6. Points à vérifier avant le premier tag `-beta.N`

- **Version de pré-release et MSI.** Le format MSI n'accepte qu'une
  version numérique ; un identifiant de pré-release non numérique
  (`beta.1`) est, à ma connaissance, refusé par le bundler Tauri pour la
  cible MSI. À confirmer par un `workflow_dispatch` sur une version
  `-beta.N` **avant** de créer le tag, et, si nécessaire, définir
  `bundle.windows.wix.version` (version MSI numérique) ou adopter un
  schéma de version numérique. Le run #3 n'a construit que `0.1.0`.
- **Clé updater de production** : générer une paire dédiée avant toute
  diffusion (la clé actuelle est une clé de test) — voir
  `docs/windows-release.md` §1 (rotation).
- **Authenticode** : voir §7.
- **Variable `DESKTOP_API_BASE_URL`** (HTTPS, ni HTTP ni `localhost`) et
  environment GitHub `production` (approbation manuelle recommandée) :
  à configurer par le propriétaire du dépôt.
- **Compatibilité serveur** : confirmer que le Desktop bêta dialogue
  avec la version du Backend déployée ; aucune négociation de version
  n'est ajoutée sans besoin avéré.

## 7. Authenticode

| Cas | État |
| --- | --- |
| Certificat de production (OV/EV) de confiance publique | **non disponible** à ce jour |
| Certificat de test (mécanique `signtool` / pipeline uniquement) | non utilisé à ce jour — si utilisé : **TEST CERTIFICATE, NOT PUBLICLY TRUSTED** |

Tant qu'un certificat de confiance publique n'est pas configuré
(`WINDOWS_CERTIFICATE_BASE64`, `WINDOWS_CERTIFICATE_PASSWORD` dans
l'environment `production`) :

> **INTERNAL BETA ONLY — Authenticode production certificate pending.**

Une bêta externe exige `Get-AuthenticodeSignature` = `Valid` sur les
fichiers **réellement téléchargés** depuis la GitHub Release.

## 8. Limitations connues

- Bêta : pas un dispositif médical certifié ; modules hors ligne
  limités (consultations, brouillons d'ordonnance, cache patients).
- Aucune validation de la machine propre, du redémarrage, de la
  mise à jour A → B ni de l'updater signé n'a encore été réalisée.
- Les runners GitHub ne redémarrent pas et ne sont pas des postes
  utilisateur propres.

## 9. Conditions avant bêta publique (bloquants)

1. Qualification sur machine réelle (§5) terminée, preuves consignées.
2. Certificat Authenticode de confiance publique + `Valid` sur les
   assets téléchargés.
3. Paire de clés updater de production générée, clé publique embarquée.
4. Environment `production` configuré (secrets, approbation manuelle) et
   `DESKTOP_API_BASE_URL` HTTPS.
5. Version `-beta.N` validée de bout en bout (MSI inclus, §6).
6. Release publiée en **pré-release** GitHub (jamais `releases/latest`).
