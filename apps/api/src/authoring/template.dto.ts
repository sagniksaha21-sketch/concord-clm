import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TemplateDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() contractType!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) clauseIds?: string[];
}
