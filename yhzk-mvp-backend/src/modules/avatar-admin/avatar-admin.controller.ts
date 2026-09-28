import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { AdminAuthDtoRequest, requestMeta } from '../admin-auth/admin-request';
import { AvatarAdminService } from './avatar-admin.service';
import {
  AssignUserAvatarDto,
  DeleteAvatarDto,
  ReserveAvatarDto,
} from './avatar-admin.dto';
import { UserAvatarAssignmentService } from './user-avatar-assignment.service';

@Controller('admin')
@UseGuards(AdminAuthGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class AvatarAdminController {
  constructor(
    private readonly avatars: AvatarAdminService,
    private readonly audit: AdminAuditService,
    private readonly userAvatars: UserAvatarAssignmentService,
  ) {}

  @Get('users/:userId/avatar')
  getUserAvatar(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ) {
    return this.userAvatars.getUserAvatar(userId);
  }

  @Patch('users/:userId/avatar')
  assignUserAvatar(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() body: AssignUserAvatarDto,
    @Req() request: AdminAuthDtoRequest,
  ) {
    return this.userAvatars.assignUserAvatar(
      userId,
      body,
      request.admin,
      requestMeta(request),
    );
  }

  @Get('avatars')
  listAvatars() {
    return this.avatars.listAvatars();
  }

  @Get('avatars/summary')
  async summary() {
    const view = await this.avatars.listAvatars();
    return {
      runtimeOnline: view.runtimeOnline,
      testAvatarId: view.testAvatarId,
      defaultAvatarId: view.avatars.find((avatar) => avatar.isDefault)?.id ?? null,
      readyAvatarCount: view.avatars.filter((avatar) => avatar.status === 'ready').length,
      totalAvatarCount: view.avatars.length,
    };
  }

  @Post('avatars')
  reserve(@Body() body: ReserveAvatarDto, @Req() request: AdminAuthDtoRequest) {
    return this.avatars.reserveAvatar(body, request.admin, requestMeta(request));
  }

  @Get('avatars/tasks')
  async listTasks() {
    return { tasks: await this.avatars.listTasks() };
  }

  @Get('avatars/:avatarId/preview')
  async preview(
    @Param('avatarId') avatarId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const preview = await this.avatars.getPreview(avatarId);
    response.setHeader('Content-Type', preview.contentType);
    response.setHeader('Cache-Control', 'private, max-age=300');
    return new StreamableFile(preview.bytes);
  }

  @Get('avatars/:avatarId/delete-check')
  deletionCheck(@Param('avatarId') avatarId: string) {
    return this.avatars.deletionCheck(avatarId);
  }

  @Delete('avatars/:avatarId')
  deleteAvatar(
    @Param('avatarId') avatarId: string,
    @Body() body: DeleteAvatarDto,
    @Req() request: AdminAuthDtoRequest,
  ) {
    return this.avatars.deleteAvatar(
      avatarId,
      body.confirmationId,
      request.admin,
      requestMeta(request),
    );
  }

  @Patch('avatars/:avatarId/default')
  async setDefault(
    @Param('avatarId') avatarId: string,
    @Req() request: AdminAuthDtoRequest,
  ) {
    await this.avatars.setDefaultAvatar(avatarId, request.admin, requestMeta(request));
    return { avatarId, isDefault: true };
  }

  @Post('avatars/:avatarId/test-run')
  testRun(
    @Param('avatarId') avatarId: string,
    @Req() request: AdminAuthDtoRequest,
  ) {
    return this.avatars.testRunAvatar(avatarId, request.admin, requestMeta(request));
  }

  @Get('audit')
  async recentAudit(
    @Query('limit') limitInput?: string,
    @Query('resourceType') resourceType?: string,
  ) {
    const limit = Number.parseInt(limitInput ?? '20', 10);
    return {
      entries: await this.audit.listRecent(Number.isFinite(limit) ? limit : 20, resourceType),
    };
  }
}
