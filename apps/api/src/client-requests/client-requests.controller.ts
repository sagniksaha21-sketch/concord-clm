import { Body, Controller, Get, Header, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../auth/rbac';
import { ClientRequestsService } from './client-requests.service';
import { CreateClientRequestDto, UpdateClientRequestDto } from './client-request.dto';

@Controller('requests')
@Roles('request:read')
export class ClientRequestsController {
  constructor(private readonly requests: ClientRequestsService) {}
  @Get('options') @Header('Cache-Control', 'private, no-store')
  options(@Req() req: any) { return this.requests.options(req.user); }
  @Get() @Header('Cache-Control', 'private, no-store')
  list(@Req() req: any, @Query('view') view?: string) { return this.requests.list(req.user, view); }
  @Get(':id') @Header('Cache-Control', 'private, no-store')
  get(@Param('id') id: string, @Req() req: any) { return this.requests.get(id, req.user); }
  @Post() @Roles('request:write')
  create(@Body() body: CreateClientRequestDto, @Req() req: any) { return this.requests.create(body, req.user); }
  @Patch(':id') @Roles('request:manage')
  update(@Param('id') id: string, @Body() body: UpdateClientRequestDto, @Req() req: any) { return this.requests.update(id, body, req.user); }
}
