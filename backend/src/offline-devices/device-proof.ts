import { createHash, webcrypto } from 'node:crypto';

// Device proof-of-possession (V1): every /sync/* request carries, next to the
// Bearer offline grant, a signature made with the device's registered RSA
// private key over a canonical string. The private key lives in the OS
// secure store only; the backend rebuilds the canonical string, verifies it
// against OfflineDevice.publicKey (RSA-PSS, SHA-256) and checks freshness
// plus a never-reused nonce. Algorithm constants are frozen on both sides
// (see desktop/src-tauri/src/protocol.rs and docs/offline-first-v1.md).

export const DEVICE_SIGNATURE_ALGORITHM = 'RSA-PSS-SHA256';

export const DEVICE_ID_HEADER = 'x-healix-device-id';
export const DEVICE_TIMESTAMP_HEADER = 'x-healix-device-timestamp';
export const DEVICE_NONCE_HEADER = 'x-healix-device-nonce';
export const DEVICE_SIGNATURE_HEADER = 'x-healix-device-signature';

// Request timestamp tolerance, in seconds, on each side of server time.
export const DEVICE_TIMESTAMP_WINDOW_SECONDS = 300;

// A nonce stays unique for ten minutes; rows expire with the window.
export const DEVICE_NONCE_TTL_SECONDS = DEVICE_TIMESTAMP_WINDOW_SECONDS;

// The PSS salt length, in bytes, both sides sign and verify with: the digest
// length of SHA-256. Verification enforces exactly this salt length instead
// of relying on OpenSSL's auto-recovery: an exact, shared salt length keeps
// the acceptance deterministic.
// NOTE: RSA_PKCS1_PSS_PADDING is only exported by node:crypto under
// `crypto.constants` (a top-level named import compiles to `undefined`,
// silently downgrading to PKCS#1 v1.5). Use constants.* everywhere.
export const DEVICE_SIGNATURE_SALT_BYTES = 32;

// SHA-256 of the empty body: the constant GET requests sign.
export const EMPTY_BODY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export type DeviceRequestSignatureInput = {
  method: string;
  path: string;
  timestamp: number;
  nonce: string;
  bodySha256: string;
  deviceId: string;
};

// Canonical string, exactly what the desktop signs:
//   METHOD \n PATH \n TIMESTAMP \n NONCE \n BODY_SHA256 \n DEVICE_ID \n
// PATH is the request path WITHOUT the query string: the pull cursor is
// not a secret, every request body is covered by BODY_SHA256 and the
// trailing newline keeps one-line ambiguity away.
export const buildDeviceCanonicalString = (input: DeviceRequestSignatureInput) =>
  [
    input.method.toUpperCase(),
    input.path,
    String(input.timestamp),
    input.nonce,
    input.bodySha256,
    input.deviceId,
    '',
  ].join('\n');

export const sha256Hex = (body: Buffer) =>
  createHash('sha256').update(body).digest('hex');

// WebCrypto wants DER bytes, registration stores the PEM text.
const pemToDer = (pem: string) =>
  Buffer.from(
    pem
      .replace(/-----(BEGIN|END)[^-]*-----/g, '')
      .replace(/\s+/g, ''),
    'base64',
  );

// Verification goes through WebCrypto (subtle) rather than the legacy
// OpenSSL binding of node:crypto: RSA-PSS there requires the exact salt
// length (no auto-recovery) and runs on an independent native path. The
// verification inputs are rebuilt from the request, never trusted.
export const verifyDeviceSignature = async (input: {
  publicKeyPem: string;
  canonical: string;
  signatureBase64: string;
}) => {
  const signature = Buffer.from(input.signatureBase64, 'base64');
  if (signature.length === 0) {
    return false;
  }
  try {
    const key = await webcrypto.subtle.importKey(
      'spki',
      pemToDer(input.publicKeyPem),
      { name: 'RSA-PSS', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await webcrypto.subtle.verify(
      { name: 'RSA-PSS', saltLength: DEVICE_SIGNATURE_SALT_BYTES },
      key,
      signature,
      Buffer.from(input.canonical, 'utf8'),
    );
  } catch {
    return false;
  }
};
