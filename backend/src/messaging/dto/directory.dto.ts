import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

const SEARCH_MAX_LENGTH = 100;

// GET /messaging/directory. search: a name, a speciality or a wilaya;
// speciality and wilaya narrow it further.
export class DirectoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  speciality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  wilaya?: string;
}

// GET /messaging/workspace-members: a name or a speciality.
export class WorkspaceMembersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  search?: string;
}

// PATCH /messaging/settings: listed in the directory and reachable by the
// professionals of other workspaces, or not.
export class UpdateMessagingSettingsDto {
  @IsBoolean()
  discoverableByPeers!: boolean;
}
