import { SetMetadata } from '@nestjs/common';
import { Permission } from '@concord/shared';

/** Route requires the given permission(s) — enforced by RolesGuard. */
export const PERMS_KEY = 'concord:perms';
export const Roles = (...perms: Permission[]) => SetMetadata(PERMS_KEY, perms);

/** Route is open (no auth) — login, SSO, external webhooks. */
export const PUBLIC_KEY = 'concord:public';
export const Public = () => SetMetadata(PUBLIC_KEY, true);
