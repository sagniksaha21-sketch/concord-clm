import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module';
import { ClientRequestsModule } from '../client-requests/client-requests.module';
import { AuthoringModule } from '../authoring/authoring.module';
import { AgreementsController } from './agreements.controller';
import { AgreementsService } from './agreements.service';
@Module({ imports: [ContractsModule, ClientRequestsModule, AuthoringModule], controllers: [AgreementsController], providers: [AgreementsService] })
export class AgreementsModule {}
