import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';

// bcrypt reads only the first 72 bytes of what it hashes. A refresh token is
// a JWT: its first 72 bytes (the header, then the start of the claims, which
// begin with the user's id) are the same for every session of a user, so the
// bcrypt hash of one session's token matched the tokens of all the others and
// a revoked session could not be told from a live one. The token is reduced to
// its SHA-256 (64 hexadecimal characters, so within 72 bytes) first: the hash
// now depends on the whole token.
export function digestRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function hashRefreshToken(
  token: string,
  saltRounds: number,
): Promise<string> {
  return bcrypt.hash(digestRefreshToken(token), saltRounds);
}

export function refreshTokenMatches(
  token: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(digestRefreshToken(token), hash);
}
