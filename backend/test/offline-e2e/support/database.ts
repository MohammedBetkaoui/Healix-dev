import { createConnection } from 'mariadb';

import { readDatabaseUrl } from './config';

// The dedicated database holds nothing worth keeping: before a run (leftovers
// of an aborted one) and after it, every table but the migration history is
// emptied. readDatabaseUrl() refuses any database that is not called
// healixdz_offline_e2e*, so this can never reach a development or production
// database.
export async function wipeOfflineE2EData(
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const url = new URL(readDatabaseUrl(env));
  const connection = await createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    allowPublicKeyRetrieval: true,
  });
  try {
    const tables: { TABLE_NAME: string }[] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
         AND TABLE_NAME <> '_prisma_migrations'`,
    );
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { TABLE_NAME } of tables) {
      await connection.query(`TRUNCATE TABLE \`${TABLE_NAME}\``);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await connection.end();
  }
}
