import { Global, Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';

/** Global so any module (Repository today, others later) can inject it. */
@Global()
@Module({
  providers: [EmbeddingsService],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}
