import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { REPORT_FOCUSES, REPORT_THEMES, ReportFocus, ReportOptions, ReportTheme } from '@concord/shared';

export class ReportOptionsDto implements ReportOptions {
  @IsOptional() @IsIn(Object.keys(REPORT_THEMES))
  theme?: ReportTheme;

  @IsOptional() @IsIn(Object.keys(REPORT_FOCUSES))
  focus?: ReportFocus;

  @IsOptional() @IsString() @MaxLength(1500)
  prompt?: string;

  @IsOptional() @IsString() @MaxLength(160)
  query?: string;

  @IsOptional() @IsInt() @Min(1) @Max(365)
  horizonDays?: number;
}
