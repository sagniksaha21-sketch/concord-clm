import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IntakeService } from './intake.service';
import { CreateIntakeDto } from './create-intake.dto';
import { Roles } from '../auth/rbac';

@Controller('intake')
export class IntakeController {
  constructor(private readonly intake: IntakeService) {}

  @Get()
  list() {
    return this.intake.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.intake.getById(id);
  }

  /** Submit a request; returns it AI-triaged (type, template, risk). */
  @Roles('intake:write')
  @Post()
  create(@Body() dto: CreateIntakeDto) {
    return this.intake.create(dto);
  }
}
