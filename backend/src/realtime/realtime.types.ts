import { type Server, type Socket } from 'socket.io';

// Real-time notifications (docs/messaging-design.md, section 6). Writes stay
// in REST: the socket only tells the client what to read again. The events
// carry identifiers, never a text.

// Under /api: Caddy relays it to the backend like the rest of the API.
export const REALTIME_PATH = '/api/realtime';

export const MAX_SOCKETS_PER_USER = 5;
// The client never sends anything: beyond this many messages, it is cut off.
export const MAX_UNEXPECTED_MESSAGES = 5;

// A connection refused at the handshake (the client's connect_error message).
export type RefusalCode =
  | 'origin_not_allowed'
  | 'unauthorized'
  | 'token_expired';

// Sent in session.closed just before the server closes a socket.
export type CloseReason =
  // The access token expired: refresh it (REST), then reconnect.
  | 'token_expired'
  // Logout, password change, suspension: reconnect once; a closed session
  // is refused with "unauthorized".
  | 'session_ended'
  // A sixth socket of the user opened: this one, the oldest, gave way.
  | 'too_many_sockets'
  // The client sent messages, which it never should.
  | 'protocol_violation';

export type RealtimeEventPayloads = {
  'notification.created': { notificationId: string };
  'notification.updated': { notificationId: string };
  'message.created': { conversationId: string; seq: number };
  'message.updated': { conversationId: string; messageId: string };
  'message.deleted': { conversationId: string; messageId: string };
  'conversation.updated': { conversationId: string };
  // readAt: ISO 8601, when the position moved.
  'read.updated': {
    conversationId: string;
    userId: string;
    seq: number;
    readAt: string;
  };
  typing: { conversationId: string; userId: string };
};

export type RealtimeEventName = keyof RealtimeEventPayloads;

export const SESSION_CLOSED_EVENT = 'session.closed';

export type ServerToClientEvents = {
  [Event in RealtimeEventName]: (payload: RealtimeEventPayloads[Event]) => void;
} & {
  [SESSION_CLOSED_EVENT]: (payload: { reason: CloseReason }) => void;
};

export type SocketData = {
  userId: string;
  // Expiry of the access token of the handshake, in milliseconds.
  expiresAt: number;
  // Order of arrival, to close the oldest socket first.
  sequence: number;
};

type NoEvents = Record<string, never>;

export type RealtimeServer = Server<
  NoEvents,
  ServerToClientEvents,
  NoEvents,
  SocketData
>;
export type RealtimeSocket = Socket<
  NoEvents,
  ServerToClientEvents,
  NoEvents,
  SocketData
>;

// Every socket of a user, and only theirs: the server never emits to a room
// a client could choose.
export const userRoom = (userId: string) => `user:${userId}`;
