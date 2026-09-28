import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { AdminAuthDtoRequest, requestMeta } from './admin-request';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { isAdminCookieSecure } from './admin-cookie-options';
import { AdminLoginDto } from './admin-auth.dto';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly config: ConfigService,
    private readonly audit: AdminAuditService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() body: AdminLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body.username, body.password, requestMeta(request));
    response.cookie('yhzk_admin_session', result.token, {
      httpOnly: true,
      secure: isAdminCookieSecure(this.config),
      sameSite: 'strict',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });
    return { admin: result.admin };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(AdminAuthGuard)
  async logout(
    @Req() request: AdminAuthDtoRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.clearCookie('yhzk_admin_session', {
      httpOnly: true,
      secure: isAdminCookieSecure(this.config),
      sameSite: 'strict',
      path: '/',
    });
    const meta = requestMeta(request);
    await this.audit.record({
      adminUserId: request.admin.id,
      action: 'ADMIN_LOGOUT',
      resourceType: 'admin_user',
      resourceId: request.admin.id,
      success: true,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return { loggedOut: true };
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  me(@Req() request: AdminAuthDtoRequest) {
    return { admin: request.admin };
  }
}
