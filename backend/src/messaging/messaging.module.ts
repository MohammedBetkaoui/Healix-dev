import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PatientsModule } from '../patients/patients.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { AttachmentCleanupScheduler } from './attachment-cleanup.scheduler';
import { AttachmentStorage } from './attachment-storage';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { CaseRecordService } from './case-record.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { DirectoryController } from './directory.controller';
import { DirectoryService } from './directory.service';
import { MessageCrypto } from './message-crypto';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagingEvents } from './messaging-events';
import { MessagingUsersService } from './messaging-users.service';

// Messaging (docs/messaging-design.md). The backend does not start without
// valid MESSAGING_KEYS: a message or a file is never stored in clear text.
// PatientsModule: the patient scope of the case discussions, the patient's
// audit trail, the record's documents.
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditLogsModule,
    PatientsModule,
    RealtimeModule,
    WorkspaceModule,
  ],
  controllers: [
    ConversationsController,
    MessagesController,
    AttachmentsController,
    DirectoryController,
  ],
  providers: [
    {
      provide: MessageCrypto,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        MessageCrypto.fromEnv(config.get<string>('MESSAGING_KEYS')),
    },
    AttachmentCleanupScheduler,
    AttachmentStorage,
    AttachmentsService,
    CaseRecordService,
    ConversationsService,
    DirectoryService,
    MessagesService,
    MessagingEvents,
    MessagingUsersService,
  ],
  exports: [MessageCrypto],
})
export class MessagingModule {}
