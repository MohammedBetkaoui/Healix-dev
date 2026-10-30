import {
  constants,
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from 'node:crypto';

// A device spoken to at the protocol level: a real RSA keypair registered
// through the real API, a real offline grant, and the exact device
// proof-of-possession (RSA-PSS / SHA-256, 32-byte salt) over the canonical
// string. Used where a scenario needs byte-level control (same operationId
// with another payload, a bad signature, a reused nonce...). Nothing is
// bypassed: the server verifies every request the way it verifies a Desktop's.

export type Tamper =
  | 'badSignature'
  | 'wrongBodyHash'
  | 'wrongDeviceId'
  | 'staleTimestamp'
  | 'badNonce'
  | 'missingSignature'
  | 'noGrant';

export type SignedOptions = {
  baseUrl?: string;
  tamper?: Tamper;
  // Reuse a nonce already spent (replay).
  nonce?: string;
  timestamp?: number;
};

export type RawResponse = { status: number; body: any; nonce: string };

let clientCounter = 0;
// A distinct client address per call: the login route is rate limited per IP.
const nextClientAddress = () =>
  `10.88.${(clientCounter >> 8) & 255}.${clientCounter++ & 255 || 1}`;

export type WebSession = { cookie: string; baseUrl: string };

export async function webLogin(
  baseUrl: string,
  credentials: { email: string; password: string },
): Promise<WebSession> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': nextClientAddress(),
    },
    body: JSON.stringify({ accountType: 'INDEPENDENT_DOCTOR', ...credentials }),
  });
  if (!response.ok) throw new Error(`web login failed (${response.status})`);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return { cookie, baseUrl };
}

const webCall = async (
  session: WebSession,
  method: string,
  path: string,
  body?: unknown,
) => {
  const response = await fetch(`${session.baseUrl}/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      cookie: session.cookie,
      'x-forwarded-for': nextClientAddress(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
};

export const revokeDevice = (session: WebSession, deviceId: string) =>
  webCall(session, 'POST', `/devices/${deviceId}/revoke`);

export const reauthorizeDevice = (session: WebSession, deviceId: string) =>
  webCall(session, 'POST', `/devices/${deviceId}/reauthorize`);

export class RawDevice {
  private constructor(
    readonly deviceId: string,
    readonly installationId: string,
    readonly grant: string,
    private readonly privateKey: string,
    private readonly defaultBaseUrl: string,
  ) {}

  static async register(
    session: WebSession,
    label: string,
    baseUrl = session.baseUrl,
  ): Promise<RawDevice> {
    const keys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const installationId = randomUUID();
    const registered = await webCall(session, 'POST', '/devices/register', {
      installationId,
      deviceName: `Raw E2E ${label}`,
      platform: 'linux',
      publicKey: keys.publicKey,
    });
    if (registered.status >= 300) {
      throw new Error(`raw device registration failed (${registered.status})`);
    }
    return new RawDevice(
      registered.body.device.id,
      installationId,
      registered.body.offlineAccessGrant,
      keys.privateKey,
      baseUrl,
    );
  }

  async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    options: SignedOptions = {},
  ): Promise<RawResponse> {
    const text = body === undefined ? '' : JSON.stringify(body);
    const bytes = Buffer.from(text, 'utf8');
    const signedPath = path.split('?')[0];
    const nonce = options.nonce ?? randomBytes(16).toString('hex');
    const timestamp =
      options.timestamp ??
      Math.floor(Date.now() / 1000) -
        (options.tamper === 'staleTimestamp' ? 3_600 : 0);
    const hashed =
      options.tamper === 'wrongBodyHash' ? Buffer.from(`${text}x`) : bytes;
    const canonical = [
      method,
      signedPath,
      String(timestamp),
      nonce,
      createHash('sha256').update(hashed).digest('hex'),
      this.deviceId,
      '',
    ].join('\n');
    const signature = sign('sha256', Buffer.from(canonical), {
      key: this.privateKey,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    });
    if (options.tamper === 'badSignature') signature[0] ^= 0xff;

    const headers: Record<string, string> = {
      'x-forwarded-for': nextClientAddress(),
    };
    if (options.tamper !== 'noGrant')
      headers.authorization = `Bearer ${this.grant}`;
    if (text) headers['content-type'] = 'application/json';
    if (options.tamper !== 'missingSignature') {
      headers['x-healix-device-id'] =
        options.tamper === 'wrongDeviceId'
          ? `${this.deviceId}-other`
          : this.deviceId;
      headers['x-healix-device-timestamp'] = String(timestamp);
      headers['x-healix-device-nonce'] =
        options.tamper === 'badNonce' ? 'short' : nonce;
      headers['x-healix-device-signature'] = signature.toString('base64');
    }

    const response = await fetch(
      `${options.baseUrl ?? this.defaultBaseUrl}${path}`,
      {
        method,
        headers,
        body: text || undefined,
      },
    );
    const answer = await response.text();
    let parsed: unknown = answer;
    try {
      parsed = answer ? JSON.parse(answer) : null;
    } catch {
      /* not JSON: keep the text */
    }
    return { status: response.status, body: parsed, nonce };
  }

  bootstrap(options?: SignedOptions) {
    return this.request('POST', '/api/sync/bootstrap', undefined, options);
  }

  reconcile(options?: SignedOptions) {
    return this.request('POST', '/api/sync/reconcile', undefined, options);
  }

  pull(cursor = '', options?: SignedOptions) {
    return this.request(
      'GET',
      `/api/sync/pull?cursor=${encodeURIComponent(cursor)}`,
      undefined,
      options,
    );
  }

  ack(cursor: string, options?: SignedOptions) {
    return this.request('POST', '/api/sync/ack', { cursor }, options);
  }

  push(operations: unknown[], options?: SignedOptions) {
    return this.request('POST', '/api/sync/push', { operations }, options);
  }
}
