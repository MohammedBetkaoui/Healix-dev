import {
  DEFAULT_ORTHANC_SETTINGS,
  OrthancConfigError,
  ORTHANC_PASSWORD_MIN_LENGTH,
  readOrthancSettings,
} from './orthanc.config';

const GOOD_PASSWORD = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';

const production = (overrides: Record<string, string | undefined> = {}) => ({
  NODE_ENV: 'production',
  ORTHANC_PASSWORD: GOOD_PASSWORD,
  ORTHANC_URL: 'http://orthanc:8042',
  ORTHANC_USERNAME: 'healixdz',
  ...overrides,
});

describe('the Orthanc settings', () => {
  it('reads the address and the account of the environment', () => {
    expect(readOrthancSettings(production())).toMatchObject({
      password: GOOD_PASSWORD,
      url: 'http://orthanc:8042',
      username: 'healixdz',
    });
  });

  it('drops the trailing slash of the address', () => {
    expect(
      readOrthancSettings(production({ ORTHANC_URL: 'http://orthanc:8042/' }))
        .url,
    ).toBe('http://orthanc:8042');
  });

  it('falls back on the public defaults in development', () => {
    expect(readOrthancSettings({ NODE_ENV: 'development' })).toMatchObject(
      DEFAULT_ORTHANC_SETTINGS,
    );
    expect(readOrthancSettings({})).toMatchObject(DEFAULT_ORTHANC_SETTINGS);
  });

  it('accepts a short password outside production', () => {
    expect(
      readOrthancSettings({ NODE_ENV: 'development', ORTHANC_PASSWORD: 'x' })
        .password,
    ).toBe('x');
  });

  it.each([
    ['a missing password', { ORTHANC_PASSWORD: undefined }],
    ['an empty password', { ORTHANC_PASSWORD: '  ' }],
    [
      'a password one character short',
      { ORTHANC_PASSWORD: 'a'.repeat(ORTHANC_PASSWORD_MIN_LENGTH - 1) },
    ],
    ['the default password', { ORTHANC_PASSWORD: 'orthanc' }],
    [
      'a password with a character that breaks the JSON of the configuration',
      { ORTHANC_PASSWORD: `${'a'.repeat(30)}"` },
    ],
    ['a missing user name', { ORTHANC_USERNAME: undefined }],
    ['a user name with a quote', { ORTHANC_USERNAME: 'a"b' }],
    ['a missing address', { ORTHANC_URL: undefined }],
    ['an address that is not one', { ORTHANC_URL: 'orthanc' }],
    ['an address that is not http', { ORTHANC_URL: 'ftp://orthanc' }],
  ])('refuses to start in production with %s', (_label, overrides) => {
    expect(() => readOrthancSettings(production(overrides))).toThrow(
      OrthancConfigError,
    );
  });

  it('accepts a password of exactly 24 characters in production', () => {
    expect(() =>
      readOrthancSettings(
        production({
          ORTHANC_PASSWORD: 'a'.repeat(ORTHANC_PASSWORD_MIN_LENGTH),
        }),
      ),
    ).not.toThrow();
  });

  it('reads the timeouts, and refuses a value that is not a positive number of milliseconds', () => {
    expect(
      readOrthancSettings(
        production({
          ORTHANC_TIMEOUT_MS: '5000',
          ORTHANC_UPLOAD_TIMEOUT_MS: '9000',
        }),
      ),
    ).toMatchObject({ timeoutMs: 5000, uploadTimeoutMs: 9000 });
    expect(() =>
      readOrthancSettings(production({ ORTHANC_TIMEOUT_MS: '-1' })),
    ).toThrow(OrthancConfigError);
    expect(() =>
      readOrthancSettings(production({ ORTHANC_TIMEOUT_MS: 'soon' })),
    ).toThrow(OrthancConfigError);
  });
});
