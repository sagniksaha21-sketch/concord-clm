import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsInt, IsOptional, Max, Min } from 'class-validator';

export class DigestRunDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  to?: string[];
}

export class ReminderDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  to?: string[];
}
