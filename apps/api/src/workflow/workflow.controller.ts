import { Body, Controller, Get, Headers, Param, Post, Req, Res } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { ApprovalDto } from './approval.dto';
import { Public, Roles } from '../auth/rbac';
import { ApprovalActionDto, InAppApprovalActionDto } from './action.dto';

@Controller('contracts/:id/approval')
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Roles('approval:route')
  @Post()
  approve(@Param('id') id: string, @Body() dto: ApprovalDto, @Req() req: any) {
    return this.workflow.requestApproval(id, dto, req?.user?.email);
  }

  @Get('workspace') @Roles('contract:read')
  workspace(@Param('id') id: string, @Req() req: any) { return this.workflow.approvalWorkspace(id, req.user); }
  @Post('workspace') @Roles('approval:route')
  routeInApp(@Param('id') id: string, @Body() dto: ApprovalDto, @Req() req: any) { return this.workflow.routeInApp(id, dto, req.user); }
  @Post('decision') @Roles('approve')
  decide(@Param('id') id: string, @Body() dto: InAppApprovalActionDto, @Req() req: any) { return this.workflow.decideInApp(id, dto, req.user); }

  /** Callback hit by the Outlook Adaptive Card Approve/Reject buttons. */
  @Public()
  @Post('action')
  async action(
    @Param('id') id: string,
    @Body() body: ApprovalActionDto,
    @Headers('authorization') auth: string,
    @Res({ passthrough: true }) res: { setHeader: (k: string, v: string) => void },
  ) {
    const result = await this.workflow.recordCardAction(id, body, auth);
    // Tells Outlook to replace the card with the refresh card in the body.
    res.setHeader('CARD-UPDATE-IN-BODY', 'true');
    return result.refreshCard;
  }
}
