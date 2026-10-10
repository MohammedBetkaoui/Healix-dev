# HealixDz

[![CI](https://github.com/MohammedBetkaoui/Healix-dev/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MohammedBetkaoui/Healix-dev/actions/workflows/ci.yml)

Plateforme clinique pour établissements de santé et médecins en Algérie, avec
une aide à la décision par IA en imagerie cérébrale. Les modèles ne sont pas
certifiés comme dispositifs médicaux.

| Composant | Dossier | Technologie |
| --- | --- | --- |
| Base de données | — | MySQL 8 (MariaDB en développement local) |
| API | [`backend/`](backend/) | NestJS, Prisma, Playwright/Chromium (comptes rendus PDF) |
| Interface | [`frontend/`](frontend/) | Next.js |
| Service d'inférence | [`ai-service/`](ai-service/README.md) | FastAPI, PyTorch (CPU) |

- **Intégration continue** : [`.github/workflows/ci.yml`](.github/workflows/ci.yml),
  sur chaque pull request et sur `main` (build et tests des trois composants,
  concordance du schéma Prisma et des migrations).
- **Déploiement Docker** : [`DEPLOIEMENT.md`](DEPLOIEMENT.md).
- Les poids des modèles (environ 1 Go) ne sont jamais dans le dépôt : voir
  [`ai-service/README.md`](ai-service/README.md).
