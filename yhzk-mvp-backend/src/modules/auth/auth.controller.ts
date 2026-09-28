import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Headers,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from './jwt.strategy';
import {
  WechatLoginDto,
  SendSmsCodeDto,
  PhoneLoginDto,
  RefreshTokenDto,
  LoginResponseDto,
  SendCodeResponseDto,
  RefreshTokenResponseDto,
} from './auth.dto';
import { DigitalHumanSessionService } from '../digital-human/digital-human.service';

@ApiTags('Auth — 认证')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly digitalHumans: DigitalHumanSessionService,
  ) {}

  /**
   * POST /api/v1/auth/wechat/login
   * 微信授权登录
   */
  @Post('wechat/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '微信授权登录' })
  @ApiResponse({ status: 200, description: '登录成功', type: LoginResponseDto })
  async wechatLogin(@Body() dto: WechatLoginDto): Promise<LoginResponseDto> {
    return this.authService.wechatLogin(dto.code, dto.advisor_id);
  }

  /**
   * POST /api/v1/auth/phone/send-code
   * 发送短信验证码
   */
  @Post('phone/send-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发送短信验证码' })
  @ApiResponse({ status: 200, description: '发送成功', type: SendCodeResponseDto })
  async sendSmsCode(@Body() dto: SendSmsCodeDto): Promise<SendCodeResponseDto> {
    return this.authService.sendSmsCode(dto.phone, dto.type);
  }

  /**
   * POST /api/v1/auth/phone/login
   * 手机号验证码登录
   */
  @Post('phone/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '手机号验证码登录' })
  @ApiResponse({ status: 200, description: '登录成功', type: LoginResponseDto })
  async phoneLogin(@Body() dto: PhoneLoginDto): Promise<LoginResponseDto> {
    return this.authService.phoneLogin(dto.phone, dto.code, dto.advisor_id);
  }

  /**
   * POST /api/v1/auth/refresh
   * 刷新 Token
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '刷新 Token (滚动刷新)' })
  @ApiResponse({ status: 200, description: '刷新成功', type: RefreshTokenResponseDto })
  async refreshToken(@Body() dto: RefreshTokenDto): Promise<RefreshTokenResponseDto> {
    return this.authService.refreshToken(dto.refreshToken);
  }

  /**
   * POST /api/v1/auth/logout
   * 登出 (需认证)
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '登出 (需认证)' })
  @ApiResponse({ status: 200, description: '登出成功' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Headers('authorization') authHeader: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<null> {
    const token = authHeader?.replace('Bearer ', '') || '';
    await this.authService.logout(user.sub, token);
    await this.digitalHumans.revokeUserSessions(user.sub).catch(() => undefined);
    response.clearCookie('dh_media', { path: '/live/' });
    return null;
  }
}
