import { IsIn, IsString, MaxLength } from 'class-validator';

import { REPORT_SECTION_IDS } from '../report-constants';

export class ReportSectionDto {
  @IsIn(REPORT_SECTION_IDS)
  id!: string;

  @IsString()
  @MaxLength(8000)
  body!: string;
}
