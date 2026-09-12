import { IsEmail, IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { ROLES } from '@concord/shared';

/** Pre-authorise a named corporate identity. Authentication remains with Entra. */
export class CreateUserDto {
  @IsString() @Matches(/\S/) @MaxLength(160) name!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsIn(ROLES) role!: string;
}
