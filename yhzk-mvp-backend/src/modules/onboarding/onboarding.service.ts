import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthProfile, ProfileStep } from './health-profile.entity';
import { User, UserStatus } from '../auth/entities/user.entity';
import { AdvisorMatchService, AdvisorMatchResult } from './advisor-match.service';
import { AdvisorMatch } from './advisor-match.entity';
import { ErrorCode } from '../../common/filters/all-exceptions.filter';
import { RagService } from '../chat/rag/rag.service';
import { redisConfig, RedisKeys } from '../../config/redis.config';
import {
  ProfileProgressDto,
  SaveStepDto,
  SaveStepResponseDto,
  SkipStepDto,
  SkipStepResponseDto,
  SubmitProfileResponseDto,
  STEP_ORDER,
  STEP_NEXT,
  SKIPPABLE_STEPS,
} from './onboarding.dto';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);
  private readonly redis = redisConfig();

  constructor(
    @InjectRepository(HealthProfile)
    private readonly profileRepo: Repository<HealthProfile>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AdvisorMatch)
    private readonly advisorMatchRepo: Repository<AdvisorMatch>,
    private readonly advisorMatchService: AdvisorMatchService,
    private readonly ragService: RagService,
  ) {}

  // ============================================================
  // 获取建档进度
  // ============================================================

  async getProfile(userId: string): Promise<ProfileProgressDto> {
    const profile = await this.getOrCreateProfile(userId);
    return this.mapProfileToDto(profile);
  }

  // ============================================================
  // 保存/更新步骤数据
  // ============================================================

  async saveStep(
    userId: string,
    step: string,
    dto: SaveStepDto,
  ): Promise<SaveStepResponseDto> {
    const profile = await this.getOrCreateProfile(userId);

    if (profile.status === 'submitted') {
      throw new BadRequestException({
        code: ErrorCode.PROFILE_ALREADY_SUBMITTED,
        message: '档案已提交,不可修改',
      });
    }

    // 保存步骤数据到 profile_data JSONB
    const stepData: Record<string, any> = {};

    // 标准化字段
    if (dto.name !== undefined) stepData.name = dto.name;
    if (dto.gender !== undefined) {
      // 兼容中文性别输入
      stepData.gender = (dto.gender === '男' || dto.gender === 'male') ? 'male' : 'female';
    }
    if (dto.birthDate !== undefined) stepData.birthDate = dto.birthDate;
    if (dto.height !== undefined) stepData.height = dto.height;
    if (dto.weight !== undefined) stepData.weight = dto.weight;

    // 收集小程序传来的其他字段(diseases/allergies/medications/advisor等)
    for (const key of ['diseases', 'allergies', 'medications', 'advisor', 'assessmentDoctor', 'specialistDoctor']) {
      if ((dto as any)[key] !== undefined) stepData[key] = (dto as any)[key];
    }
    if (dto.extra !== undefined) Object.assign(stepData, dto.extra);

    // 合并数据
    const currentData = typeof profile.profile_data === 'string'
      ? JSON.parse(profile.profile_data)
      : profile.profile_data;
    const mergedData = { ...currentData, [step]: stepData };
    // 显式 JSON 序列化(SQLite TEXT 列不能自动处理对象)
    profile.profile_data = JSON.stringify(mergedData) as any;
    profile.current_step = step as ProfileStep;
    profile.updated_at = new Date();

    await this.profileRepo.save(profile);

    // 档案更新后清除 Redis 缓存 — 下次 AI 聊天时重新查 DB 生成最新摘要
    try {
      await this.redis.del(RedisKeys.USER_PROFILE(userId));
    } catch { /* Redis 不可用时忽略 */ }

    // 计算下一步
    const nextStep = this.getNextStep(step, profile.skipped_steps);
    const isComplete = step === ProfileStep.STEP5;

    // 软校验警告
    const validationWarnings = this.validateStep(step, stepData);

    return {
      currentStep: step,
      nextStep: nextStep || '',
      isComplete,
      validationWarnings,
    };
  }

  // ============================================================
  // 跳过步骤
  // ============================================================

  async skipStep(
    userId: string,
    dto: SkipStepDto,
  ): Promise<SkipStepResponseDto> {
    const profile = await this.getOrCreateProfile(userId);

    if (profile.status === 'submitted') {
      throw new BadRequestException({
        code: ErrorCode.PROFILE_ALREADY_SUBMITTED,
        message: '档案已提交',
      });
    }

    if (!SKIPPABLE_STEPS.includes(dto.step)) {
      throw new BadRequestException({
        code: ErrorCode.PROFILE_VALIDATION_ERROR,
        message: `步骤 ${dto.step} 不支持跳过`,
      });
    }

    if (!profile.skipped_steps.includes(dto.step)) {
      profile.skipped_steps = [...profile.skipped_steps, dto.step];
    }

    const nextStep = this.getNextStep(dto.step, profile.skipped_steps);
    profile.current_step = dto.step as ProfileStep;
    await this.profileRepo.save(profile);

    return {
      skippedSteps: profile.skipped_steps,
      nextStep: nextStep || '',
    };
  }

  // ============================================================
  // 提交档案
  // ============================================================

  async submitProfile(userId: string): Promise<SubmitProfileResponseDto> {
    const profile = await this.getOrCreateProfile(userId);

    if (profile.status === 'submitted') {
      throw new BadRequestException({
        code: ErrorCode.PROFILE_ALREADY_SUBMITTED,
        message: '档案已提交',
      });
    }

    // 检查草稿是否过期
    if (profile.draft_expiry <= new Date()) {
      throw new BadRequestException({
        code: ErrorCode.PROFILE_DRAFT_EXPIRED,
        message: '草稿已过期,请重新填写',
      });
    }

    // 校验必填步骤
    const missingSteps = this.getMissingRequiredSteps(profile);
    if (missingSteps.length > 0) {
      throw new BadRequestException({
        code: ErrorCode.PROFILE_VALIDATION_ERROR,
        message: `请补全以下步骤: ${missingSteps.join(', ')}`,
      });
    }

    // 更新状态
    profile.status = 'submitted';
    profile.submitted_at = new Date();
    profile.current_step = ProfileStep.STEP5;
    await this.profileRepo.save(profile);

    // 更新用户状态: registered → profiled
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user && user.status === UserStatus.REGISTERED) {
      user.status = UserStatus.PROFILED;
      await this.userRepo.save(user);
    }

    // 解析 profile_data (SQLite TEXT 列返回原始 JSON 字符串)
    const profileData: Record<string, any> = typeof profile.profile_data === 'string'
      ? JSON.parse(profile.profile_data)
      : profile.profile_data;

    // 顾问匹配
    const matchResult = await this.advisorMatchService.match(userId, profileData);

    this.logger.log(`Profile submitted for user ${userId}, matched advisor: ${matchResult.advisorId}`);

    // 异步同步到 Milvus(user_knowledge),不阻塞提交响应
    this.syncProfileToMilvus(userId, profileData).catch(err =>
      this.logger.warn(`Milvus sync failed (non-blocking): ${err.message}`),
    );

    return {
      profileId: profile.id,
      status: 'submitted',
      advisorMatch: {
        advisorId: matchResult.advisorId,
        advisorName: matchResult.advisorName,
        matchScore: matchResult.matchScore,
        matchDimensions: matchResult.dimensionScores,
      },
      nextPage: 'advisorWelcome',
    };
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private async getOrCreateProfile(userId: string): Promise<HealthProfile> {
    // 确保 User 记录存在 (demo 用户首次建档时自动创建)
    await this.ensureUserExists(userId);

    let profile = await this.profileRepo.findOne({
      where: { user_id: userId },
    });

    if (!profile) {
      profile = this.profileRepo.create({
        user_id: userId,
        current_step: ProfileStep.STEP1,
        status: 'draft',
        profile_data: '{}' as any,  // SQLite TEXT 列需要字符串
        draft_expiry: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      });
      await this.profileRepo.save(profile);
    }

    return profile;
  }

  private getNextStep(currentStep: string, skippedSteps: string[]): string {
    let next = STEP_NEXT[currentStep];
    // 自动跳过已跳过的步骤
    while (next && skippedSteps.includes(next)) {
      next = STEP_NEXT[next];
    }
    return next || '';
  }

  private getMissingRequiredSteps(profile: HealthProfile): string[] {
    const missing: string[] = [];
    const skippedSet = new Set(profile.skipped_steps);

    // SQLite TEXT 列存的是 JSON 字符串, 需要解析
    const pd = typeof profile.profile_data === 'string'
      ? JSON.parse(profile.profile_data) : profile.profile_data;

    for (const [step] of Object.entries(STEP_ORDER)) {
      if (skippedSet.has(step)) continue;
      if (SKIPPABLE_STEPS.includes(step)) continue;
      const data = pd[step];
      if (!data || Object.keys(data).length === 0) {
        missing.push(step);
      }
    }

    return missing;
  }

  /**
   * 确保 User 记录存在 (demo 用户首次建档时自动创建)
   */
  private async ensureUserExists(userId: string): Promise<void> {
    try {
      const existing = await this.userRepo.findOne({ where: { id: userId } });
      if (!existing) {
        const user = this.userRepo.create({ id: userId, status: UserStatus.REGISTERED });
        await this.userRepo.save(user);
        this.logger.log(`Auto-created user ${userId}`);
      }
    } catch (e) {
      this.logger.warn(`Failed to ensure user ${userId}: ${e}`);
    }
  }

  // ============================================================
  // Milvus 同步(用户专属知识库)
  // ============================================================

  /**
   * 将用户健康档案转为可检索的文本描述
   */
  private profileToDocumentText(
    userId: string,
    profileData: Record<string, any>,
  ): { id: string; text: string; metadata: Record<string, any> } {
    const parts: string[] = [];
    const step1 = profileData['step1'] || {};

    if (step1.name) parts.push(`用户姓名: ${step1.name}`);
    if (step1.gender) parts.push(`性别: ${step1.gender === 'male' ? '男' : '女'}`);
    if (step1.birthDate) {
      const age = Math.floor((Date.now() - new Date(step1.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000));
      parts.push(`年龄: ${age}岁`);
    }
    if (step1.height) parts.push(`身高: ${step1.height}cm`);
    if (step1.weight) parts.push(`体重: ${step1.weight}kg`);

    // 病史 (step2a)
    const step2aData = profileData['step2a'];
    if (step2aData) {
      const diseases: string[] = [];
      if (Array.isArray(step2aData.diseases)) {
        diseases.push(...step2aData.diseases.map((d: any) => d.name || d));
      } else if (Array.isArray(step2aData)) {
        diseases.push(...step2aData.map((d: any) => d.name || d));
      }
      if (diseases.length > 0) {
        parts.push(`既往病史: ${diseases.join('、')}`);
      }
    }

    // 过敏 (step2b)
    const step2bData = profileData['step2b'];
    if (step2bData) {
      const allergies: string[] = [];
      if (Array.isArray(step2bData.allergies)) {
        allergies.push(...step2bData.allergies.map((a: any) => a.name || a));
      } else if (Array.isArray(step2bData)) {
        allergies.push(...step2bData.map((a: any) => a.name || a));
      }
      if (allergies.length > 0) {
        parts.push(`过敏史: ${allergies.join('、')}`);
      }
    }

    // 用药 (step2c)
    const step2cData = profileData['step2c'];
    if (step2cData) {
      const meds: string[] = [];
      if (Array.isArray(step2cData.medications)) {
        meds.push(...step2cData.medications.map((m: any) => {
          const name = m.name || m;
          const dosage = m.dosage ? ` ${m.dosage}` : '';
          const freq = m.frequency || '';
          return `${name}${dosage}${freq ? ' ' + freq : ''}`;
        }));
      } else if (Array.isArray(step2cData)) {
        meds.push(...step2cData.map((m: any) => {
          const name = m.name || m;
          const dosage = m.dosage ? ` ${m.dosage}` : '';
          const freq = m.frequency || '';
          return `${name}${dosage}${freq ? ' ' + freq : ''}`;
        }));
      }
      if (meds.length > 0) {
        parts.push(`当前用药: ${meds.join('、')}`);
      }
    }

    // 生活习惯 (step3a/b/c)
    for (const [stepKey, label] of [['step3a', '饮食偏好'], ['step3b', '运动习惯'], ['step3c', '睡眠情况']] as const) {
      const data = profileData[stepKey];
      if (data) {
        const items: string[] = [];
        if (typeof data === 'string') {
          items.push(data);
        } else if (typeof data === 'object') {
          for (const [k, v] of Object.entries(data)) {
            if (v && typeof v === 'string' && v.length > 0) items.push(`${k}:${v}`);
          }
        }
        if (items.length > 0) parts.push(`${label}: ${items.join(', ')}`);
      }
    }

    const text = parts.join('。\n');
    if (!text) return null as any;

    return {
      id: `profile_${userId}`,
      text,
      metadata: {
        user_id: userId,
        type: 'health_profile',
        updated_at: new Date().toISOString(),
      },
    };
  }

  /**
   * 同步用户档案到 Milvus(异步,不阻塞)
   */
  private async syncProfileToMilvus(
    userId: string,
    profileData: Record<string, any>,
  ): Promise<void> {
    try {
      const doc = this.profileToDocumentText(userId, profileData);
      if (!doc) return;

      await this.ragService.indexDocument('user_knowledge', doc);

      this.logger.log(`Synced profile to Milvus for user ${userId}`);
    } catch (error) {
      this.logger.warn(`Failed to sync profile to Milvus: ${error}`);
    }
  }

  private validateStep(step: string, data: Record<string, any>): string[] {
    const warnings: string[] = [];

    if (step === ProfileStep.STEP1) {
      if (data.height && data.weight) {
        const bmi = data.weight / ((data.height / 100) ** 2);
        if (bmi < 18.5) warnings.push('BMI 偏低,建议关注营养');
        else if (bmi >= 24 && bmi < 28) warnings.push('BMI 偏重,建议控制饮食');
        else if (bmi >= 28) warnings.push('BMI 属于肥胖范围,建议咨询顾问');
      }
      if (data.birthDate) {
        const age = (Date.now() - new Date(data.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000);
        if (age >= 60) warnings.push('已自动开启关怀模式');
      }
    }

    return warnings;
  }

  private mapProfileToDto(profile: HealthProfile): ProfileProgressDto {
    return {
      id: profile.id,
      currentStep: profile.current_step,
      status: profile.status,
      profileData: profile.profile_data,
      skippedSteps: profile.skipped_steps,
      draftExpiry: profile.draft_expiry.toISOString(),
    };
  }
}
