import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { MessageCrypto } from './message-crypto';

// Messaging (docs/messaging-design.md). The backend does not start without
// valid MESSAGING_KEYS: a message is never stored in clear text.
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MessageCrypto,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        MessageCrypto.fromEnv(config.get<string>('MESSAGING_KEYS')),
    },
  ],
  exports: [MessageCrypto],
})
export class MessagingModule {}
