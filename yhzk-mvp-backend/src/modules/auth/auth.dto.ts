import {
  IsString,
  IsOptional,
  IsPhoneNumber,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ===== 请求 DTO =====

export class WechatLoginDto {
  @ApiProperty({ description: 'wx.login() 返回的 code', example: '0b1xxxxx' })
  @IsString()
  @Length(1, 128)
  code!: string;

  @ApiPropertyOptional({ description: '扫码报到的顾问ID' })
  @IsOptional()
  @IsUUID('4')
  advisor_id?: string;
}

export class SendSmsCodeDto {
  @ApiProperty({ description: '手机号', example: '13800138000' })
  @IsPhoneNumber('CN')
  phone!: string;

  @ApiPropertyOptional({ description: '验证码类型', enum: ['login', 'verify'], default: 'login' })
  @IsOptional()
  @IsString()
  type?: string;
}

export class PhoneLoginDto {
  @ApiProperty({ description: '手机号', example: '13800138000' })
  @IsPhoneNumber('CN')
  phone!: string;

  @ApiProperty({ description: '6位短信验证码', example: '123456' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: '验证码为6位数字' })
  code!: string;

  @ApiPropertyOptional({ description: '扫码报到的顾问ID' })
  @IsOptional()
  @IsUUID('4')
  advisor_id?: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'refresh token' })
  @IsString()
  @Length(1, 512)
  refreshToken!: string;
}

// ===== 响应 DTO =====

export class LoginUserInfo {
  @ApiProperty({ description: '用户ID' })
  id!: string;

  @ApiProperty({ description: '用户状态', enum: ['guest', 'registered', 'profiled', 'active'] })
  status!: string;

  @ApiProperty({ description: '是否有健康档案' })
  profileExists!: boolean;

  @ApiProperty({ description: '是否已绑定顾问' })
  advisorBound!: boolean;

  @ApiProperty({ description: '是否开启老年模式' })
  isElderly!: boolean;

  @ApiProperty({ description: '是否开启关怀模式' })
  careMode!: boolean;
}

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken!: string;

  @ApiProperty({ description: 'refresh token' })
  refreshToken!: string;

  @ApiProperty({ description: '过期时间(秒)', example: 604800 })
  expiresIn!: number;

  @ApiProperty({ description: '是否首次登录' })
  isNewUser!: boolean;

  @ApiProperty({ description: '用户基本信息' })
  user!: LoginUserInfo;
}

export class SendCodeResponseDto {
  @ApiProperty({ description: '验证码有效期(秒)', example: 300 })
  expiresIn!: number;

  @ApiProperty({ description: '重发间隔(秒)', example: 60 })
  retryAfter!: number;
}

export class RefreshTokenResponseDto {
  @ApiProperty({ description: '新的 JWT access token' })
  accessToken!: string;

  @ApiProperty({ description: '新的 refresh token (滚动刷新)' })
  refreshToken!: string;

  @ApiProperty({ description: '过期时间(秒)', example: 604800 })
  expiresIn!: number;
}
