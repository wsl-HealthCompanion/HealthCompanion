import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 腾讯云短信配置
 * 用于发送短信验证码 (登录 / 验证)
 *
 * SDK: tencentcloud-sdk-nodejs
 * 接口: sms.tencentcloudapi.com
 * 参数: PhoneNumberSet, SmsSdkAppId, SignName, TemplateId, TemplateParamSet
 */
@Injectable()
export class SmsConfig {
  public readonly secretId: string;
  public readonly secretKey: string;
  public readonly smsAppId: string;
  public readonly signName: string;
  public readonly templateId: string;
  public readonly region: string;

  constructor(private configService: ConfigService) {
    this.secretId = this.configService.get<string>('TENCENT_SECRET_ID', '');
    this.secretKey = this.configService.get<string>('TENCENT_SECRET_KEY', '');
    this.smsAppId = this.configService.get<string>('TENCENT_SMS_APP_ID', '');
    this.signName = this.configService.get<string>('TENCENT_SMS_SIGN', '炎华众康');
    this.templateId = this.configService.get<string>('TENCENT_SMS_TEMPLATE_ID', '');
    this.region = 'ap-guangzhou';
  }

  /**
   * 短信发送限制
   */
  readonly rateLimit = {
    sendInterval: 60,       // 同手机号重发间隔(秒)
    dailyLimit: 10,         // 同手机号日发送上限
    codeLength: 6,          // 验证码位数
    codeExpiry: 300,        // 验证码有效期(秒)
  } as const;
}
