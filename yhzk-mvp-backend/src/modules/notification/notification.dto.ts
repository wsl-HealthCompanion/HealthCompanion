import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsPhoneNumber, IsOptional, IsString } from 'class-validator';

export class SendNotificationDto {
  @ApiProperty({ description: '手机号', example: '13800138000' })
  @IsPhoneNumber('CN')
  phone!: string;

  @ApiPropertyOptional({ description: '验证码类型', enum: ['login', 'verify'], default: 'login' })
  @IsOptional()
  @IsString()
  type?: string;
}

export class SendCodeResponseDto {
  @ApiProperty({ description: '验证码有效期(秒)', example: 300 })
  expiresIn!: number;

  @ApiProperty({ description: '重发间隔(秒)', example: 60 })
  retryAfter!: number;
}
