import { Module } from '@nestjs/common';
import { IntakeModule } from '../intake/intake.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClientRequestsController } from './client-requests.controller';
import { ClientRequestsService } from './client-requests.service';
import { RequestInboxController } from './request-inbox.controller';
import { RequestInboxService } from './request-inbox.service';
import { RequestAttachmentsController } from './request-attachments.controller';

@Module({ imports: [IntakeModule, NotificationsModule], controllers: [ClientRequestsController, RequestInboxController, RequestAttachmentsController], providers: [ClientRequestsService, RequestInboxService], exports: [ClientRequestsService, RequestInboxService] })
export class ClientRequestsModule {}
