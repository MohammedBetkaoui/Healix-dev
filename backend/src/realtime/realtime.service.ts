import { Injectable, Logger } from '@nestjs/common';

import {
  type CloseReason,
  MAX_SOCKETS_PER_USER,
  type RealtimeEventName,
  type RealtimeEventPayloads,
  type RealtimeServer,
  SESSION_CLOSED_EVENT,
  userRoom,
} from './realtime.types';

// A socket of this process, or one returned by fetchSockets().
type ClosableSocket = {
  emit(
    event: typeof SESSION_CLOSED_EVENT,
    payload: { reason: CloseReason },
  ): unknown;
  disconnect(close?: boolean): unknown;
};

// session.closed { reason }, then the connection is closed: engine.io sends
// what is queued before closing, so the reason arrives first.
export function closeSocket(socket: ClosableSocket, reason: CloseReason) {
  socket.emit(SESSION_CLOSED_EVENT, { reason });
  socket.disconnect(true);
}

// One instance of the backend today: the in-memory adapter. Several
// instances would share the rooms through @socket.io/redis-adapter, with the
// same calls (docs/messaging-design.md).
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: RealtimeServer | null = null;

  attach(server: RealtimeServer): void {
    this.server = server;
  }

  // Called once the write is committed. A failure is logged and never
  // undoes, nor fails, the write: the client catches up with afterSeq.
  emitToUsers<Event extends RealtimeEventName>(
    userIds: Iterable<string>,
    event: Event,
    payload: RealtimeEventPayloads[Event],
  ): void {
    const rooms = [...new Set(userIds)].map(userRoom);

    if (!this.server || rooms.length === 0) {
      return;
    }

    try {
      // Each socket gets the event once, whatever its rooms. The payload is
      // typed by emitToUsers' signature; socket.io's own typing cannot follow
      // a generic event name.
      const broadcast = this.server.to(rooms) as unknown as {
        emit(event: string, payload: unknown): boolean;
      };
      broadcast.emit(event, payload);
    } catch (error) {
      this.logger.error(
        `Real-time event ${event} not sent: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  // Logout, password change, suspension, reactivation, and the future
  // revocation of a session: every socket of the user is closed.
  async disconnectUser(
    userId: string,
    reason: CloseReason = 'session_ended',
  ): Promise<void> {
    if (!this.server) {
      return;
    }

    try {
      const sockets = await this.server.in(userRoom(userId)).fetchSockets();
      sockets.forEach((socket) => closeSocket(socket, reason));
    } catch (error) {
      this.logger.error(
        `Sockets of user ${userId} not closed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  // At most 5 sockets per user: the oldest ones give way.
  async enforceSocketLimit(userId: string): Promise<void> {
    if (!this.server) {
      return;
    }

    const sockets = await this.server.in(userRoom(userId)).fetchSockets();
    const excess = sockets.length - MAX_SOCKETS_PER_USER;

    if (excess > 0) {
      sockets
        .sort((first, second) => first.data.sequence - second.data.sequence)
        .slice(0, excess)
        .forEach((socket) => closeSocket(socket, 'too_many_sockets'));
    }
  }
}
