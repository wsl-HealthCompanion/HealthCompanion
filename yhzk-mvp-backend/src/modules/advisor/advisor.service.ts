import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdvisorMatch } from '../onboarding/advisor-match.entity';
import { AdvisorInfoDto, MyAdvisorDto } from './advisor.dto';
import { ErrorCode } from '../../common/filters/all-exceptions.filter';

/**
 * 顾问模块服务
 * MVP 阶段使用虚拟顾问数据
 * Phase 2: 对接真实顾问数据库 + 顾问工作站
 */
@Injectable()
export class AdvisorService {
  private readonly logger = new Logger(AdvisorService.name);

  // MVP 虚拟顾问数据 (与 advisor-match.service.ts 同步)
  private readonly advisors: Record<string, AdvisorInfoDto> = {
    'advisor-001': {
      id: 'advisor-001',
      name: '李医生',
      title: '资深健康管理顾问',
      avatar: 'https://cdn.yhzk.com/avatars/advisor_001.png',
      specialties: ['高血压', '糖尿病管理'],
      yearsOfExperience: 12,
      greeting: '你好,我是你的专属健康顾问李医生,很高兴为你服务!',
      qrCode: 'https://cdn.yhzk.com/qr/advisor_001.png',
    },
    'advisor-002': {
      id: 'advisor-002',
      name: '王医生',
      title: '健康管理顾问',
      avatar: 'https://cdn.yhzk.com/avatars/advisor_002.png',
      specialties: ['糖尿病', '冠心病'],
      yearsOfExperience: 8,
      greeting: '你好,我是你的专属健康顾问王医生,很高兴为你服务!',
      qrCode: 'https://cdn.yhzk.com/qr/advisor_002.png',
    },
    'advisor-003': {
      id: 'advisor-003',
      name: '张医生',
      title: '资深健康管理顾问',
      avatar: 'https://cdn.yhzk.com/avatars/advisor_003.png',
      specialties: ['高血压', '高血脂'],
      yearsOfExperience: 15,
      greeting: '你好,我是你的专属健康顾问张医生,很高兴为你服务!',
      qrCode: 'https://cdn.yhzk.com/qr/advisor_003.png',
    },
  };

  constructor(
    @InjectRepository(AdvisorMatch)
    private readonly advisorMatchRepo: Repository<AdvisorMatch>,
  ) {}

  /**
   * 获取我的专属顾问
   */
  async getMyAdvisor(userId: string): Promise<MyAdvisorDto> {
    // 查找最新的顾问匹配记录
    const match = await this.advisorMatchRepo.findOne({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });

    if (!match) {
      throw new NotFoundException({
        code: ErrorCode.ADVISOR_NOT_FOUND,
        message: '尚未匹配专属顾问,请先完成健康档案',
      });
    }

    const advisor = this.advisors[match.advisor_id];
    if (!advisor) {
      throw new NotFoundException({
        code: ErrorCode.ADVISOR_NOT_FOUND,
        message: '顾问不存在',
      });
    }

    return {
      advisor,
      matchedAt: match.created_at.toISOString(),
      matchScore: match.match_score,
    };
  }

  /**
   * 获取顾问详情
   */
  async getAdvisorInfo(advisorId: string): Promise<AdvisorInfoDto> {
    const advisor = this.advisors[advisorId];
    if (!advisor) {
      throw new NotFoundException({
        code: ErrorCode.ADVISOR_NOT_FOUND,
        message: '顾问不存在',
      });
    }

    return advisor;
  }
}
