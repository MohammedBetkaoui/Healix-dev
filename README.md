# HealixDz

[![CI](https://github.com/MohammedBetkaoui/Healix-dev/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MohammedBetkaoui/Healix-dev/actions/workflows/ci.yml)

Plateforme clinique pour établissements de santé et médecins en Algérie, avec
une aide à la décision par IA en imagerie cérébrale, en histopathologie et en
cardiologie (ECG 12 dérivations). Les modèles ne sont pas certifiés comme
dispositifs médicaux.

| Composant | Dossier | Technologie |
| --- | --- | --- |
| Base de données | — | MySQL 8 (MariaDB en développement local) |
| API | [`backend/`](backend/) | NestJS, Prisma, Playwright/Chromium (comptes rendus PDF) |
| Interface | [`frontend/`](frontend/) | Next.js |
| Service d'inférence | [`ai-service/`](ai-service/README.md) | FastAPI, PyTorch (CPU) |
| Proxy inverse | [`caddy/`](caddy/) | Caddy (HTTPS, Let's Encrypt) |

- **Intégration continue** : [`.github/workflows/ci.yml`](.github/workflows/ci.yml),
  sur chaque pull request et sur `main` (build et tests des trois composants,
  concordance du schéma Prisma et des migrations).
- **Déploiement Docker** : [`DEPLOIEMENT.md`](DEPLOIEMENT.md).
- Les poids des modèles (environ 1 Go) ne sont jamais dans le dépôt : voir
  [`ai-service/README.md`](ai-service/README.md).
- Les notebooks d'entraînement des modèles de pathologie sont dans
  [`notebooks/`](notebooks/) : `breakhis-classification-efficientnetb0.ipynb`
  (BreakHis) et `pannuke-segmentation.ipynb` (PanNuke).
- **Cardiologie IA (ECG 12 dérivations)** : un signal CSV/TXT ou un
  enregistrement WFDB zippé est versé au dossier comme document « Signal
  ECG » ; l'analyse donne la probabilité de 5 superclasses PTB-XL (NORM, MI,
  STTC, CD, HYP), chacune comparée à son seuil ; le médecin valide, corrige
  (plusieurs classes, « ECG normal » exclusif) ou rejette, puis édite le
  compte rendu PDF avec la dérivation II sur papier ECG. Performances
  affichées : celles du notebook d'entraînement (carte du modèle), tant que
  `ai-service/scripts/evaluate_cardio.py` n'a pas été lancé sur PTB-XL. Le
  modèle MIT-BIH et les ECG papier, PDF, photo ou DICOM ne sont pas pris en
  charge.
- Les pages Laboratoire et Dossiers médicaux tournent sur des données
  fictives : un build de production ne les montre qu'avec
  `NEXT_PUBLIC_ENABLE_DEMO_MODULES=true` (`ENABLE_DEMO_MODULES` en Docker,
  voir [`.env.docker.example`](.env.docker.example)).
