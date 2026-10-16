import { randomBytes } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { MessageCrypto, MessagingKeysError } from './message-crypto';
import { MessagingModule } from './messaging.module';

function compileWith(messagingKeys: string | undefined) {
  return Test.createTestingModule({ imports: [MessagingModule] })
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(ConfigService)
    .useValue({
      get: (name: string) =>
        name === 'MESSAGING_KEYS' ? messagingKeys : undefined,
    })
    .compile();
}

describe('MessagingModule startup', () => {
  it.each([
    ['missing', undefined],
    ['invalid', 'k1:not-a-key'],
  ])('fails when MESSAGING_KEYS is %s', async (_case, value) => {
    await expect(compileWith(value)).rejects.toThrow(MessagingKeysError);
  });

  it('starts with a valid key', async () => {
    const moduleRef = await compileWith(
      `k1:${randomBytes(32).toString('base64')}`,
    );

    expect(moduleRef.get(MessageCrypto).currentKeyId).toBe('k1');
  });
});
