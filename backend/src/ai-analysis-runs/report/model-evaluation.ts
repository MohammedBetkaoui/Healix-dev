// The measured performance of a model described by a card (cardiology ECG,
// cardiac MRI segmentation), for the weights of an analysis only: first the
// service's own evaluation (its *-latest.json report), else the training
// notebook's test figures from the model card next to the weights, marked as
// such. Neither describes other weights: then no figure.

import { Logger } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export type EvaluationPaths = { evaluation: string; modelCard: string };

/** What a found evaluation says of itself. */
export type EvaluationIdentity = {
  /** service: measured on the service itself; notebook: the training notebook's, from the model card. */
  source: 'service' | 'notebook';
  /** The report file (service), or the model card's file. */
  file: string;
  /** When the service's evaluation ran; null for the notebook's figures. */
  generatedAt: string | null;
  weightsSha256: string;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
export const numberOrNull = (value: unknown): number | null =>
  isNumber(value) ? value : null;
export const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null; // Missing or unreadable: describes nothing.
  }
}

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/**
 * The service's evaluation of these weights, else the notebook's; null when
 * neither describes them.
 */
export async function findEvaluation<T extends EvaluationIdentity>(
  paths: EvaluationPaths,
  weightsSha256: string | null,
  parseService: (json: unknown) => T | null,
  parseCard: (json: unknown, file: string) => T | null,
): Promise<T | null> {
  if (!weightsSha256) return null;
  const service = parseService(await readJson(paths.evaluation));
  if (service?.weightsSha256 === weightsSha256) return service;
  const card = parseCard(
    await readJson(paths.modelCard),
    fileName(paths.modelCard),
  );
  return card?.weightsSha256 === weightsSha256 ? card : null;
}

/** Paths from the environment, relative to the backend folder. */
export function evaluationPaths(
  configService: ConfigService,
  evaluation: [variable: string, fallback: string],
  modelCard: [variable: string, fallback: string],
): EvaluationPaths {
  const path = ([variable, fallback]: [string, string]) =>
    resolve(process.cwd(), configService.get<string>(variable) ?? fallback);
  return { evaluation: path(evaluation), modelCard: path(modelCard) };
}

/** A finder per model: its paths and its two parsers. */
export class ModelEvaluationFinder<T extends EvaluationIdentity> {
  private readonly logger: Logger;

  constructor(
    name: string,
    private readonly paths: EvaluationPaths,
    private readonly parseService: (json: unknown) => T | null,
    private readonly parseCard: (json: unknown, file: string) => T | null,
  ) {
    this.logger = new Logger(name);
  }

  async find(weightsSha256: string | null): Promise<T | null> {
    const evaluation = await findEvaluation(
      this.paths,
      weightsSha256,
      this.parseService,
      this.parseCard,
    );
    if (!evaluation) {
      this.logger.warn(
        `No evaluation of weights ${weightsSha256 ?? '(none)'} (${this.paths.evaluation}, ${this.paths.modelCard}).`,
      );
    }
    return evaluation;
  }
}
