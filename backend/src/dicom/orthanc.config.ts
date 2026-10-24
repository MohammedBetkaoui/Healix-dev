import { type ConfigService } from '@nestjs/config';

// How the backend reaches Orthanc, the DICOM store (internal network, HTTP
// authentication). In development the code falls back on the values below,
// which are public; in production a missing, short or default password is a
// startup error, like the JWT secrets (common/security/jwt-secrets.ts).
type Env = Record<string, string | undefined>;

export const ORTHANC_PASSWORD_MIN_LENGTH = 24;

export const DEFAULT_ORTHANC_SETTINGS = {
  url: 'http://localhost:8042',
  username: 'orthanc',
  password: 'orthanc',
} as const;

// The pair is written in a JSON object by docker-compose
// (ORTHANC__REGISTERED_USERS): letters and digits only.
const CREDENTIAL_PATTERN = /^[A-Za-z0-9]+$/;

export const DEFAULT_ORTHANC_TIMEOUT_MS = 30_000;
export const DEFAULT_ORTHANC_UPLOAD_TIMEOUT_MS = 120_000;
// Orthanc may take a while to build the metadata of a large series, the first
// time it is asked: the wait for the first byte of a DICOMweb answer.
export const DEFAULT_ORTHANC_STREAM_TIMEOUT_MS = 120_000;

export type OrthancSettings = {
  password: string;
  /** Wait for the first byte of a streamed DICOMweb answer. */
  streamTimeoutMs: number;
  /** Timeout of a request that sends a file (an instance to store). */
  uploadTimeoutMs: number;
  /** Timeout of the other requests. */
  timeoutMs: number;
  /** Base URL, without a trailing slash. */
  url: string;
  username: string;
};

export class OrthancConfigError extends Error {}

export const ORTHANC_SETTINGS = Symbol('ORTHANC_SETTINGS');

function readPositiveInteger(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new OrthancConfigError(
      `${name} doit être un nombre entier de millisecondes, supérieur à 0.`,
    );
  }
  return value;
}

function readUrl(env: Env, production: boolean): string {
  const raw = env.ORTHANC_URL?.trim();
  if (!raw) {
    if (production) {
      throw new OrthancConfigError(
        "ORTHANC_URL manque : en production, indiquez l'adresse d'Orthanc (http://orthanc:8042).",
      );
    }
    return DEFAULT_ORTHANC_SETTINGS.url;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new OrthancConfigError("ORTHANC_URL n'est pas une adresse valide.");
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new OrthancConfigError('ORTHANC_URL doit commencer par http(s)://.');
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

// The settings of the environment. In production it throws instead of
// returning a password that is missing, shorter than
// ORTHANC_PASSWORD_MIN_LENGTH, not made of letters and digits, or the default.
export function readOrthancSettings(env: Env): OrthancSettings {
  const production = env.NODE_ENV === 'production';
  const username = env.ORTHANC_USERNAME?.trim();
  const password = env.ORTHANC_PASSWORD;

  if (production) {
    if (!username) {
      throw new OrthancConfigError(
        "ORTHANC_USERNAME manque : en production, indiquez le compte d'Orthanc.",
      );
    }
    if (!CREDENTIAL_PATTERN.test(username)) {
      throw new OrthancConfigError(
        'ORTHANC_USERNAME ne doit contenir que des lettres et des chiffres.',
      );
    }
    if (password === undefined || password.trim() === '') {
      throw new OrthancConfigError(
        `ORTHANC_PASSWORD manque : en production, définissez un mot de passe aléatoire d'au moins ${ORTHANC_PASSWORD_MIN_LENGTH} caractères (par exemple : openssl rand -hex 24).`,
      );
    }
    if (password.length < ORTHANC_PASSWORD_MIN_LENGTH) {
      throw new OrthancConfigError(
        `ORTHANC_PASSWORD est trop court (${password.length} caractères) : en production, il en faut au moins ${ORTHANC_PASSWORD_MIN_LENGTH}.`,
      );
    }
    if (!CREDENTIAL_PATTERN.test(password)) {
      throw new OrthancConfigError(
        'ORTHANC_PASSWORD ne doit contenir que des lettres et des chiffres.',
      );
    }
    if (password === DEFAULT_ORTHANC_SETTINGS.password) {
      throw new OrthancConfigError(
        'ORTHANC_PASSWORD vaut la valeur par défaut du code, qui est publique : en production, définissez un mot de passe aléatoire.',
      );
    }
  }

  return {
    password: password?.trim() ? password : DEFAULT_ORTHANC_SETTINGS.password,
    streamTimeoutMs: readPositiveInteger(
      env,
      'ORTHANC_STREAM_TIMEOUT_MS',
      DEFAULT_ORTHANC_STREAM_TIMEOUT_MS,
    ),
    timeoutMs: readPositiveInteger(
      env,
      'ORTHANC_TIMEOUT_MS',
      DEFAULT_ORTHANC_TIMEOUT_MS,
    ),
    uploadTimeoutMs: readPositiveInteger(
      env,
      'ORTHANC_UPLOAD_TIMEOUT_MS',
      DEFAULT_ORTHANC_UPLOAD_TIMEOUT_MS,
    ),
    url: readUrl(env, production),
    username: username || DEFAULT_ORTHANC_SETTINGS.username,
  };
}

export function orthancSettings(configService: ConfigService): OrthancSettings {
  const names = [
    'NODE_ENV',
    'ORTHANC_PASSWORD',
    'ORTHANC_STREAM_TIMEOUT_MS',
    'ORTHANC_TIMEOUT_MS',
    'ORTHANC_UPLOAD_TIMEOUT_MS',
    'ORTHANC_URL',
    'ORTHANC_USERNAME',
  ];
  return readOrthancSettings(
    Object.fromEntries(
      names.map((name) => [name, configService.get<string>(name)]),
    ),
  );
}
