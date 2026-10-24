import { Type } from 'class-transformer';
import { IsNumber, IsOptional } from 'class-validator';

// Both together, or none (the windowing of the file is used).
export class RenderDicomInstanceQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  windowCenter?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  windowWidth?: number;
}
