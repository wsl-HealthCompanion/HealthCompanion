import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsIn,
  Min,
  Max,
  Length,
} from 'class-validator';

// ===== 建档进度响应 =====

export class ProfileProgressDto {
  @ApiProperty({ description: '档案ID' })
  id!: string;

  @ApiProperty({ description: '当前步骤' })
  currentStep!: string;

  @ApiProperty({ description: '状态: draft / submitted' })
  status!: string;

  @ApiProperty({ description: '已填写的档案数据 (按step组织)' })
  profileData!: Record<string, any>;

  @ApiProperty({ description: '已跳过的步骤列表' })
  skippedSteps!: string[];

  @ApiProperty({ description: '草稿过期时间' })
  draftExpiry!: string;
}

// ===== 保存步骤请求 (通用) =====

export class SaveStepDto {
  @ApiPropertyOptional({ description: '姓名', example: '张三' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '性别', enum: ['male', 'female', '男', '女'] })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ description: '出生日期', example: '1965-03-15' })
  @IsOptional()
  @IsString()
  birthDate?: string;

  @ApiPropertyOptional({ description: '身高(cm)', example: 170 })
  @IsOptional()
  height?: number;

  @ApiPropertyOptional({ description: '体重(kg)', example: 72 })
  @IsOptional()
  weight?: number;

  // 允许小程序传递任何额外字段(病史/过敏/用药/顾问偏好等)
  @ApiPropertyOptional({ description: '额外数据' })
  @IsOptional()
  extra?: Record<string, any>;

  // 以下字段直接接收,不做校验
  @IsOptional() diseases?: any;
  @IsOptional() allergies?: any;
  @IsOptional() medications?: any;
  @IsOptional() advisor?: any;
  @IsOptional() assessmentDoctor?: any;
  @IsOptional() specialistDoctor?: any;
}

// ===== 保存步骤响应 =====

export class SaveStepResponseDto {
  @ApiProperty({ description: '当前步骤' })
  currentStep!: string;

  @ApiProperty({ description: '下一步骤' })
  nextStep!: string;

  @ApiProperty({ description: '是否完成全部建档' })
  isComplete!: boolean;

  @ApiProperty({ description: '软校验警告列表 (不阻断)' })
  validationWarnings!: string[];
}

// ===== 跳过步骤请求 =====

export class SkipStepDto {
  @ApiProperty({
    description: '要跳过的步骤',
    enum: ['step3a', 'step3b', 'step3c'],
    example: 'step3b',
  })
  @IsString()
  @IsIn(['step3a', 'step3b', 'step3c'])
  step!: string;
}

// ===== 跳过步骤响应 =====

export class SkipStepResponseDto {
  @ApiProperty({ description: '已跳过步骤列表' })
  skippedSteps!: string[];

  @ApiProperty({ description: '下一步骤' })
  nextStep!: string;
}

// ===== 提交档案响应 =====

export class AdvisorMatchDto {
  @ApiProperty({ description: '顾问ID' })
  advisorId!: string;

  @ApiProperty({ description: '顾问姓名' })
  advisorName!: string;

  @ApiProperty({ description: '综合匹配得分 (0-100)', example: 87 })
  matchScore!: number;

  @ApiProperty({ description: '各维度得分' })
  matchDimensions!: {
    disease: number;
    region: number;
    load: number;
    random: number;
  };
}

export class SubmitProfileResponseDto {
  @ApiProperty({ description: '档案ID' })
  profileId!: string;

  @ApiProperty({ description: '状态: submitted' })
  status!: string;

  @ApiProperty({ description: '顾问匹配结果' })
  advisorMatch!: AdvisorMatchDto;

  @ApiProperty({ description: '下一步页面路由' })
  nextPage!: string;
}

// ===== 步骤映射常量 =====

export const STEP_ORDER: Record<string, number> = {
  'step1': 1,
  'step2a': 2,
  'step2b': 3,
  'step2c': 4,
  'step2d': 5,
  'step3a': 6,
  'step3b': 7,
  'step3c': 8,
  'step4': 9,
  'step5': 10,
};

export const STEP_NEXT: Record<string, string> = {
  'step1': 'step2a',
  'step2a': 'step2b',
  'step2b': 'step2c',
  'step2c': 'step2d',
  'step2d': 'step3a',
  'step3a': 'step3b',
  'step3b': 'step3c',
  'step3c': 'step4',
  'step4': 'step5',
};

export const SKIPPABLE_STEPS = ['step2a', 'step2b', 'step2c', 'step2d', 'step3a', 'step3b', 'step3c', 'step4', 'step5'];
