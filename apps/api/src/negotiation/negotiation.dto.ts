import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SectionDto } from '../agreements/agreement.dto';
export class InviteGuestDto {
  @IsUUID() id!: string;
  @IsInt() @Min(0) revision!: number;
  @IsUUID() documentId!: string;
  @IsString() @Matches(/\S/) @MaxLength(160) name!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Matches(/\S/) @MaxLength(180) organisation!: string;
  @IsISO8601() expiresAt!: string;
  @IsOptional() @IsISO8601() responseDueAt?: string;
  @IsBoolean() allowDownload!: boolean;
  @IsBoolean() allowRedline!: boolean;
  @IsBoolean() allowUpload!: boolean;
}
export class NegotiationVersionDto {
  @IsInt() @Min(0) revision!: number;
  @IsUUID() documentId!: string;
}
export class GuestEmailDto { @IsEmail() @MaxLength(254) email!: string; }
export class GuestOtpDto extends GuestEmailDto {
  @IsUUID() challengeId!: string;
  @IsString() @Matches(/^\d{6}$/) code!: string;
}
export class GuestUploadDto { @IsUUID() id!: string; @IsUUID() documentId!: string; }
export class GuestResponseDto extends GuestUploadDto { @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => SectionDto) sections!: SectionDto[]; }
export class GuestCommentDto { @IsUUID() id!: string; @IsUUID() documentId!: string; @IsString() @Matches(/\S/) @MaxLength(6000) body!: string; }
export class GuestAcceptDto { @IsUUID() documentId!: string; }
