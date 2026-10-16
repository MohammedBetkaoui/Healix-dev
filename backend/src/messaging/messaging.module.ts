import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { MessageCrypto } from './message-crypto';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagingUsersService } from './messaging-users.service';

// Messaging (docs/messaging-design.md). The backend does not start without
// valid MESSAGING_KEYS: a message is never stored in clear text.
@Module({
  imports: [ConfigModule, PrismaModule, AuditLogsModule, WorkspaceModule],
  controllers: [ConversationsController, MessagesController],
  providers: [
    {
      provide: MessageCrypto,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        MessageCrypto.fromEnv(config.get<string>('MESSAGING_KEYS')),
    },
    ConversationsService,
    MessagesService,
    MessagingUsersService,
  ],
  exports: [MessageCrypto],
})
export class MessagingModule {}
