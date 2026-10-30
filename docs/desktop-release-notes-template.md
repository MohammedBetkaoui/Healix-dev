<!--
   Modèle des notes de release Desktop (§24) : remplir puis créer le tag
   annoté avec son contenu :

       git tag -a desktop-vX.Y.Z -F docs/release/desktop-vX.Y.Z.md

   Le workflow .github/workflows/desktop-release.yml prend le message du tag
   annoté comme notes officielles ; sans message, c'est ce template qui est
   publié.
-->

# HealixDz Desktop vX.Y.Z

- **Date** : AAAA-MM-JJ
- **Build** : `<sha court>`
- **Version Windows minimale testée** : Windows 11 x64 (voir Known issues
  pour Windows 10)

## Changes

- …

## Security

- …

## Offline / Sync

- …

## Base de données locale (migration)

- Aucune action attendue : la base SQLCipher de l'ordinateur s'ouvre avec les
  migrations locales embarquées, sans effacement ni re-création.
- Downgrade non supporté (voir docs/windows-release.md).

## Known issues

- …

## Installers

- `HealixDz-Desktop_X.Y.Z_x64-setup.exe` (NSIS, installation par utilisateur)
- `HealixDz-Desktop_X.Y.Z_x64_en-US.msi`
- `latest.json` + `*.sig` (canal de mise à jour HealixDz Desktop)
- `SHA256SUMS.txt` — vérifier : `certutil -hashfile <fichier> SHA256`
