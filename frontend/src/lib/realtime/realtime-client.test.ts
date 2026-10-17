import { AxiosError, type AxiosResponse } from "axios";

import {
  RECONNECT_DELAY_MAX_MS,
  REALTIME_PATH,
  RealtimeClient,
  reconnectDelay,
  realtimeUrl,
  type SocketOptions,
} from "./realtime-client";

// As SocketLike declares it; called back with what the server sent.
type Handler = (...args: never[]) => void;

class FakeSocket {
  active = true;
  connected = false;
  readonly connect = jest.fn();
  readonly disconnect = jest.fn();
  private readonly handlers = new Map<string, Handler[]>();

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  fire(event: string, ...args: unknown[]) {
    this.handlers
      .get(event)
      ?.forEach((handler) => (handler as (...values: unknown[]) => void)(...args));
  }

  // The server refused the handshake with this code.
  refuse(code: string) {
    this.active = false;
    this.fire("connect_error", new Error(code));
  }

  // The server sent session.closed, then closed the socket.
  closedByServer(reason: string) {
    this.fire("session.closed", { reason });
    this.active = false;
    this.fire("disconnect", "io server disconnect");
  }
}

function httpError(status: number) {
  return new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
  } as AxiosResponse);
}

async function setup(refreshSession = jest.fn().mockResolvedValue({})) {
  const socket = new FakeSocket();
  const created: { url: string | undefined; options: SocketOptions }[] = [];
  const scheduled: { action: () => void; delay: number }[] = [];
  const client = new RealtimeClient({
    createSocket: (url, options) => {
      created.push({ options, url });
      return Promise.resolve(socket);
    },
    random: () => 1,
    refreshSession,
    schedule: (action, delay) => {
      const entry = { action, delay };
      scheduled.push(entry);
      return () => scheduled.splice(scheduled.indexOf(entry), 1);
    },
    url: "http://localhost:3001",
  });
  await client.start();
  const runScheduled = async () => {
    const entry = scheduled.shift();
    entry?.action();
    await Promise.resolve();
    await Promise.resolve();
  };
  // Lets the refresh promise settle.
  const settle = async () => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  };
  return { client, created, refreshSession, runScheduled, scheduled, settle, socket };
}

describe("RealtimeClient", () => {
  it("opens one WebSocket on /api/realtime, credentials included", async () => {
    const { client, created } = await setup();
    await client.start();

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      options: { path: REALTIME_PATH, transports: ["websocket"], withCredentials: true },
      url: "http://localhost:3001",
    });
  });

  it("refreshes the session on token_expired at the handshake, then reconnects", async () => {
    const { refreshSession, runScheduled, scheduled, settle, socket } = await setup();

    socket.refuse("token_expired");
    await settle();

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(scheduled).toEqual([expect.objectContaining({ delay: 0 })]);
    await runScheduled();
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it("refreshes then reconnects when the server closes on token_expired", async () => {
    const { refreshSession, runScheduled, settle, socket } = await setup();

    socket.closedByServer("token_expired");
    await settle();
    await runScheduled();

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it.each(["unauthorized", "origin_not_allowed"])(
    "does not loop on %s: no refresh, no reconnection",
    async (code) => {
      const { client, refreshSession, scheduled, settle, socket } = await setup();

      socket.refuse(code);
      await settle();

      expect(refreshSession).not.toHaveBeenCalled();
      expect(scheduled).toEqual([]);
      expect(socket.connect).not.toHaveBeenCalled();
      expect(socket.disconnect).toHaveBeenCalled();
      expect(client.status).toBe("stopped");
    },
  );

  it("stops when the refresh says the session is over", async () => {
    const { client, scheduled, settle, socket } = await setup(
      jest.fn().mockRejectedValue(httpError(401)),
    );

    socket.refuse("token_expired");
    await settle();

    expect(scheduled).toEqual([]);
    expect(client.status).toBe("stopped");
  });

  it("tries the refresh again later, with a growing delay, when the server cannot answer", async () => {
    const refreshSession = jest
      .fn()
      .mockRejectedValueOnce(httpError(503))
      .mockRejectedValueOnce(new AxiosError("Network Error"))
      .mockResolvedValue({});
    const { runScheduled, scheduled, settle, socket } = await setup(refreshSession);

    socket.refuse("token_expired");
    await settle();
    expect(scheduled[0].delay).toBe(1_000);
    await runScheduled();
    await settle();
    expect(scheduled[0].delay).toBe(2_000);
    await runScheduled();
    await settle();
    await runScheduled();

    expect(refreshSession).toHaveBeenCalledTimes(3);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it("reconnects later after session_ended, never after too_many_sockets", async () => {
    const first = await setup();
    first.socket.closedByServer("session_ended");
    expect(first.scheduled).toHaveLength(1);
    await first.runScheduled();
    expect(first.socket.connect).toHaveBeenCalledTimes(1);

    const second = await setup();
    second.socket.closedByServer("too_many_sockets");
    expect(second.scheduled).toEqual([]);
    expect(second.client.status).toBe("stopped");
  });

  it("leaves a network failure to socket.io's own reconnection", async () => {
    const { refreshSession, scheduled, socket } = await setup();

    socket.fire("connect_error", new Error("websocket error"));

    expect(refreshSession).not.toHaveBeenCalled();
    expect(scheduled).toEqual([]);
  });

  it("passes the events on, and tells when it is connected", async () => {
    const { client, socket } = await setup();
    const events: unknown[] = [];
    const connection: boolean[] = [];
    client.subscribe((event, payload) => events.push([event, payload]));
    client.onConnectionChange((connected) => connection.push(connected));

    socket.fire("connect");
    socket.fire("message.created", { conversationId: "c-1", seq: 3 });
    socket.fire("disconnect", "transport close");

    expect(events).toEqual([["message.created", { conversationId: "c-1", seq: 3 }]]);
    expect(connection).toEqual([true, false]);
    // A network failure: socket.io comes back by itself, the interface says so.
    expect(client.status).toBe("connecting");
    expect(client.reconnecting).toBe(true);
    socket.fire("connect");
    expect(client.reconnecting).toBe(false);
  });

  it("does not say it is reconnecting before the first connection, nor once stopped", async () => {
    const { client, socket } = await setup();
    expect(client.reconnecting).toBe(false);

    socket.fire("connect");
    socket.refuse("unauthorized");

    expect(client.status).toBe("stopped");
    expect(client.reconnecting).toBe(false);
  });

  it("opens with the first holder and closes with the last", async () => {
    const socket = new FakeSocket();
    const createSocket = jest.fn().mockResolvedValue(socket);
    const client = new RealtimeClient({ createSocket, url: undefined });

    const releaseFirst = client.retain();
    const releaseSecond = client.retain();
    await Promise.resolve();
    expect(createSocket).toHaveBeenCalledTimes(1);

    releaseFirst();
    releaseFirst();
    expect(socket.disconnect).not.toHaveBeenCalled();
    releaseSecond();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe("reconnectDelay", () => {
  it("doubles from 1 s up to 30 s, with jitter", () => {
    const max = () => 1;
    expect([0, 1, 2, 3, 4, 5, 10].map((attempt) => reconnectDelay(attempt, max))).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, RECONNECT_DELAY_MAX_MS, RECONNECT_DELAY_MAX_MS,
    ]);
    expect(reconnectDelay(0, () => 0)).toBe(500);
  });
});

describe("realtimeUrl", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { api: env.NEXT_PUBLIC_API_URL, node: env.NODE_ENV };

  afterEach(() => {
    env.NODE_ENV = saved.node;
    env.NEXT_PUBLIC_API_URL = saved.api;
  });

  it("is the API's origin in production too", () => {
    env.NODE_ENV = "production";
    // Behind Caddy: the page's own origin.
    env.NEXT_PUBLIC_API_URL = "https://healix.example.dz/api";
    expect(realtimeUrl()).toBe("https://healix.example.dz");
    // A build served on its own port, the API on another: not the page's.
    env.NEXT_PUBLIC_API_URL = "http://localhost:3001/api";
    expect(realtimeUrl()).toBe("http://localhost:3001");
  });

  it("is the API's origin in development", () => {
    env.NODE_ENV = "development";
    env.NEXT_PUBLIC_API_URL = "http://localhost:3001/api";
    expect(realtimeUrl()).toBe("http://localhost:3001");
  });

  it("is the page's origin for a relative API URL", () => {
    env.NODE_ENV = "production";
    env.NEXT_PUBLIC_API_URL = "/api";
    expect(realtimeUrl()).toBeUndefined();
  });
});
