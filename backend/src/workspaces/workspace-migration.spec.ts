import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('workspace migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma',
      'migrations',
      '20261001120000_add_workspace_memberships',
      'migration.sql',
    ),
    'utf8',
  );

  it('adds the workspace boundary without removing legacy ownership', () => {
    expect(sql).toContain(
      'ALTER TABLE `patients` ADD COLUMN `workspace_id` VARCHAR(191) NULL',
    );
    expect(sql).not.toMatch(
      /DROP\s+(COLUMN\s+)?`?(establishment_id|doctor_profile_id)`?/i,
    );
  });

  it('backfills both workspace types and their owner memberships', () => {
    expect(sql).toContain("'ESTABLISHMENT'");
    expect(sql).toContain("'PRIVATE_PRACTICE'");
    expect(sql).toContain("'OWNER'");
    expect(sql).toContain("'DOCTOR'");
    expect(sql).toContain('e.`owner_id`');
    expect(sql).toContain('dp.`user_id`');
  });

  it('backfills patient workspace ownership with establishment precedence', () => {
    const establishmentBackfill = 'w.`establishment_id` = p.`establishment_id`';
    const privatePracticeBackfill =
      'w.`owner_doctor_profile_id` = p.`doctor_profile_id`';

    expect(sql).toContain(establishmentBackfill);
    expect(sql).toContain(privatePracticeBackfill);
    expect(sql.indexOf(establishmentBackfill)).toBeLessThan(
      sql.indexOf(privatePracticeBackfill),
    );
  });
});
