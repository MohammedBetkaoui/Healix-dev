import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { PrismaClient } from '@prisma/client';

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '::1', '[::1]']);

type PrismaMariaDbConnection = {
  socketTimeoutMs: number;
  target: string;
  url: string;
};

function getPositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }

  return Math.trunc(numericValue);
}

function setDefaultSearchParam(
  url: URL,
  key: string,
  value: string | undefined,
  fallback: number,
): void {
  if (url.searchParams.has(key)) {
    return;
  }

  url.searchParams.set(key, String(getPositiveInteger(value, fallback)));
}

function resolvePrismaMariaDbUrl(
  databaseUrl: string,
  configService: ConfigService,
): PrismaMariaDbConnection {
  let url: URL;

  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(
      'DATABASE_URL must be a valid MySQL/MariaDB connection URL.',
    );
  }

  if (!['mysql:', 'mariadb:'].includes(url.protocol)) {
    throw new Error(
      'DATABASE_URL must use the mysql:// or mariadb:// protocol.',
    );
  }

  url.protocol = 'mariadb:';

  if (LOCAL_DATABASE_HOSTS.has(url.hostname.toLowerCase())) {
    url.hostname = '127.0.0.1';
  }

  setDefaultSearchParam(
    url,
    'connectTimeout',
    configService.get<string>('DATABASE_CONNECT_TIMEOUT_MS'),
    10_000,
  );
  setDefaultSearchParam(
    url,
    'acquireTimeout',
    configService.get<string>('DATABASE_ACQUIRE_TIMEOUT_MS'),
    30_000,
  );
  setDefaultSearchParam(
    url,
    'socketTimeout',
    configService.get<string>('DATABASE_SOCKET_TIMEOUT_MS'),
    10_000,
  );
  setDefaultSearchParam(
    url,
    'connectionLimit',
    configService.get<string>('DATABASE_POOL_LIMIT'),
    10,
  );
  setDefaultSearchParam(
    url,
    'minimumIdle',
    configService.get<string>('DATABASE_POOL_MIN_IDLE'),
    1,
  );
  setDefaultSearchParam(
    url,
    'idleTimeout',
    configService.get<string>('DATABASE_POOL_IDLE_TIMEOUT_SECONDS'),
    60,
  );

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const port = url.port || '3306';
  const socketTimeoutMs = getPositiveInteger(
    url.searchParams.get('socketTimeout') ?? undefined,
    10_000,
  );

  return {
    socketTimeoutMs,
    target: `${url.hostname}:${port}/${database || '<database>'}`,
    url: url.toString(),
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly databaseTarget: string;
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    const databaseUrl = configService.get<string>('DATABASE_URL');

    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required to initialize Prisma.');
    }

    const connection = resolvePrismaMariaDbUrl(databaseUrl, configService);
    const adapter = new PrismaMariaDb(connection.url);
    const transactionMaxWaitMs = getPositiveInteger(
      configService.get<string>('DATABASE_TRANSACTION_MAX_WAIT_MS'),
      10_000,
    );
    const configuredTransactionTimeoutMs = getPositiveInteger(
      configService.get<string>('DATABASE_TRANSACTION_TIMEOUT_MS'),
      15_000,
    );
    // The driver must report a dead socket before Prisma's transaction timer
    // attempts a rollback. Otherwise an adapter rollback can reject outside the
    // request promise and terminate Node.js.
    const transactionTimeoutMs = Math.max(
      configuredTransactionTimeoutMs,
      connection.socketTimeoutMs + 5_000,
    );

    super({
      adapter,
      transactionOptions: {
        maxWait: transactionMaxWaitMs,
        timeout: transactionTimeoutMs,
      },
    });

    this.databaseTarget = connection.target;
  }

  async onModuleInit(): Promise<void> {
    this.logger.log(`Prisma configured for MariaDB at ${this.databaseTarget}`);

    if (process.env.DATABASE_VERIFY_ON_STARTUP !== 'true') {
      return;
    }

    await this.verifyDatabaseConnection();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  private async verifyDatabaseConnection(): Promise<void> {
    const retryCount = getPositiveInteger(
      process.env.DATABASE_CONNECT_RETRIES,
      5,
    );
    const retryDelay = getPositiveInteger(
      process.env.DATABASE_CONNECT_RETRY_DELAY_MS,
      1_500,
    );

    for (let attempt = 1; attempt <= retryCount; attempt += 1) {
      try {
        await this.$connect();
        await this.$queryRaw`SELECT 1`;
        this.logger.log(`Connected to MariaDB at ${this.databaseTarget}`);
        return;
      } catch (error) {
        await this.$disconnect().catch(() => undefined);

        if (attempt === retryCount) {
          this.logger.error(
            `Unable to connect to MariaDB at ${this.databaseTarget} after ${retryCount} attempt(s): ${getErrorMessage(
              error,
            )}`,
            error instanceof Error ? error.stack : undefined,
          );
          throw error;
        }

        this.logger.warn(
          `MariaDB connection attempt ${attempt}/${retryCount} failed for ${this.databaseTarget}: ${getErrorMessage(
            error,
          )}. Retrying in ${retryDelay}ms.`,
        );
        await delay(retryDelay);
      }
    }
  }
}
