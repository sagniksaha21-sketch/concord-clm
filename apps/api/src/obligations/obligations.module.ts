import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ESignModule } from '../esign/esign.module';
import { ObligationsController } from './obligations.controller';
import { ObligationsService } from './obligations.service';

/**
 * Imports ESignModule so obligations are derived from the LIVE signature store
 * rather than the sample fixtures (finding C-D21). ESignModule does not import
 * this one, so there is no cycle.
 */
@Module({
  imports: [NotificationsModule, ESignModule],
  controllers: [ObligationsController],
  providers: [ObligationsService],
  exports: [ObligationsService],
})
export class ObligationsModule {}
