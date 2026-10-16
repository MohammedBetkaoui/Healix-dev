import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ConversationType } from '@prisma/client';

import {
  CONVERSATION_PAGE_LIMIT_DEFAULT,
  CONVERSATION_PAGE_LIMIT_MAX,
  GROUP_MEMBERS_MAX,
} from '../messaging-rules';

// Ids are cuids; 64 characters leave room without accepting anything long.
const ID_MAX_LENGTH = 64;
// Checked again after sanitizeTextInput (1 to 120 characters).
const RAW_TITLE_MAX_LENGTH = 400;

// POST /messaging/conversations. CASE, REFERRAL and SUPPORT are refused by
// the service with CONVERSATION_TYPE_NOT_AVAILABLE.
export class CreateConversationDto {
  @IsEnum(ConversationType)
  type!: ConversationType;

  // DIRECT: the other professional.
  @ValidateIf((dto: CreateConversationDto) => dto.type === 'DIRECT')
  @IsString()
  @IsNotEmpty()
  @MaxLength(ID_MAX_LENGTH)
  participantId?: string;

  // GROUP: its name and its members, the creator aside.
  @ValidateIf((dto: CreateConversationDto) => dto.type === 'GROUP')
  @IsString()
  @MaxLength(RAW_TITLE_MAX_LENGTH)
  title?: string;

  @ValidateIf((dto: CreateConversationDto) => dto.type === 'GROUP')
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(GROUP_MEMBERS_MAX)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(ID_MAX_LENGTH, { each: true })
  participantIds?: string[];
}

export const CONVERSATION_LIST_STATUSES = [
  'active',
  'pending',
  'archived',
] as const;
export type ConversationListStatus =
  (typeof CONVERSATION_LIST_STATUSES)[number];

// GET /messaging/conversations. status: "active" (default), "pending" (the
// contact requests received), "archived".
export class ListConversationsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @IsIn([ConversationType.DIRECT, ConversationType.GROUP])
  type?: ConversationType;

  @IsOptional()
  @IsIn(CONVERSATION_LIST_STATUSES)
  status?: ConversationListStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CONVERSATION_PAGE_LIMIT_MAX)
  @IsOptional()
  limit?: number = CONVERSATION_PAGE_LIMIT_DEFAULT;
}

// PATCH /messaging/conversations/:id. mutedUntil: null to unmute.
export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(RAW_TITLE_MAX_LENGTH)
  title?: string;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @ValidateIf((dto: UpdateConversationDto) => dto.mutedUntil !== null)
  @IsISO8601({ strict: true })
  mutedUntil?: string | null;
}

// POST /messaging/conversations/:id/participants
export class AddParticipantsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(GROUP_MEMBERS_MAX)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(ID_MAX_LENGTH, { each: true })
  userIds!: string[];
}
