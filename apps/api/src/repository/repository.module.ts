import { Module } from '@nestjs/common';
import { RepositoryController } from './repository.controller';
import { RepositoryService } from './repository.service';
import { ESignModule } from '../esign/esign.module';
import { ContractsModule } from '../contracts/contracts.module';

@Module({
  imports: [ESignModule, ContractsModule],
  controllers: [RepositoryController],
  providers: [RepositoryService],
})
export class RepositoryModule {}
