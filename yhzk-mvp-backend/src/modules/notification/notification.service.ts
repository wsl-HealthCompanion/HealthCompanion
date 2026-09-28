import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsConfig } from '../../config/sms.config';
import { SendCodeResponseDto } from './notification.dto';

/**
 * 通知服务
 * 负责: 腾讯云短信发送、语音验证码
 * MVP: 短信验证码
 * Phase 2: 推送通知、站内信、邮件
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly smsConfig: SmsConfig;

  constructor(private configService: ConfigService) {
    this.smsConfig = new SmsConfig(configService);
  }

  /**
   * 发送短信验证码
   * 生产环境: 腾讯云 SMS API
   * 开发环境: 控制台打印
   */
  async sendSms(phone: string, type: string = 'login'): Promise<SendCodeResponseDto> {
    const code = this.generateCode();

    if (process.env.NODE_ENV === 'development') {
      this.logger.log(`[DEV] SMS code for ${phone} (${type}): ${code}`);
      return {
        expiresIn: this.smsConfig.rateLimit.codeExpiry,
        retryAfter: this.smsConfig.rateLimit.sendInterval,
      };
    }

    // 生产环境: 调用腾讯云 SMS
    try {
      const tencentcloud = require('tencentcloud-sdk-nodejs');
      const SmsClient = tencentcloud.sms.v20210111.Client;

      const client = new SmsClient({
        credential: {
          secretId: this.smsConfig.secretId,
          secretKey: this.smsConfig.secretKey,
        },
        region: this.smsConfig.region,
      });

      await client.SendSms({
        SmsSdkAppId: this.smsConfig.smsAppId,
        SignName: this.smsConfig.signName,
        TemplateId: this.smsConfig.templateId,
        TemplateParamSet: [code],
        PhoneNumberSet: [`+86${phone}`],
      });

      this.logger.log(`SMS sent to ${phone}`);
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${phone}: ${error}`);
      throw error;
    }

    return {
      expiresIn: this.smsConfig.rateLimit.codeExpiry,
      retryAfter: this.smsConfig.rateLimit.sendInterval,
    };
  }

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
