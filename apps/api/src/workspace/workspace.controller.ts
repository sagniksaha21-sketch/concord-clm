import { Controller, Get, Query, Req } from '@nestjs/common';
import { normalizeRole } from '@concord/shared';
import { Roles } from '../auth/rbac';
import { WorkspaceService } from './workspace.service';

/**
 * Read-only endpoints behind the Command Center, the lifecycle board, global
 * search and the notification history.
 *
 * Everything here needs `contract:read` at minimum — the lowest permission any
 * signed-in role holds — and the service then filters each result set by what
 * the caller may actually see. Nothing on these routes mutates state, so none
 * of them appear in the audit interceptor's mutating set.
 */
@Controller()
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Roles('contract:read')
  @Get('dashboard')
  dashboard(@Req() req: any) {
    return this.workspace.dashboard(normalizeRole(req.user?.role), req.user?.name);
  }

  @Roles('contract:read')
  @Get('pipeline')
  pipeline() {
    return this.workspace.board();
  }

  /**
   * Cross-entity search. The role comes from the verified JWT, never from the
   * query string — otherwise search would be a way to read past the permission
   * matrix that guards every other route.
   */
  @Roles('contract:read')
  @Get('search')
  search(@Query('q') q: string, @Query('limit') limit: string | undefined, @Req() req: any) {
    const parsed = Number(limit);
    const take = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 20;
    return this.workspace.search(q ?? '', normalizeRole(req.user?.role), take);
  }

  /**
   * Notification history is a VIEW OVER THE AUDIT TRAIL, so it carries the same
   * permission as the trail itself.
   *
   * Gating it on `contract:read` — which every signed-in role holds — made it a
   * bypass of `audit:read`: a read-only viewer could read approver emails,
   * signatory addresses and provider envelope ids out of the echoed audit
   * summaries, which is precisely the reconnaissance step of the closed
   * execution-forgery chain (S-C1), re-opened under a new route name. The
   * service additionally rebuilds each line from safe fields rather than
   * echoing the raw summary.
   */
  @Roles('audit:read')
  @Get('notifications')
  notifications(@Query('limit') limit?: string) {
    const parsed = Number(limit);
    return this.workspace.notifications(
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 50,
    );
  }

  /** Sidebar badge counts — scoped to what this role can see. */
  @Roles('contract:read')
  @Get('nav-counts')
  navCounts(@Req() req: any) {
    return this.workspace.navCounts(normalizeRole(req.user?.role));
  }
}
