import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GenerateDraftDto {
  @IsString() @IsNotEmpty() templateId!: string;
  @IsString() @IsNotEmpty() counterparty!: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() intakeId?: string;
}
