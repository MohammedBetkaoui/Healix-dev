import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegulatoryDetailsDto {
  @IsBoolean()
  acknowledgement!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  carnetReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
