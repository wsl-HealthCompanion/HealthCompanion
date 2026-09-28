import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VisemePoint } from '../dto/sse-event.dto';

/**
 * TTS + Viseme 口型服务
 * 生产环境: 腾讯云 TTS (长文本版, 带逐字时间戳)
 * MVP 开发环境: 返回模拟数据
 *
 * 参考: MVP-SPEC §8.5
 */
@Injectable()
export class TTSService {
  private readonly logger = new Logger(TTSService.name);
  private readonly secretId: string;
  private readonly secretKey: string;

  constructor(private configService: ConfigService) {
    this.secretId = this.configService.get<string>('TENCENT_SECRET_ID', '');
    this.secretKey = this.configService.get<string>('TENCENT_SECRET_KEY', '');
  }

  /**
   * 生成 TTS 音频 + 口型时间轴
   * @param text 播报文本
   * @param speed 语速 (0.85 老年模式 / 1.0 正常)
   * @returns audioUrl, durationSec, visemeTimeline
   */
  async synthesize(
    text: string,
    speed: number = 1.0,
  ): Promise<{
    audioUrl: string;
    durationSec: number;
    visemeTimeline: VisemePoint[];
  }> {
    if (process.env.NODE_ENV === 'development') {
      return this.synthesizeDev(text, speed);
    }

    return this.synthesizeProd(text, speed);
  }

  /**
   * 生产环境: 腾讯云 TTS
   */
  private async synthesizeProd(
    text: string,
    speed: number,
  ): Promise<{
    audioUrl: string;
    durationSec: number;
    visemeTimeline: VisemePoint[];
  }> {
    try {
      const tencentcloud = require('tencentcloud-sdk-nodejs');
      const TtsClient = tencentcloud.tts.v20190823.Client;

      const client = new TtsClient({
        credential: {
          secretId: this.secretId,
          secretKey: this.secretKey,
        },
        region: 'ap-guangzhou',
      });

      const result = await client.CreateTtsTask({
        Text: text,
        VoiceType: 1001,          // 亲切女声
        Speed: speed,
        Volume: 5,
        EnableSubtitle: true,     // 获取逐字时间戳
        Codec: 'mp3',
      });

      // 从 Subtitles 构建口型时间轴
      const subtitles = result.Subtitles || [];
      const visemeTimeline = this.buildVisemeTimeline(text, subtitles);

      return {
        audioUrl: result.AudioUrl,
        durationSec: subtitles.length > 0
          ? subtitles[subtitles.length - 1].EndTime / 1000
          : text.length * 0.3,
        visemeTimeline,
      };
    } catch (error) {
      this.logger.error(`TTS synthesis failed: ${error}`);

      // 降级: 返回模拟数据
      return this.synthesizeDev(text, speed);
    }
  }

  /**
   * 开发环境: 模拟 TTS 数据
   */
  private async synthesizeDev(
    text: string,
    speed: number,
  ): Promise<{
    audioUrl: string;
    durationSec: number;
    visemeTimeline: VisemePoint[];
  }> {
    // 估算时长: 中文约4字/秒
    const durationSec = Math.max(1, (text.length / 4) / speed);
    const visemeTimeline: VisemePoint[] = [];

    // 生成模拟口型时间轴
    visemeTimeline.push({ t: 0, v: 'rest' });

    const steps = Math.min(text.length, 20);
    const visemes = ['rest', 'aa', 'ee', 'ih', 'oh', 'cl', 'th', 'sz', 'rest'];
    for (let i = 0; i < steps; i++) {
      visemeTimeline.push({
        t: Math.round((durationSec * (i + 1) / steps) * 100) / 100,
        v: visemes[i % visemes.length],
      });
    }

    visemeTimeline.push({ t: Math.round(durationSec * 100) / 100, v: 'rest' });

    return {
      audioUrl: `https://tts.example.com/dev/${Buffer.from(text).toString('base64').substring(0, 32)}.mp3`,
      durationSec,
      visemeTimeline,
    };
  }

  /**
   * 文本 → 拼音 → 口型时间轴
   * 中文音素→口型映射表 (参考 MVP-SPEC §8.5)
   */
  private buildVisemeTimeline(
    text: string,
    subtitles: Array<{ Text: string; BeginTime: number; EndTime: number }>,
  ): VisemePoint[] {
    const timeline: VisemePoint[] = [{ t: 0, v: 'rest' }];

    for (const sub of subtitles) {
      const t = sub.BeginTime / 1000;
      const viseme = this.getVisemeForChar(sub.Text);

      if (timeline.length === 0 || timeline[timeline.length - 1].v !== viseme) {
        timeline.push({ t: Math.round(t * 100) / 100, v: viseme });
      }
    }

    const endTime = subtitles.length > 0
      ? subtitles[subtitles.length - 1].EndTime / 1000
      : 1;
    timeline.push({ t: Math.round(endTime * 100) / 100, v: 'rest' });

    return timeline;
  }

  /**
   * 简单的中文字符→口型映射
   */
  private getVisemeForChar(char: string): string {
    // 基于字符的简单启发式映射
    const code = char.charCodeAt(0);
    // 大部分中文字符分布在Unicode 0x4E00-0x9FFF
    if (code >= 0x4E00 && code <= 0x9FFF) {
      const visemes = ['aa', 'ee', 'ih', 'oh', 'uu', 'cl'];
      return visemes[code % visemes.length];
    }
    return 'rest';
  }
}
