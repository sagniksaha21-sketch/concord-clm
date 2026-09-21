import { RoundAnalysisService } from './round-analysis.service';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiReviewModule } from '../ai-review/ai-review.module';
import { GuestAuthService } from './guest-auth.service';
import { GuestDeliveryService } from './guest-delivery.service';
import { GuestBrowserGuard } from './guest-browser.guard';
import { NegotiationService } from './negotiation.service';
import { NegotiationController, GuestNegotiationController, GuestAccessController } from './negotiation.controller';
@Module({ imports: [NotificationsModule,AiReviewModule], controllers: [NegotiationController,GuestNegotiationController,GuestAccessController], providers: [RoundAnalysisService,GuestAuthService,GuestDeliveryService,GuestBrowserGuard,NegotiationService] })
export class NegotiationModule {}
