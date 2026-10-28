import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class RegisterOfflineDeviceDto {
  @IsUUID('4')
  installationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  deviceName!: string;

  @IsIn(['windows', 'macos', 'linux'])
  platform!: 'windows' | 'macos' | 'linux';

  @IsString()
  @MinLength(32)
  @MaxLength(8192)
  publicKey!: string;
}
