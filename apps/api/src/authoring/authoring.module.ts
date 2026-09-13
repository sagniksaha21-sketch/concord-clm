import { Module } from '@nestjs/common';
import { AuthoringController } from './authoring.controller';
import { AuthoringService } from './authoring.service';

@Module({
  controllers: [AuthoringController],
  providers: [AuthoringService],
  exports: [AuthoringService],
})
export class AuthoringModule {}
