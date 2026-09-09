import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class IngestDocumentDto {
  @IsString()
  @MaxLength(260)
  filename!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contractId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  text?: string;
}

export class IngestBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => IngestDocumentDto)
  documents!: IngestDocumentDto[];
}

export class ValidateTaxIdsDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  pan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  gstin?: string;
}
