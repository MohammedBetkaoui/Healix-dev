<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

### AI analysis chains

`POST /api/patients/:id/ai-analysis-runs` starts one of three independent
chains (`pipeline`), never run one after the other:

| `pipeline` | Service endpoint | `magnification` |
| --- | --- | --- |
| `brain` | `/analyze/brain` | refused (400 `AI_MAGNIFICATION_UNEXPECTED`) |
| `pathology-breast` | `/analyze/pathology/breast-classification` (BreakHis) | required: 40, 100, 200 or 400 (400 `AI_MAGNIFICATION_REQUIRED`) |
| `pathology-nuclei` | `/analyze/pathology/nuclei-segmentation` (PanNuke) | required, 40 only: a 40x H&E image (400 `AI_MAGNIFICATION_NOT_SUPPORTED`) |

Every answer of the service is checked before anything is stored; any
inconsistency is `502 AI_SERVICE_ERROR` (run `FAILED`, nothing stored):

- **breast**: model id and SHA-256, a score in [0, 1], the threshold exactly
  0.13, 4 view scores whose mean is the score (to 1e-6), the decision the
  threshold gives, the magnification sent. Stored in `malignancyScore`,
  `decisionThreshold`, `ttaScores`, `modelDecision` (`benign` | `malignant`)
  and `magnification`, **never in `predictions`**: the score is not a
  probability, and the brain rules (uncertainty under 0.90, agreement matrix)
  read that field.
- **nuclei**: model id and SHA-256, both images PNG, a size, the background
  share in [0, 1], the five nucleus types (all null without any nucleus, or
  shares adding up to 1 to 1e-3), a tile count consistent with `tiled`. The
  label map is stored as the mask (`maskPath`), the colour overlay next to it
  (`ai-masks/<runId>-overlay.png`, `overlayPath`); `maskAreaRatio` is
  1 - background, `maskAreaPx` that share of the image. No nucleus count.

The response adds `modelLabel` (the brain's top class, the BreakHis result,
`null` for the nuclei map), `magnification`, `malignancyScore`,
`decisionThreshold`, `ttaScores`, `modelDecision`, `nucleiFractions`,
`tileCount` and `hasOverlay`; the stored paths stay on the server.
`GET /api/patients/:id/ai-analysis-runs/:runId/overlay` serves the overlay
(same headers as `/mask`, 404 without one).

An image the service refuses (`invalid_image`, a side under 256 px or over its
maximum for the nuclei segmentation, too large) makes the run
`REJECTED_INPUT` and answers `422 AI_INPUT_REJECTED` with the `reason`. The
audit log records the chain and the magnification, never a score.

The physician's decision (`POST .../:runId/decision`, final) depends on the
chain:

- `brain`: validate the top class, or correct it to another brain class or
  `other`;
- `pathology-breast`: validate the result, or correct it to the other one or
  `other`;
- `pathology-nuclei`: validate the map (reviewed and accepted:
  `decisionLabel` stays null) or reject it; a correction answers
  `400 AI_CORRECTION_NOT_APPLICABLE`.

A label of another chain answers `400 AI_CORRECTED_LABEL_INVALID`. A brain or
breast run without a result answers `409 AI_RUN_NOT_DECIDABLE`. The audit
log's `agreesWithModel` is null for a rejection and for a nuclei map.

Follow-up and dashboard: `GET /api/ai-analysis-runs` and
`GET /api/ai-analysis-runs/summary` take an optional `pipeline` filter, and
every listed run carries `pipeline` and `modelLabel`. The summary's agreement
figures (rate, model x physician matrix, split at the 0.90 uncertainty
threshold) and the dashboard's uncertain share read the brain classifier's
probabilities: brain runs only. The pathology runs count in the statuses,
decisions and pending runs; the dashboard's recent analyses name their chain.

### AI analysis reports (PDF)

`GET /api/patients/:id/ai-analysis-runs/:runId/report` renders the report of
a validated or corrected analysis to PDF with Chromium, through Playwright.
Install Chromium once per machine (and in every deployment image):

```bash
$ npx playwright install chromium
```

Without it, a report request answers `500 AI_REPORT_RENDER_FAILED` and nothing
is stored; the tests simulate the renderer, and the integration test
(`ai-report-renderer.integration.spec.ts`) is skipped. Chromium is launched on
the first report, reused, and closed when the application stops. The page
loads nothing from the network: the Inter font (SIL OFL 1.1, in
`assets/fonts/inter/`) and the images are embedded.

The report quotes the measured performance from the evaluation report of
`ai-service/scripts/evaluate_brain.py`:

| Variable | Default |
| --- | --- |
| `AI_EVALUATION_REPORT_PATH` | `../ai-service/evaluation/brain-latest.json` (from the backend folder) |

When it is missing, or describes other classifier weights than those of the
analysis, the report prints "Performances non mesurées pour cette version des
modèles" and no figure.

A report is generated on the first request, numbered `CR-IA-<year>-<NNNNNN>`
(sequential within the year), stored under
`uploads/patients/<patientId>/ai-reports/` with its SHA-256, then always served
as stored: it is never regenerated.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
