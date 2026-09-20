import { Body, Controller, Get, Post, Req, ConflictException, ForbiddenException, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { can, normalizeRole } from '@concord/shared';
import { Roles } from '../auth/rbac';
import { PrismaService } from '../persistence/prisma.service';
import { AuditService } from '../audit/audit.service';

class ConditionsDto {
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(160, { each: true }) risks?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(160, { each: true }) agreementTypes?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(160, { each: true }) businessUnits?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(160, { each: true }) jurisdictions?: string[];
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1e15) minimumValue?: number;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsBoolean() personalData?: boolean;
  @IsOptional() @IsBoolean() exclusivity?: boolean;
  @IsOptional() @IsBoolean() indemnity?: boolean;
}
class PolicyDto {
  @IsUUID() id!: string;
  @IsInt() @Min(0) revision!: number;
  @IsString() @Matches(/\S/) @MaxLength(160) name!: string;
  @IsBoolean() enabled!: boolean;
  @ValidateNested() @Type(() => ConditionsDto) conditions!: ConditionsDto;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsEmail({}, { each: true }) approvers!: string[];
}
@Controller('approval-policies') @Roles('admin')
export class ApprovalPolicyController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  private db() { if (!this.prisma.enabled) throw new ServiceUnavailableException('Approval policies require saved records.'); return this.prisma.client; }
  @Get() async list() {
    const [policies, users] = await Promise.all([this.db().approvalPolicy.findMany({ orderBy: { name: 'asc' } }), this.db().user.findMany({ select: { id: true, name: true, email: true, role: true } })]);
    return { policies, approvers: users.filter((u: any) => can(normalizeRole(u.role), 'approve')).map(({ id, name, email }: any) => ({ id, name, email })) };
  }
  @Post() async save(@Body() dto: PolicyDto, @Req() req: any) {
    if (!dto.conditions || dto.conditions.minimumValue !== undefined && !dto.conditions.currency) throw new BadRequestException('Choose a currency for a value threshold.');
    const approvers = [...new Set(dto.approvers.map(e => e.trim().toLowerCase()))];
    await this.db().$transaction(async (tx: any) => {
      // Serializes policy edits with routing evaluations across replicas.
      await tx.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock(728461)');
      const previous = await tx.approvalPolicy.findUnique({ where: { id: dto.id } });
      if ((previous?.revision ?? 0) !== dto.revision) throw new ConflictException('This policy changed. Refresh before saving.');
      for (const email of approvers) {
        const user = await tx.user.findUnique({ where: { email } });
        if (!user || !can(normalizeRole(user.role), 'approve')) throw new ForbiddenException('Select current authorised approvers.');
      }
      const data = { name: dto.name.trim(), enabled: dto.enabled, conditions: dto.conditions, approvers, revision: dto.revision + 1, updatedBy: req.user.id };
      await tx.approvalPolicy.upsert({ where: { id: dto.id }, create: { id: dto.id, ...data }, update: data });
      await this.audit.recordInTransaction(tx, { actor: req.user, action: 'approval.policy_saved', entity: 'approval-policy', entityId: dto.id, summary: `Approval policy ${dto.enabled ? 'enabled' : 'disabled'}: ${dto.name.trim()}`, metadata: { previous, ...data } });
    });
    return this.list();
  }
}
