import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

import { type MailConfig, readMailConfig } from './mail.config';

export type MailMessage = {
  html: string;
  subject: string;
  text: string;
  to: string;
};

const MAIL_ENV_KEYS = [
  'APP_PUBLIC_URL',
  'FRONTEND_URL',
  'MAIL_FROM',
  'NODE_ENV',
  'SMTP_HOST',
  'SMTP_PASSWORD',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
] as const;

const SMTP_TIMEOUT_MS = 10_000;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly config: MailConfig;
  private readonly transporter: Transporter | null;

  // readMailConfig throws when production lacks SMTP: the backend then
  // refuses to start.
  constructor(configService: ConfigService) {
    this.config = readMailConfig(
      Object.fromEntries(
        MAIL_ENV_KEYS.map((key) => [key, configService.get<string>(key)]),
      ),
    );

    const { smtp } = this.config;
    this.transporter = smtp
      ? createTransport({
          auth: smtp.auth ?? undefined,
          connectionTimeout: SMTP_TIMEOUT_MS,
          greetingTimeout: SMTP_TIMEOUT_MS,
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          socketTimeout: SMTP_TIMEOUT_MS,
        })
      : null;

    if (!this.transporter) {
      this.logger.warn(
        'SMTP non configuré : les e-mails ne seront PAS envoyés, ils seront écrits dans ces logs (développement uniquement).',
      );
    }
  }

  get publicUrl(): string {
    return this.config.publicUrl;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `[DÉVELOPPEMENT] SMTP non configuré : e-mail NON envoyé à ${message.to}. Contenu ci-dessous.`,
      );
      this.logger.log(
        `À : ${message.to}\nObjet : ${message.subject}\n\n${message.text}`,
      );
      return;
    }

    await this.transporter.sendMail({
      // Messages are built from our own templates: never let content pull a
      // local file or a remote URL into the e-mail.
      disableFileAccess: true,
      disableUrlAccess: true,
      from: this.config.from,
      html: message.html,
      subject: message.subject,
      text: message.text,
      to: message.to,
    });
  }
}
