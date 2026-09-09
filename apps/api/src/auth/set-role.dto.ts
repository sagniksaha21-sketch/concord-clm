import { IsIn, IsString } from 'class-validator';
import { ROLES } from '@concord/shared';

/** Body of PATCH /api/auth/users/:email/role — one of the five canonical roles. */
export class SetRoleDto {
  @IsString()
  @IsIn(ROLES as string[], { message: `role must be one of: ${ROLES.join(', ')}` })
  role!: string;
}
