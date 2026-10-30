import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrescriptionSafetyService } from './prescription-safety.service';

// The Desktop ports this service (desktop/src/prescription-safety.ts) so that a
// prescription gets the same alerts offline as online. The shared cases and the
// server's own answers live in desktop/src/test: the Desktop test checks its
// port against them, this one checks that the server still gives them.
//
//   WRITE_SAFETY_GOLDEN=1 npx jest prescription-safety.parity
//
// rewrites the answers after an intended change of the server rules (then the
// Desktop port has to follow, and its test says where).
const directory = join(__dirname, '..', '..', '..', 'desktop', 'src', 'test');
const casesPath = join(directory, 'safety-cases.json');
const goldenPath = join(directory, 'safety-golden.json');

type Cases = {
  item: Record<string, unknown>;
  cases: Array<{
    name: string;
    items: Array<Record<string, unknown>>;
    summary: unknown;
  }>;
};

const { item: base, cases }: Cases = JSON.parse(
  readFileSync(casesPath, 'utf8'),
) as Cases;

const answer = (entry: Cases['cases'][number]) =>
  new PrescriptionSafetyService().evaluate(
    entry.items.map((override) => ({ ...base, ...override })) as never,
    entry.summary,
  );

describe('PrescriptionSafetyService, as the Desktop port expects it', () => {
  if (process.env.WRITE_SAFETY_GOLDEN === '1') {
    it('writes the golden answers', () => {
      const golden = Object.fromEntries(
        cases.map((entry) => [entry.name, answer(entry)]),
      );
      writeFileSync(goldenPath, `${JSON.stringify(golden, null, 2)}\n`);
    });
    return;
  }

  const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as Record<
    string,
    unknown
  >;

  it('has an answer for every shared case, and no stale one', () => {
    expect(Object.keys(golden).sort()).toEqual(
      cases.map((entry) => entry.name).sort(),
    );
  });

  it.each(cases.map((entry) => [entry.name, entry] as const))(
    '%s',
    (_name, entry) => {
      expect(answer(entry)).toEqual(golden[entry.name]);
    },
  );
});
