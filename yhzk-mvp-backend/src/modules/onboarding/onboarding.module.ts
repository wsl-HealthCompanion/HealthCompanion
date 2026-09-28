import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { AdvisorMatchService } from './advisor-match.service';
import { HealthProfile } from './health-profile.entity';
import { User } from '../auth/entities/user.entity';
import { AdvisorMatch } from './advisor-match.entity';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([HealthProfile, User, AdvisorMatch]),
    ChatModule, // 引入 RagService
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService, AdvisorMatchService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
