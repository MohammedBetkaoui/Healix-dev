import { type PrismaService } from '../prisma/prisma.service';
import { type RealtimeService } from '../realtime/realtime.service';
import { MessagingEvents, TYPING_INTERVAL_MS } from './messaging-events';

type FindManyArgs = {
  where: { conversationId: string; status: { in: string[] }; OR: unknown[] };
};

function setup(participants = ['user-a', 'user-b', 'user-c']) {
  const findMany = jest
    .fn()
    .mockResolvedValue(participants.map((userId) => ({ userId })));
  const emitToUsers = jest.fn();
  const events = new MessagingEvents(
    { conversationParticipant: { findMany } } as unknown as PrismaService,
    { emitToUsers } as unknown as RealtimeService,
  );
  const recipients = (call = 0) =>
    [...(emitToUsers.mock.calls[call] as [Set<string>])[0]].sort();
  const query = (call = 0) => (findMany.mock.calls[call] as [FindManyArgs])[0];
  // emitToUsers(recipients, event, payload) of one call.
  const sent = (call = 0) =>
    emitToUsers.mock.calls[call] as [Set<string>, string, unknown];
  return { emitToUsers, events, findMany, query, recipients, sent };
}

describe('MessagingEvents', () => {
  it('sends to the ACTIVE and PENDING participants, the author included, ids only', async () => {
    const { events, query, recipients, sent } = setup();

    await events.messageCreated('conversation-1', 7);

    expect(query().where.conversationId).toBe('conversation-1');
    expect(query().where.status).toEqual({ in: ['ACTIVE', 'PENDING'] });
    expect(recipients()).toEqual(['user-a', 'user-b', 'user-c']);
    expect(sent()[1]).toBe('message.created');
    expect(sent()[2]).toEqual({
      conversationId: 'conversation-1',
      seq: 7,
    });
  });

  it('keeps, for a group, only the ACTIVE members of its workspace', async () => {
    const { events, query } = setup();

    await events.conversationUpdated('conversation-1');

    expect(query().where.OR).toEqual([
      { conversation: { type: { not: 'GROUP' } } },
      {
        user: {
          workspaceMemberships: {
            some: {
              status: 'ACTIVE',
              workspace: {
                conversations: { some: { id: 'conversation-1' } },
              },
            },
          },
        },
      },
    ]);
  });

  it('also tells the users who just left', async () => {
    const { events, recipients } = setup(['user-a']);

    await events.conversationUpdated('conversation-1', { also: ['user-gone'] });

    expect(recipients()).toEqual(['user-a', 'user-gone']);
  });

  it('logs a failure and never throws', async () => {
    const { emitToUsers, events, findMany } = setup();
    findMany.mockRejectedValue(new Error('database down'));

    await expect(
      events.readUpdated('conversation-1', 'user-a', 3),
    ).resolves.toBeUndefined();
    expect(emitToUsers).not.toHaveBeenCalled();
  });

  it('sends typing to the other ACTIVE participants, at most every 3 s', async () => {
    const { emitToUsers, events, query, recipients, sent } = setup();
    const start = 1_000_000;

    await expect(
      events.typing('conversation-1', 'user-a', start),
    ).resolves.toBe(true);
    expect(query().where.status).toEqual({ in: ['ACTIVE'] });
    expect(recipients()).toEqual(['user-b', 'user-c']);
    expect(sent()[2]).toEqual({
      conversationId: 'conversation-1',
      userId: 'user-a',
    });

    await expect(
      events.typing('conversation-1', 'user-a', start + TYPING_INTERVAL_MS - 1),
    ).resolves.toBe(false);
    // Another conversation, another user: their own interval.
    await expect(
      events.typing('conversation-2', 'user-a', start + 1),
    ).resolves.toBe(true);
    await expect(
      events.typing('conversation-1', 'user-b', start + 1),
    ).resolves.toBe(true);
    await expect(
      events.typing('conversation-1', 'user-a', start + TYPING_INTERVAL_MS),
    ).resolves.toBe(true);
    expect(emitToUsers).toHaveBeenCalledTimes(4);
  });
});
