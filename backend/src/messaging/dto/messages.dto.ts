import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MessagePriority } from '@prisma/client';

import {
  ATTACHMENTS_PER_MESSAGE_MAX,
  MESSAGE_PAGE_LIMIT_DEFAULT,
  MESSAGE_PAGE_LIMIT_MAX,
} from '../messaging-rules';

// The body is checked again after normalization (1 to 4,000 characters);
// this bound only stops oversized payloads early.
const RAW_BODY_MAX_LENGTH = 20_000;

// POST /messaging/conversations/:id/messages. Any other field is refused by
// the ValidationPipe.
export class SendMessageDto {
  // Chosen by the client: sending it again returns the same message.
  @IsUUID()
  clientMessageId!: string;

  // Empty only with attachments (checked by the service).
  @IsString()
  @MaxLength(RAW_BODY_MAX_LENGTH)
  body!: string;

  @IsOptional()
  @IsEnum(MessagePriority)
  priority?: MessagePriority;

  // With priority URGENT only (ACK_REQUIRES_URGENT otherwise).
  @IsOptional()
  @IsBoolean()
  requiresAck?: boolean;

  // Files uploaded beforehand to this conversation by the sender.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ATTACHMENTS_PER_MESSAGE_MAX)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(64, { each: true })
  attachmentIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  replyToId?: string;
}

// PATCH /messaging/messages/:id
export class EditMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(RAW_BODY_MAX_LENGTH)
  body!: string;
}

// GET /messaging/conversations/:id/messages. beforeSeq: the page before (the
// history, scrolling up); afterSeq: what followed (catching up after a
// reconnection); neither: the latest page.
export class ListMessagesQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  beforeSeq?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  afterSeq?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MESSAGE_PAGE_LIMIT_MAX)
  @IsOptional()
  limit?: number = MESSAGE_PAGE_LIMIT_DEFAULT;
}

// POST /messaging/conversations/:id/read
export class MarkReadDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  seq!: number;
}

// POST /messaging/messages/:id/file-to-record. The comment is checked again
// after normalization (1,000 characters at most).
export class FileToRecordDto {
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  comment?: string;
}
