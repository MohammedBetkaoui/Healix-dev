import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { type AddressInfo, type Socket } from 'node:net';

// A reverse HTTP proxy between one Desktop and the Backend, whose only job is
// to misbehave on purpose. It is HTTP-aware so that a fault targets one route
// ("lose the response of /api/sync/push, once") instead of a time window:
// that is what makes lost-ACK scenarios deterministic. It belongs to the test
// infrastructure only; tests drive it through NetworkFaultController.

export type RequestMatch = {
  method?: string;
  // A string is a path prefix; a RegExp is tested against the path (no query).
  path?: string | RegExp;
};

export type Fault =
  // The request never reaches the Backend; the connection is destroyed.
  | { kind: 'cut' }
  // TCP RST, before the request is forwarded or after the Backend answered.
  | { kind: 'reset'; when: 'before' | 'after' }
  // The Backend processes the request, its response never reaches the client.
  | { kind: 'dropResponse' }
  // The response is held until the client gives up; `forward: true` lets the
  // Backend process the request first (the ambiguous case).
  | { kind: 'timeout'; forward: boolean }
  // Delays before forwarding and/or before answering.
  | { kind: 'latency'; requestMs?: number; responseMs?: number }
  // The identical request, nonce included, is sent to the Backend twice.
  | { kind: 'duplicate' }
  // Runs code around the forwarding (for instance killing the Backend once it
  // has committed), then optionally drops the response.
  | {
      kind: 'hook';
      before?: () => Promise<void>;
      after?: () => Promise<void>;
      dropResponse?: boolean;
    };

type Rule = { match: RequestMatch; fault: Fault; remaining: number };

export type ProxiedRequest = {
  method: string;
  path: string;
  // Status the Backend answered, or null when it was never reached / silent.
  upstreamStatus: number | null;
  fault: Fault['kind'] | null;
  at: number;
};

const matches = (match: RequestMatch, method: string, path: string) => {
  if (match.method && match.method.toUpperCase() !== method) return false;
  if (!match.path) return true;
  return typeof match.path === 'string'
    ? path.startsWith(match.path)
    : match.path.test(path);
};

const readBody = (request: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });

type UpstreamResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
};

export class HttpFaultProxy {
  private server: http.Server | null = null;
  private rules: Rule[] = [];
  private readonly sockets = new Set<Socket>();
  readonly log: ProxiedRequest[] = [];
  port = 0;

  constructor(
    private readonly upstream: { host: string; port: () => number },
    // Each proxy presents its Desktop to the Backend as its own client
    // address (X-Forwarded-For, trusted from loopback): the per-IP rate limit
    // of the login route would otherwise throttle a suite of many devices.
    private readonly clientAddress: string,
  ) {}

  async start(port = 0): Promise<void> {
    this.server = http.createServer((request, response) => {
      void this.handle(request, response);
    });
    // The Desktop pools its connections and may stay silent for seconds (a
    // debug build generates its RSA key between login and registration): the
    // proxy must not be the side that closes an idle connection first.
    this.server.keepAliveTimeout = 120_000;
    this.server.headersTimeout = 125_000;
    this.server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(port, '127.0.0.1', () => resolve());
    });
    this.port = (this.server.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    const server = this.server;
    this.server = null;
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  baseUrl() {
    return `http://127.0.0.1:${this.port}`;
  }

  addRule(match: RequestMatch, fault: Fault, times = Infinity) {
    this.rules.push({ match, fault, remaining: times });
  }

  clearRules() {
    this.rules = [];
  }

  pendingRules() {
    return this.rules.filter((rule) => rule.remaining > 0).length;
  }

  private takeRule(method: string, path: string): Rule | undefined {
    const rule = this.rules.find(
      (candidate) =>
        candidate.remaining > 0 && matches(candidate.match, method, path),
    );
    if (rule) rule.remaining -= 1;
    return rule;
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    const method = (request.method ?? 'GET').toUpperCase();
    const path = (request.url ?? '/').split('?')[0];
    const body = await readBody(request);
    const entry: ProxiedRequest = {
      method,
      path,
      upstreamStatus: null,
      fault: null,
      at: Date.now(),
    };
    this.log.push(entry);
    const rule = this.takeRule(method, path);
    const fault = rule?.fault;
    entry.fault = fault?.kind ?? null;
    const socket = request.socket;

    try {
      if (fault?.kind === 'cut') return void socket.destroy();
      if (fault?.kind === 'reset' && fault.when === 'before') {
        return void socket.resetAndDestroy();
      }
      if (fault?.kind === 'latency' && fault.requestMs) {
        await this.sleep(fault.requestMs, socket);
      }
      if (fault?.kind === 'timeout' && !fault.forward) {
        return void (await this.holdUntilClosed(socket));
      }
      if (fault?.kind === 'hook' && fault.before) await fault.before();

      let upstream: UpstreamResponse;
      try {
        upstream = await this.forward(method, request, body);
        if (fault?.kind === 'duplicate') {
          // Same bytes, same nonce: the second copy is the replay.
          await this.forward(method, request, body);
        }
      } catch {
        // The Backend is down or hung up: the client sees a dead connection.
        return void socket.destroy();
      }
      entry.upstreamStatus = upstream.status;

      if (fault?.kind === 'hook' && fault.after) await fault.after();
      if (fault?.kind === 'dropResponse') return void socket.destroy();
      if (fault?.kind === 'hook' && fault.dropResponse) {
        return void socket.destroy();
      }
      if (fault?.kind === 'reset') return void socket.resetAndDestroy();
      if (fault?.kind === 'timeout') {
        return void (await this.holdUntilClosed(socket));
      }
      if (fault?.kind === 'latency' && fault.responseMs) {
        await this.sleep(fault.responseMs, socket);
      }
      if (socket.destroyed) return;
      response.writeHead(upstream.status, this.responseHeaders(upstream));
      response.end(upstream.body);
    } catch {
      socket.destroy();
    }
  }

  private responseHeaders(upstream: UpstreamResponse) {
    const headers: http.OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(upstream.headers)) {
      if (['transfer-encoding', 'connection', 'content-length'].includes(name))
        continue;
      headers[name] = value;
    }
    headers['content-length'] = upstream.body.length;
    return headers;
  }

  private forward(method: string, request: IncomingMessage, body: Buffer) {
    return new Promise<UpstreamResponse>((resolve, reject) => {
      const headers = { ...request.headers };
      delete headers.connection;
      headers.host = `${this.upstream.host}:${this.upstream.port()}`;
      headers['x-forwarded-for'] = this.clientAddress;
      headers['content-length'] = String(body.length);
      const outgoing = http.request(
        {
          host: this.upstream.host,
          port: this.upstream.port(),
          method,
          path: request.url,
          headers,
          // No connection reuse: a restarted Backend never meets a stale socket.
          agent: false,
        },
        (incoming) => {
          const chunks: Buffer[] = [];
          incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
          incoming.on('end', () =>
            resolve({
              status: incoming.statusCode ?? 502,
              headers: incoming.headers,
              body: Buffer.concat(chunks),
            }),
          );
          incoming.on('error', reject);
        },
      );
      outgoing.on('error', reject);
      outgoing.end(body);
    });
  }

  private sleep(ms: number, socket: Socket) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      socket.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  // Holds the connection open until the client gives up (bounded: a test never
  // waits on a hung proxy).
  private holdUntilClosed(socket: Socket, maxMs = 30_000) {
    return new Promise<void>((resolve) => {
      if (socket.destroyed) return resolve();
      const timer = setTimeout(() => {
        socket.destroy();
        resolve();
      }, maxMs);
      socket.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
