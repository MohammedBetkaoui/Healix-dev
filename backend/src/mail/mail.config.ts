// Mail settings, read once at startup. Without SMTP the backend can still run
// in development: e-mails are then written to its logs. In production a
// missing SMTP setup is a startup error, never a silent drop.

type Env = Record<string, string | undefined>;

export type SmtpSettings = {
  auth: { pass: string; user: string } | null;
  host: string;
  port: number;
  secure: boolean;
};

export type MailConfig = {
  from: string;
  // Base URL of the frontend, without a trailing slash: e-mail links start
  // with it.
  publicUrl: string;
  smtp: SmtpSettings | null;
};

const DEV_FROM = 'HealixDz <no-reply@localhost>';
const DEV_PUBLIC_URL = 'http://localhost:3000';

export class MailConfigError extends Error {}

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function readPublicUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new MailConfigError(
      'APP_PUBLIC_URL doit être une URL absolue (http ou https).',
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new MailConfigError(
      'APP_PUBLIC_URL doit être une URL absolue (http ou https).',
    );
  }

  return url.toString().replace(/\/+$/, '');
}

function readSmtp(env: Env): SmtpSettings | null {
  const host = read(env, 'SMTP_HOST');

  if (!host) {
    return null;
  }

  const port = Number(read(env, 'SMTP_PORT') ?? '587');

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new MailConfigError('SMTP_PORT doit être un numéro de port.');
  }

  const user = read(env, 'SMTP_USER');
  const pass = env.SMTP_PASSWORD ?? '';

  if (user && !pass) {
    throw new MailConfigError(
      'SMTP_PASSWORD est obligatoire quand SMTP_USER est renseigné.',
    );
  }

  return {
    auth: user ? { pass, user } : null,
    host,
    port,
    secure: read(env, 'SMTP_SECURE') === 'true',
  };
}

export function readMailConfig(env: Env): MailConfig {
  const production = env.NODE_ENV === 'production';
  const smtp = readSmtp(env);
  const from = read(env, 'MAIL_FROM');
  const publicUrl = read(env, 'APP_PUBLIC_URL');

  if (production) {
    const missing = [
      smtp ? null : 'SMTP_HOST',
      from ? null : 'MAIL_FROM',
      publicUrl ? null : 'APP_PUBLIC_URL',
    ].filter(Boolean);

    if (missing.length > 0) {
      throw new MailConfigError(
        `Envoi d'e-mails non configuré en production : ${missing.join(', ')} manquant(s).`,
      );
    }
  }

  return {
    from: from ?? DEV_FROM,
    publicUrl: readPublicUrl(
      publicUrl ?? read(env, 'FRONTEND_URL') ?? DEV_PUBLIC_URL,
    ),
    smtp,
  };
}
