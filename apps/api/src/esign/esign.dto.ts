import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SignatoryDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MaxLength(180)
  role!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  order?: number;
}

export class StampPaperDto {
  @IsString()
  @MaxLength(100)
  state!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  article?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  considerationAmount?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dutyAmount!: number;

  @IsString()
  @MaxLength(160)
  paidBy!: string;
}

export class CreateSignatureDto {
  @IsString()
  @MaxLength(120)
  contractId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  contractTitle?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SignatoryDto)
  signatories!: SignatoryDto[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => StampPaperDto)
  stampPaper?: StampPaperDto;
}

export class NudgeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}
