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
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { AdminAuthDtoRequest, requestMeta } from '../admin-auth/admin-request';
import {
  AdminUserListQueryDto,
  AdminUserView,
  CreateAdminUserDto,
  UpdateAdminUserDto,
} from './admin-user.dto';
import { AdminUserService } from './admin-user.service';

@Controller('admin/users')
@UseGuards(AdminAuthGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class AdminUserController {
  constructor(private readonly users: AdminUserService) {}

  @Get()
  listUsers(@Query() query: AdminUserListQueryDto) {
    return this.users.listUsers(query);
  }

  @Get(':userId')
  getUser(@Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string) {
    return this.users.getUser(userId);
  }

  @Post()
  createUser(@Body() body: CreateAdminUserDto, @Req() request: AdminAuthDtoRequest) {
    return this.users.createUser(body, request.admin, requestMeta(request));
  }

  @Patch(':userId')
  updateUser(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() body: UpdateAdminUserDto,
    @Req() request: AdminAuthDtoRequest,
  ) {
    return this.users.updateUser(
      userId,
      body,
      request.admin,
      requestMeta(request),
    );
  }

  @Patch(':userId/disable')
  disableUser(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Req() request: AdminAuthDtoRequest,
  ) {
    return this.users.disableUser(userId, request.admin, requestMeta(request));
  }

  @Patch(':userId/restore')
  restoreUser(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Req() request: AdminAuthDtoRequest,
  ) {
    return this.users.restoreUser(userId, request.admin, requestMeta(request));
  }

  @Delete(':userId')
  async deleteUser(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Req() request: AdminAuthDtoRequest,
  ): Promise<null> {
    await this.users.deleteUser(userId, request.admin, requestMeta(request));
    return null;
  }
}
