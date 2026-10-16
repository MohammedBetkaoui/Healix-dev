import { Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';

import { RealtimeAuthenticator, RealtimeRefusal } from './realtime-auth';
import { closeSocket, RealtimeService } from './realtime.service';
import {
  MAX_UNEXPECTED_MESSAGES,
  REALTIME_PATH,
  type RealtimeServer,
  type RealtimeSocket,
  userRoom,
} from './realtime.types';

// setTimeout's limit (about 24.8 days); an access token lives 15 minutes.
const MAX_TIMER_MS = 2 ** 31 - 1;

// The socket of an authenticated professional: server-to-client only. The
// WebSocket transport alone: no long-polling, so no sticky sessions behind a
// load balancer.
@WebSocketGateway({
  path: REALTIME_PATH,
  serveClient: false,
  transports: ['websocket'],
})
export class RealtimeGateway
  implements
    OnGatewayInit<RealtimeServer>,
    OnGatewayConnection<RealtimeSocket>,
    OnGatewayDisconnect<RealtimeSocket>
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly expiryTimers = new WeakMap<
    RealtimeSocket,
    ReturnType<typeof setTimeout>
  >();
  private sequence = 0;

  constructor(
    private readonly authenticator: RealtimeAuthenticator,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: RealtimeServer): void {
    // Before the connection is accepted: a refusal closes it with its code
    // alone (connect_error on the client), never a detail.
    server.use((socket, next) => {
      this.authenticator.authenticate(socket.handshake.headers).then(
        (identity) => {
          this.sequence += 1;
          socket.data = { ...identity, sequence: this.sequence };
          next();
        },
        (error: unknown) => {
          if (!(error instanceof RealtimeRefusal)) {
            this.logger.error(
              `Real-time handshake failed: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
          }
          next(
            new Error(
              error instanceof RealtimeRefusal ? error.code : 'unauthorized',
            ),
          );
        },
      );
    });
    this.realtime.attach(server);
  }

  async handleConnection(socket: RealtimeSocket): Promise<void> {
    const { expiresAt, userId } = socket.data;

    // Nothing is accepted from the client: every message is refused, and
    // beyond 5 of them the socket is closed.
    let unexpected = 0;
    socket.use((_packet, next) => {
      unexpected += 1;
      if (unexpected > MAX_UNEXPECTED_MESSAGES) {
        closeSocket(socket, 'protocol_violation');
      }
      next(new Error('not_accepted'));
    });
    // A refused message is reported here; it must not crash the process.
    socket.on('error', () => undefined);

    // Closed when the access token of the handshake expires: the client
    // refreshes it (REST), then reconnects.
    this.expiryTimers.set(
      socket,
      setTimeout(
        () => closeSocket(socket, 'token_expired'),
        Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMER_MS),
      ),
    );

    await socket.join(userRoom(userId));
    await this.realtime.enforceSocketLimit(userId);
  }

  handleDisconnect(socket: RealtimeSocket): void {
    clearTimeout(this.expiryTimers.get(socket));
    this.expiryTimers.delete(socket);
  }
}
