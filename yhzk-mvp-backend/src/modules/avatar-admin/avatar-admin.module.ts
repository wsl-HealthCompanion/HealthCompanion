import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditModule } from '../admin-audit/admin-audit.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AvatarAdminController } from './avatar-admin.controller';
import { AvatarInternalController } from './avatar-internal.controller';
import { AvatarAdminService } from './avatar-admin.service';
import { AvatarAdminStore } from './avatar-admin.store';
import { AvatarInternalGuard } from './avatar-internal.guard';
import { AvatarRuntimeClient } from './avatar-runtime.client';
import { AvatarGenerationTask } from './entities/avatar-generation-task.entity';
import { DigitalHumanAvatar } from './entities/digital-human-avatar.entity';
import { UserAvatarAssignment } from './entities/user-avatar-assignment.entity';
import { UploadTicketService } from './upload-ticket.service';
import { UserAvatarAssignmentService } from './user-avatar-assignment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DigitalHumanAvatar,
      AvatarGenerationTask,
      UserAvatarAssignment,
    ]),
    AdminAuthModule,
    AdminAuditModule,
  ],
  controllers: [AvatarAdminController, AvatarInternalController],
  providers: [
    AvatarAdminStore,
    UploadTicketService,
    AvatarRuntimeClient,
    AvatarAdminService,
    UserAvatarAssignmentService,
    AvatarInternalGuard,
  ],
  exports: [AvatarAdminService, UserAvatarAssignmentService],
})
export class AvatarAdminModule {}
