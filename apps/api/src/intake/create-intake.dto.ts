import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateIntakeDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsString() @IsNotEmpty() counterparty!: string;
  @IsString() @IsNotEmpty() businessUnit!: string;
  @IsEmail() requestor!: string;
  @IsString() @IsNotEmpty() description!: string;
  @IsOptional() @IsString() contractType?: string;
}
