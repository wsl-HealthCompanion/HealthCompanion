import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { SendNotificationDto, SendCodeResponseDto } from './notification.dto';

@ApiTags('Notification — 通知')
@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * POST /api/v1/notification/sms/send
   * 发送短信验证码 (内部调用,也可独立使用)
   */
  @Post('sms/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发送短信验证码' })
  @ApiResponse({ status: 200, description: '发送结果' })
  async sendSms(@Body() dto: SendNotificationDto): Promise<SendCodeResponseDto> {
    return this.notificationService.sendSms(dto.phone, dto.type);
  }
}
