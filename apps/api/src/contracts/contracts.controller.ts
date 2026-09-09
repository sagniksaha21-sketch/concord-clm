import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { Roles } from '../auth/rbac';
import { CreateContractDto, UpdateContractDto } from './contract.dto';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}
  @Roles('contract:read') @Get() list() { return this.contracts.listFresh(); }
  @Roles('contract:read') @Get(':id') get(@Param('id') id:string) { return this.contracts.getByIdFresh(id); }
  @Roles('contract:write') @Post() create(@Body() dto:CreateContractDto) { return this.contracts.create(dto); }
  @Roles('contract:write') @Patch(':id') update(@Param('id') id:string,@Body() dto:UpdateContractDto) { return this.contracts.update(id,dto); }
}
