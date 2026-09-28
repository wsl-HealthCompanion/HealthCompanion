import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { requestMeta } from '../admin-auth/admin-request';
import { AvatarAdminService } from './avatar-admin.service';
import { AvatarTaskEventDto, ExistingAvatarImportDto } from './avatar-admin.dto';
import { AvatarInternalGuard } from './avatar-internal.guard';

@Controller('internal/avatar')
@UseGuards(AvatarInternalGuard)
export class AvatarInternalController {
  constructor(private readonly avatars: AvatarAdminService) {}

  @Post('events')
  async taskEvent(@Body() body: AvatarTaskEventDto) {
    await this.avatars.handleTaskEvent({
      taskId: body.task_id,
      avatarId: body.avatar_id,
      model: body.model,
      status: body.status,
      progress: body.progress,
      errorMessage: body.error_msg ?? null,
      previewPath: body.preview_path ?? null,
      sourceVideoPath: body.source_video_path ?? null,
      startedAt: body.started_at ? new Date(body.started_at * 1000) : null,
      endedAt: body.ended_at ? new Date(body.ended_at * 1000) : null,
    });
    return { accepted: true };
  }

  @Post('import')
  importExisting(@Body() body: ExistingAvatarImportDto, @Req() request: Request) {
    return this.avatars.importExistingAvatars(
      body.avatars.map((avatar) => ({
        avatarId: avatar.avatar_id,
        model: avatar.model,
        previewPath: avatar.preview_path ?? null,
        sourceVideoPath: avatar.source_video_path ?? null,
      })),
      body.initialize_users,
      requestMeta(request),
    );
  }
}
