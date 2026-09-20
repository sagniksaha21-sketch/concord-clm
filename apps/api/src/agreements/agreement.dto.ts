import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from 'class-validator';

export class SectionDto {
  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9_-]+$/) @MaxLength(100) id?: string;
  @IsOptional() @IsIn(['clause', 'paragraph']) kind?: 'clause' | 'paragraph';
  @IsString() @Matches(/\S/) @MaxLength(500) heading!: string;
  @IsString() @MaxLength(50000) body!: string;
}
export class SaveDraftDto {
  @IsOptional() @IsBoolean() prepareExternalCopy?: boolean;
  @IsOptional() @IsBoolean() confirmTrackedChanges?: boolean;
  @IsInt() @Min(0) revision!: number;
  @IsOptional() @IsString() @MaxLength(120) templateId?: string;
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => SectionDto) sections!: SectionDto[];
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(2000) reason?: string;
  @IsOptional() @IsUUID() sourceDocumentId?: string;
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
export class AgreementCommentDto {
  @IsUUID() id!: string;
  @IsUUID() documentId!: string;
  @IsOptional() @IsString() @MaxLength(100) sectionId?: string;
  @IsString() @Matches(/\S/) @MaxLength(6000) body!: string;
  @IsOptional() @IsUUID() parentId?: string;
}
export class ResolveCommentDto {
  @IsBoolean() resolved!: boolean;
}
export class RewriteSectionDto {
  @IsInt() @Min(0) revision!: number;
  @IsString() @Matches(/\S/) @MaxLength(500) heading!: string;
  @IsString() @Matches(/\S/) @MaxLength(20000) body!: string;
  @IsString() @Matches(/\S/) @MaxLength(2000) instruction!: string;
}
export class CreateAmendmentDto {
  @IsUUID() id!: string;
  @IsString() @Matches(/\S/) @MaxLength(160) title!: string;
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
