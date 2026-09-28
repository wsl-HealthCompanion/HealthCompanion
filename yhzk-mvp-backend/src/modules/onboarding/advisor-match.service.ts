import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdvisorMatch } from './advisor-match.entity';

/**
 * 4维度顾问匹配服务
 * MVP 阶段使用简化的随机匹配 + 降级策略
 * Phase 2 将对接真实顾问数据库 + 地域匹配 + 疾病专科匹配
 */
export interface AdvisorMatchResult {
  advisorId: string;
  advisorName: string;
  matchScore: number;
  dimensionScores: {
    disease: number;
    region: number;
    load: number;
    random: number;
  };
}

@Injectable()
export class AdvisorMatchService {
  private readonly logger = new Logger(AdvisorMatchService.name);

  // MVP 阶段: 虚拟顾问池
  private readonly advisors = [
    { id: 'advisor-001', name: '李医生', specialties: ['高血压', '糖尿病'], region: '北京' },
    { id: 'advisor-002', name: '王医生', specialties: ['糖尿病', '冠心病'], region: '上海' },
    { id: 'advisor-003', name: '张医生', specialties: ['高血压', '高血脂'], region: '广州' },
  ];

  constructor(
    @InjectRepository(AdvisorMatch)
    private readonly advisorMatchRepo: Repository<AdvisorMatch>,
  ) {}

  /**
   * 4维度顾问匹配算法:
   *   disease (权重40%): 疾病专科匹配度
   *   region  (权重25%): 地域匹配度
   *   load    (权重20%): 顾问负载均衡
   *   random  (权重15%): 随机因子(避免热门顾问过载)
   */
  async match(
    userId: string,
    profileData: Record<string, any>,
  ): Promise<AdvisorMatchResult> {
    // 提取用户疾病信息
    const userDiseases = this.extractDiseases(profileData);

    // MVP 简化: 使用加权随机匹配
    const matchResult = this.simplifiedMatch(userDiseases);

    // 保存匹配记录
    const record = this.advisorMatchRepo.create({
      user_id: userId,
      advisor_id: matchResult.advisorId,
      match_score: matchResult.matchScore,
      dimension_scores: matchResult.dimensionScores,
      is_fallback: matchResult.matchScore < 50,
    });
    await this.advisorMatchRepo.save(record);

    this.logger.log(
      `Matched user ${userId} → advisor ${matchResult.advisorId} (score: ${matchResult.matchScore})`,
    );

    return matchResult;
  }

  /**
   * 从档案数据中提取疾病列表
   */
  private extractDiseases(profileData: Record<string, any>): string[] {
    const step2a = profileData['step2a'];
    if (step2a?.diseases && Array.isArray(step2a.diseases)) {
      return step2a.diseases.map((d: any) => d.name || d);
    }
    return [];
  }

  /**
   * MVP 简化匹配算法
   * Phase 2: 对接真实顾问库, 使用 KNN + 加权排序
   */
  private simplifiedMatch(userDiseases: string[]): AdvisorMatchResult {
    // 计算每位顾问的疾病匹配分
    const scored = this.advisors.map((advisor) => {
      let diseaseScore = 60; // 基础分

      if (userDiseases.length > 0) {
        const matched = userDiseases.filter((d) =>
          advisor.specialties.some((s) => d.includes(s) || s.includes(d)),
        );
        diseaseScore = matched.length > 0 ? 85 : 50;
      }

      const regionScore = 70; // MVP: 固定地域分
      const loadScore = 60 + Math.random() * 20;
      const randomScore = Math.random() * 100;

      // 加权综合得分
      const totalScore =
        diseaseScore * 0.40 +
        regionScore * 0.25 +
        loadScore * 0.20 +
        randomScore * 0.15;

      return {
        advisor,
        totalScore,
        dimensions: {
          disease: diseaseScore,
          region: regionScore,
          load: Math.round(loadScore),
          random: Math.round(randomScore),
        },
      };
    });

    // 选取得分最高的顾问
    scored.sort((a, b) => b.totalScore - a.totalScore);
    const best = scored[0];

    return {
      advisorId: best.advisor.id,
      advisorName: best.advisor.name,
      matchScore: Math.round(best.totalScore),
      dimensionScores: best.dimensions,
    };
  }
}
