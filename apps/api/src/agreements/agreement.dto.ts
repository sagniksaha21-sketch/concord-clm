import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from 'class-validator';

class SectionDto {
  @IsString() @Matches(/\S/) @MaxLength(500) heading!: string;
  @IsString() @MaxLength(50000) body!: string;
}
export class SaveDraftDto {
  @IsInt() @Min(0) revision!: number;
  @IsOptional() @IsString() @MaxLength(120) templateId?: string;
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => SectionDto) sections!: SectionDto[];
}
export class StartDraftDto {
  @IsInt() @Min(0) revision!: number;
  @IsString() @Matches(/\S/) @MaxLength(120) templateId!: string;
}
export class AgreementTransitionDto {
  @IsInt() @Min(0) revision!: number;
  @IsIn(['review', 'drafting']) stage!: 'review' | 'drafting';
}
export class CreateAgreementDto {
  @IsString() @Matches(/\S/) @MaxLength(160) title!: string;
  @IsString() @Matches(/\S/) @MaxLength(180) counterparty!: string;
  @IsString() @Matches(/\S/) @MaxLength(120) type!: string;
}
export class ReviseAgreementDto {
  @IsInt() @Min(0) revision!: number;
  @IsString() @Matches(/\S/) @MaxLength(2000) reason!: string;
}
export class AgreementObligationDto {
  @IsUUID() id!: string;
  @IsInt() @Min(0) revision!: number;
  @IsString() @Matches(/\S/) @MaxLength(200) title!: string;
  @IsIn(['renewal','notice','payment','reporting','service','insurance','privacy','milestone','other']) type!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) dueDate!: string;
  @IsEmail() @MaxLength(254) ownerEmail!: string;
  @IsString() @Matches(/\S/) @MaxLength(4000) evidence!: string;
  @IsBoolean() completed!: boolean;
}
