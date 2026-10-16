import { Type } from 'class-transformer';
import {
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
  MESSAGE_PAGE_LIMIT_DEFAULT,
  MESSAGE_PAGE_LIMIT_MAX,
} from '../messaging-rules';

// The body is checked again after normalization (1 to 4,000 characters);
// this bound only stops oversized payloads early.
const RAW_BODY_MAX_LENGTH = 20_000;

// POST /messaging/conversations/:id/messages. No attachment in lot 1: any
// other field, attachmentIds included, is refused by the ValidationPipe.
export class SendMessageDto {
  // Chosen by the client: sending it again returns the same message.
  @IsUUID()
  clientMessageId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(RAW_BODY_MAX_LENGTH)
  body!: string;

  @IsOptional()
  @IsEnum(MessagePriority)
  priority?: MessagePriority;

  // Refused with ACK_NOT_AVAILABLE until lot 4.
  @IsOptional()
  @IsBoolean()
  requiresAck?: boolean;

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
