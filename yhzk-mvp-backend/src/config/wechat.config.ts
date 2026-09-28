import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 微信小程序配置
 * 用于 code2session 换取 openid / unionid
 *
 * 接口: GET https://api.weixin.qq.com/sns/jscode2session
 * 参数: appid, secret, js_code, grant_type=authorization_code
 * 返回: { openid, session_key, unionid?, errcode?, errmsg? }
 */
@Injectable()
export class WechatConfig {
  public readonly appId: string;
  public readonly appSecret: string;
  public readonly code2sessionUrl: string;

  constructor(private configService: ConfigService) {
    this.appId = this.configService.get<string>('WECHAT_APP_ID', '');
    this.appSecret = this.configService.get<string>('WECHAT_APP_SECRET', '');
    this.code2sessionUrl = 'https://api.weixin.qq.com/sns/jscode2session';
  }

  /**
   * 获取微信 code2session 参数
   */
  getCode2SessionParams(code: string) {
    return {
      appid: this.appId,
      secret: this.appSecret,
      js_code: code,
      grant_type: 'authorization_code' as const,
    };
  }
}
