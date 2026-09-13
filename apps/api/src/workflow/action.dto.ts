import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApprovalActionDto {
  @IsString()
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class InAppApprovalActionDto {
  @IsIn(['approved', 'rejected', 'changes-requested']) decision!: 'approved' | 'rejected' | 'changes-requested';
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}
