import { isAxiosError } from "axios";

import { apiClient } from "@/lib/api/http-client";
import { DEFAULT_API_URL } from "@/lib/api/server-api-url";
import { originOf } from "@/lib/csp/content-security-policy";

import {
  REALTIME_EVENTS,
  type RealtimeCloseReason,
  type RealtimeEventName,
  type RealtimeEventPayloads,
} from "./realtime-events";

// The real-time connection of the tab (docs/messaging-design.md, section 6):
// one Socket.IO WebSocket at /api/realtime, server to client only. Writes
// stay in REST; an event only says what to read again.

export const REALTIME_PATH = "/api/realtime";
export const RECONNECT_DELAY_MS = 1_000;
export const RECONNECT_DELAY_MAX_MS = 30_000;

// What the client uses of a socket.io-client Socket.
export type SocketLike = {
  active: boolean;
  connected: boolean;
  connect(): unknown;
  disconnect(): unknown;
  on(event: string, listener: (...args: never[]) => void): unknown;
};

export type SocketOptions = {
  path: string;
  transports: string[];
  withCredentials: boolean;
  reconnection: boolean;
  reconnectionDelay: number;
  reconnectionDelayMax: number;
  randomizationFactor: number;
};

export type RealtimeListener = <Event extends RealtimeEventName>(
  event: Event,
  payload: RealtimeEventPayloads[Event],
) => void;

export type RealtimeClientOptions = {
  createSocket?: (
    url: string | undefined,
    options: SocketOptions,
  ) => Promise<SocketLike>;
  // A new access token (cookie), as the HTTP client gets one.
  refreshSession?: () => Promise<unknown>;
  url?: string;
  schedule?: (callback: () => void, delayMs: number) => () => void;
  random?: () => number;
};

// The API's origin (NEXT_PUBLIC_API_URL, written into the build), in every
// environment: behind Caddy it is the page's own origin, and a build served
// without it (next start on its own port) still reaches the API. A relative
// URL ("/api") has no origin: the socket then opens on the page's.
export function realtimeUrl(): string | undefined {
  return (
    originOf(process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL) ?? undefined
  );
}

// Exponential, with jitter: 1 s, 2 s, 4 s... up to 30 s.
export function reconnectDelay(attempt: number, random: () => number) {
  const base = Math.min(
    RECONNECT_DELAY_MAX_MS,
    RECONNECT_DELAY_MS * 2 ** attempt,
  );
  return Math.round(base * (0.5 + random() * 0.5));
}

async function defaultCreateSocket(
  url: string | undefined,
  options: SocketOptions,
): Promise<SocketLike> {
  // Loaded with the first connection only, not with every page.
  const { io } = await import("socket.io-client");
  return url ? io(url, options) : io(options);
}

function defaultSchedule(callback: () => void, delayMs: number) {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
}

// The refresh says the session is over (signed out): no more attempts.
function isSessionEnded(error: unknown): boolean {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  return status === 401 || status === 403;
}

type State = "idle" | "connecting" | "connected" | "waiting" | "stopped";

export class RealtimeClient {
  private socket: SocketLike | null = null;
  private state: State = "idle";
  private everConnected = false;
  private attempt = 0;
  private holders = 0;
  private closeReason: RealtimeCloseReason | null = null;
  private cancelRetry: (() => void) | null = null;
  private readonly listeners = new Set<RealtimeListener>();
  private readonly connectionListeners = new Set<
    (connected: boolean) => void
  >();
  private readonly createSocket;
  private readonly refreshSession;
  private readonly schedule;
  private readonly random;
  private readonly url;

  constructor(options: RealtimeClientOptions = {}) {
    this.createSocket = options.createSocket ?? defaultCreateSocket;
    this.refreshSession =
      options.refreshSession ?? (() => apiClient.post("/auth/refresh"));
    this.schedule = options.schedule ?? defaultSchedule;
    this.random = options.random ?? Math.random;
    this.url = "url" in options ? options.url : realtimeUrl();
  }

  get status(): State {
    return this.state;
  }

  // The socket was up and is trying to come back: the interface says so
  // ("Reconnexion…"), sending stays possible over REST. Not before the
  // first connection, nor once stopped.
  get reconnecting(): boolean {
    return this.everConnected && (this.state === "connecting" || this.state === "waiting");
  }

  // Each component that needs the connection holds it; it opens with the
  // first and closes with the last.
  retain(): () => void {
    this.holders += 1;
    if (this.holders === 1) {
      void this.start();
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holders -= 1;
      if (this.holders === 0) {
        this.stop();
      }
    };
  }

  subscribe(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.socket || this.state === "connecting") {
      return;
    }

    this.state = "connecting";
    const socket = await this.createSocket(this.url, {
      path: REALTIME_PATH,
      // Built-in reconnection after a network failure, exponential too.
      randomizationFactor: 0.5,
      reconnection: true,
      reconnectionDelay: RECONNECT_DELAY_MS,
      reconnectionDelayMax: RECONNECT_DELAY_MAX_MS,
      transports: ["websocket"],
      withCredentials: true,
    });

    // Stopped while the library was loading.
    if (this.state !== "connecting") {
      socket.disconnect();
      return;
    }

    this.socket = socket;
    this.bind(socket);
  }

  // Logout, or no component needs the connection any more.
  stop(): void {
    this.cancelRetry?.();
    this.cancelRetry = null;
    this.state = "idle";
    this.attempt = 0;
    this.everConnected = false;
    const socket = this.socket;
    this.socket = null;
    socket?.disconnect();
  }

  private bind(socket: SocketLike): void {
    socket.on("connect", () => {
      this.state = "connected";
      this.everConnected = true;
      this.attempt = 0;
      this.closeReason = null;
      this.notifyConnection(true);
    });

    for (const event of REALTIME_EVENTS) {
      socket.on(event, ((payload: RealtimeEventPayloads[typeof event]) => {
        this.listeners.forEach((listener) => listener(event, payload));
      }) as (...args: never[]) => void);
    }

    socket.on("session.closed", ((payload: { reason?: RealtimeCloseReason }) => {
      this.closeReason = payload?.reason ?? null;
    }) as (...args: never[]) => void);

    socket.on("disconnect", ((reason: string) => {
      // Closed by the server: socket.io does not reconnect by itself.
      if (reason === "io server disconnect") {
        this.afterServerClose(this.closeReason);
      } else if (this.socket === socket) {
        // A network failure: socket.io reconnects by itself.
        this.state = "connecting";
      }
      this.notifyConnection(false);
    }) as (...args: never[]) => void);

    socket.on("connect_error", ((error: Error) => {
      // Still active: a network failure, socket.io retries by itself.
      if (socket.active) return;
      // Refused by the server: its code says what to do.
      if (error.message === "token_expired") {
        void this.refreshThenReconnect();
      } else {
        // unauthorized, origin_not_allowed: retrying would fail the same
        // way. No loop.
        this.halt();
      }
    }) as (...args: never[]) => void);
  }

  private afterServerClose(reason: RealtimeCloseReason | null): void {
    switch (reason) {
      case "token_expired":
        void this.refreshThenReconnect();
        return;
      case "session_ended":
        // Another session of the account ended (another device): this one
        // may still be valid. If not, the server answers "unauthorized".
        this.reconnectLater();
        return;
      default:
        // too_many_sockets, protocol_violation: reconnecting would close
        // another tab, or be closed again.
        this.halt();
    }
  }

  private async refreshThenReconnect(): Promise<void> {
    try {
      await this.refreshSession();
    } catch (error) {
      if (isSessionEnded(error)) {
        this.halt();
      } else {
        // 429, 5xx, network: try again later.
        this.retryLater(() => void this.refreshThenReconnect());
      }
      return;
    }
    this.reconnectLater(0);
  }

  private reconnectLater(delayMs?: number): void {
    this.retryLater(() => this.socket?.connect(), delayMs);
  }

  private retryLater(action: () => void, delayMs?: number): void {
    if (!this.socket) return;
    this.state = "waiting";
    const delay = delayMs ?? reconnectDelay(this.attempt, this.random);
    this.attempt += 1;
    this.cancelRetry?.();
    this.cancelRetry = this.schedule(() => {
      this.cancelRetry = null;
      action();
    }, delay);
  }

  // No more attempts until start() is called again (a new page that needs
  // the connection, after signing in again).
  private halt(): void {
    this.cancelRetry?.();
    this.cancelRetry = null;
    const socket = this.socket;
    this.socket = null;
    socket?.disconnect();
    this.state = "stopped";
    this.notifyConnection(false);
  }

  private notifyConnection(connected: boolean): void {
    this.connectionListeners.forEach((listener) => listener(connected));
  }
}

let sharedClient: RealtimeClient | null = null;

// The one connection of the tab.
export function getRealtimeClient(): RealtimeClient {
  sharedClient ??= new RealtimeClient();
  return sharedClient;
}

// At logout: close the tab's connection, if there is one.
export function stopRealtime(): void {
  sharedClient?.stop();
}
