import { type ConfigService } from '@nestjs/config';

import {
  DEFAULT_JWT_SECRETS,
  JWT_SECRET_MIN_LENGTH,
  JwtSecretError,
  jwtSecret,
  type JwtSecretName,
  readJwtSecret,
} from './jwt-secrets';

const NAMES = Object.keys(DEFAULT_JWT_SECRETS) as JwtSecretName[];
const strong = (name: string) => `${name.toLowerCase()}-${'k7Qz'.repeat(8)}`;

describe('readJwtSecret in development', () => {
  it('falls back on the default of each variable when it is missing or blank', () => {
    for (const name of NAMES) {
      expect(readJwtSecret(name, {})).toBe(DEFAULT_JWT_SECRETS[name]);
      expect(readJwtSecret(name, { [name]: '   ' })).toBe(
        DEFAULT_JWT_SECRETS[name],
      );
    }
  });

  it('returns the configured secret as it is, whatever its length', () => {
    expect(
      readJwtSecret('JWT_ACCESS_SECRET', { JWT_ACCESS_SECRET: 'dev' }),
    ).toBe('dev');
    expect(
      readJwtSecret('JWT_ACCESS_SECRET', {
        JWT_ACCESS_SECRET: DEFAULT_JWT_SECRETS.JWT_ACCESS_SECRET,
        NODE_ENV: 'development',
      }),
    ).toBe(DEFAULT_JWT_SECRETS.JWT_ACCESS_SECRET);
  });
});

describe('readJwtSecret in production', () => {
  const production = { NODE_ENV: 'production' };

  it.each(NAMES)(
    'refuses %s when it is missing or blank, and says which',
    (name) => {
      expect(() => readJwtSecret(name, production)).toThrow(JwtSecretError);
      expect(() => readJwtSecret(name, production)).toThrow(
        new RegExp(`^${name} manque`),
      );
      expect(() =>
        readJwtSecret(name, { ...production, [name]: '  ' }),
      ).toThrow(/manque/);
    },
  );

  it.each(NAMES)('refuses %s when it is shorter than the minimum', (name) => {
    const short = 'a'.repeat(JWT_SECRET_MIN_LENGTH - 1);

    expect(() => readJwtSecret(name, { ...production, [name]: short })).toThrow(
      /trop court/,
    );
    expect(
      readJwtSecret(name, {
        ...production,
        [name]: 'a'.repeat(JWT_SECRET_MIN_LENGTH),
      }),
    ).toBe('a'.repeat(JWT_SECRET_MIN_LENGTH));
  });

  it.each(NAMES)(
    'refuses the default value of %s, even long enough',
    (name) => {
      expect(() =>
        readJwtSecret(name, {
          ...production,
          [name]: DEFAULT_JWT_SECRETS[name],
        }),
      ).toThrow(JwtSecretError);
    },
  );

  it('refuses the default of another variable, and a default with spaces around', () => {
    const verdict = (value: string) => () =>
      readJwtSecret('JWT_REFRESH_SECRET', {
        ...production,
        JWT_REFRESH_SECRET: value,
      });

    expect(verdict(DEFAULT_JWT_SECRETS.JWT_ACCESS_SECRET)).toThrow(
      /valeur par défaut/,
    );
    expect(verdict(` ${DEFAULT_JWT_SECRETS.JWT_ACCESS_SECRET} `)).toThrow(
      /valeur par défaut/,
    );
  });

  it('returns a strong secret untouched', () => {
    for (const name of NAMES) {
      expect(readJwtSecret(name, { ...production, [name]: strong(name) })).toBe(
        strong(name),
      );
    }
  });
});

describe('jwtSecret', () => {
  const config = (values: Record<string, string>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  it('reads the variable and NODE_ENV from the configuration', () => {
    expect(jwtSecret(config({}), 'ADMIN_JWT_ACCESS_SECRET')).toBe(
      DEFAULT_JWT_SECRETS.ADMIN_JWT_ACCESS_SECRET,
    );
    expect(() =>
      jwtSecret(config({ NODE_ENV: 'production' }), 'ADMIN_JWT_ACCESS_SECRET'),
    ).toThrow(/ADMIN_JWT_ACCESS_SECRET manque/);
    expect(
      jwtSecret(
        config({
          ADMIN_JWT_ACCESS_SECRET: strong('admin'),
          NODE_ENV: 'production',
        }),
        'ADMIN_JWT_ACCESS_SECRET',
      ),
    ).toBe(strong('admin'));
  });
});
