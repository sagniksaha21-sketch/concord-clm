import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const STAGES = ['intake','drafting','review','approval','signature','active','renewal'] as const;
const RISKS = ['low','medium','high'] as const;

export class CreateContractDto {
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) counterparty!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) type!: string;
  @IsString() @IsOptional() @MaxLength(80) valueDisplay?: string;
  @IsIn(STAGES) @IsOptional() stage?: typeof STAGES[number];
  @IsIn(RISKS) @IsOptional() risk?: typeof RISKS[number];
  @IsString() @IsOptional() @MaxLength(40) version?: string;
  @IsString() @IsOptional() @MaxLength(160) source?: string;
}

export class UpdateContractDto {
  @IsString() @IsOptional() @MaxLength(200) title?: string;
  @IsString() @IsOptional() @MaxLength(200) counterparty?: string;
  @IsString() @IsOptional() @MaxLength(120) type?: string;
  @IsString() @IsOptional() @MaxLength(80) valueDisplay?: string;
  @IsIn(STAGES) @IsOptional() stage?: typeof STAGES[number];
  @IsIn(RISKS) @IsOptional() risk?: typeof RISKS[number];
  @IsString() @IsOptional() @MaxLength(40) version?: string;
  @IsString() @IsOptional() @MaxLength(160) source?: string;
}
