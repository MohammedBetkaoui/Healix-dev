import { type ConfigService } from '@nestjs/config';

// The four secrets that sign the tokens of the application (users and
// back-office admins). In development the code falls back on the values
// below, which are public: in production one of them would let anyone sign a
// session, so a missing, short or default secret is a startup error.
type Env = Record<string, string | undefined>;

export const JWT_SECRET_MIN_LENGTH = 32;

export const DEFAULT_JWT_SECRETS = {
  ADMIN_JWT_ACCESS_SECRET: 'change_me_admin_access_secret',
  ADMIN_JWT_REFRESH_SECRET: 'change_me_admin_refresh_secret',
  JWT_ACCESS_SECRET: 'healixdz_access_secret_change_me',
  JWT_REFRESH_SECRET: 'healixdz_refresh_secret_change_me',
} as const;

export type JwtSecretName = keyof typeof DEFAULT_JWT_SECRETS;

export class JwtSecretError extends Error {}

const KNOWN_DEFAULTS: readonly string[] = Object.values(DEFAULT_JWT_SECRETS);

// The secret of this variable: its value, or the development default when
// there is none. In production (NODE_ENV=production) it throws instead of
// returning a secret that is missing, shorter than JWT_SECRET_MIN_LENGTH, or
// one of the defaults. One function for the four variables: every service
// and module that signs or verifies a token goes through it.
export function readJwtSecret(name: JwtSecretName, env: Env): string {
  // Returned as it is: the passport strategies read the variable untouched.
  const value = env[name];
  const production = env.NODE_ENV === 'production';

  if (value === undefined || value.trim() === '') {
    if (!production) {
      return DEFAULT_JWT_SECRETS[name];
    }

    throw new JwtSecretError(
      `${name} manque : en production, définissez un secret aléatoire d'au moins ${JWT_SECRET_MIN_LENGTH} caractères (par exemple : openssl rand -base64 48).`,
    );
  }

  if (!production) {
    return value;
  }

  if (value.length < JWT_SECRET_MIN_LENGTH) {
    throw new JwtSecretError(
      `${name} est trop court (${value.length} caractères) : en production, il en faut au moins ${JWT_SECRET_MIN_LENGTH}.`,
    );
  }

  if (KNOWN_DEFAULTS.includes(value.trim())) {
    throw new JwtSecretError(
      `${name} vaut la valeur par défaut du code, qui est publique : en production, définissez un secret aléatoire.`,
    );
  }

  return value;
}

export function jwtSecret(
  configService: ConfigService,
  name: JwtSecretName,
): string {
  return readJwtSecret(name, {
    NODE_ENV: configService.get<string>('NODE_ENV'),
    [name]: configService.get<string>(name),
  });
}
