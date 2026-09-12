import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { AGREEMENT_TYPES, REQUEST_STATUSES } from '@concord/shared';

export class TermSheetDto {
  @IsString() @Matches(/\S/) @MaxLength(5000) scope!: string;
  @IsOptional() @IsString() @MaxLength(2500) deliverables?: string;
  @IsOptional() @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) amount?: string;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsOptional() @IsString() @MaxLength(2000) paymentTerms?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) renewalTerms?: string;
  @IsOptional() @IsString() @MaxLength(2000) terminationTerms?: string;
  @IsOptional() @IsString() @MaxLength(240) governingLaw?: string;
  @IsOptional() @IsString() @MaxLength(1500) counterpartyAddress?: string;
  @IsOptional() @IsEmail() @MaxLength(254) counterpartyContactEmail?: string;
  @IsIn(['none', 'personal', 'sensitive', 'unsure']) dataInvolved!: 'none' | 'personal' | 'sensitive' | 'unsure';
  @IsOptional() @IsString() @MaxLength(4000) specialInstructions?: string;
}

export class CreateClientRequestDto {
  @IsUUID('4') submissionKey!: string;
  @IsString() @Matches(/\S/) @MaxLength(160) title!: string;
  @IsString() @Matches(/\S/) @MaxLength(180) counterparty!: string;
  @IsString() @Matches(/\S/) @MaxLength(120) businessUnit!: string;
  @IsIn(AGREEMENT_TYPES) contractType!: typeof AGREEMENT_TYPES[number];
  @IsString() @IsNotEmpty() @MaxLength(120) assignedLegalUserId!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) requestedByDate!: string;
  @IsIn(['standard', 'urgent']) urgency!: 'standard' | 'urgent';
  @IsObject() @ValidateNested() @Type(() => TermSheetDto) terms!: TermSheetDto;
}

export class UpdateClientRequestDto {
  @IsIn(Object.keys(REQUEST_STATUSES)) status!: keyof typeof REQUEST_STATUSES;
  @IsOptional() @IsString() @MaxLength(2000) legalNote?: string;
  @IsInt() @Min(0) version!: number;
}
