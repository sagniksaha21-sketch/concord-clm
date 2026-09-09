import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { AuthoringService } from './authoring.service';
import { GenerateDraftDto } from './generate-draft.dto';
import { TemplateDto } from './template.dto';
import { Roles } from '../auth/rbac';

@Controller('authoring')
export class AuthoringController {
  constructor(private readonly authoring: AuthoringService) {}

  @Get('templates')
  templates() {
    return this.authoring.listTemplates();
  }

  @Get('clauses')
  clauses() {
    return this.authoring.listClauses();
  }

  @Roles('template:write')
  @Post('templates')
  create(@Body() dto: TemplateDto) {
    return this.authoring.createTemplate(dto);
  }

  @Roles('template:write')
  @Put('templates/:id')
  update(@Param('id') id: string, @Body() dto: TemplateDto) {
    return this.authoring.updateTemplate(id, dto);
  }

  @Roles('template:write')
  @Delete('templates/:id')
  remove(@Param('id') id: string) {
    return this.authoring.deleteTemplate(id);
  }

  /** Generate a first draft from a template + clause library. */
  @Roles('contract:write')
  @Post('draft')
  draft(@Body() dto: GenerateDraftDto) {
    return this.authoring.generateDraft(dto);
  }
}
