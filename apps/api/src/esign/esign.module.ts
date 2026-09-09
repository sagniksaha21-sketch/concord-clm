import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContractsModule } from '../contracts/contracts.module';
import { ESignController } from './esign.controller';
import { ESignService } from './esign.service';
import { MelentoService } from './melento.service';

@Module({
  imports: [NotificationsModule, ContractsModule],
  controllers: [ESignController],
  providers: [ESignService, MelentoService],
  exports: [ESignService],
})
export class ESignModule {}
