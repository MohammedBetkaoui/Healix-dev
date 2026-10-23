import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

import {
  digestRefreshToken,
  hashRefreshToken,
  refreshTokenMatches,
} from './refresh-token-hash';

// Two refresh tokens of one user, signed a second apart as two logins are.
async function twoSessionsOfOneUser() {
  const jwt = new JwtService({ secret: 'test-secret' });
  const claims = {
    sub: 'cmabcdefghijklmnopqrstuvw',
    email: 'doctor@example.dz',
    role: 'INDEPENDENT_DOCTOR',
    tokenType: 'refresh',
  };
  const first = await jwt.signAsync(claims, { expiresIn: 3600 });
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  const second = await jwt.signAsync(claims, { expiresIn: 3600 });

  return { first, second };
}

describe('refresh token hash', () => {
  it('tells the sessions of one user apart, which a plain bcrypt hash of the token does not', async () => {
    const { first, second } = await twoSessionsOfOneUser();
    expect(second).not.toBe(first);

    // What was stored before: bcrypt cut the token at 72 bytes, where both
    // tokens are still the same.
    const legacyHash = await bcrypt.hash(first, 4);
    expect(await bcrypt.compare(second, legacyHash)).toBe(true);

    const hash = await hashRefreshToken(first, 4);
    expect(await refreshTokenMatches(first, hash)).toBe(true);
    expect(await refreshTokenMatches(second, hash)).toBe(false);
  });

  it('keeps the digest within what bcrypt reads', () => {
    expect(digestRefreshToken('a'.repeat(5_000))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not recognize a hash made from the raw token', async () => {
    const { first } = await twoSessionsOfOneUser();
    const legacyHash = await bcrypt.hash(first, 4);

    expect(await refreshTokenMatches(first, legacyHash)).toBe(false);
  });
});
