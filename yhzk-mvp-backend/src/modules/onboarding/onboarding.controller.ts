import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { OnboardingService } from './onboarding.service';
import {
  SaveStepDto,
  SkipStepDto,
  ProfileProgressDto,
  SaveStepResponseDto,
  SkipStepResponseDto,
  SubmitProfileResponseDto,
} from './onboarding.dto';

@ApiTags('Onboarding — 建档')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  /**
   * GET /api/v1/onboarding/profile
   * 获取建档进度
   */
  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取建档进度' })
  @ApiResponse({ status: 200, description: '建档进度' })
  async getProfile(@CurrentUser() user: JwtPayload): Promise<ProfileProgressDto> {
    return this.onboardingService.getProfile(user.sub);
  }

  /**
   * PUT /api/v1/onboarding/profile/step/:step
   * 保存/更新建档步骤数据
   */
  @Put('profile/step/:step')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '保存/更新建档步骤数据' })
  @ApiResponse({ status: 200, description: '保存结果' })
  async saveStep(
    @CurrentUser() user: JwtPayload,
    @Param('step') step: string,
    @Body() dto: SaveStepDto,
  ): Promise<SaveStepResponseDto> {
    return this.onboardingService.saveStep(user.sub, step, dto);
  }

  /**
   * POST /api/v1/onboarding/profile/skip-step
   * 跳过某个步骤 (仅 step3a/3b/3c 可跳过)
   */
  @Post('profile/skip-step')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '跳过某个步骤 (仅step3a/3b/3c可跳过)' })
  @ApiResponse({ status: 200, description: '跳过结果' })
  async skipStep(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SkipStepDto,
  ): Promise<SkipStepResponseDto> {
    return this.onboardingService.skipStep(user.sub, dto);
  }

  /**
   * POST /api/v1/onboarding/profile/submit
   * 提交完整档案
   */
  @Post('profile/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '提交完整档案 (触发顾问匹配)' })
  @ApiResponse({ status: 200, description: '提交结果 + 顾问匹配' })
  async submitProfile(
    @CurrentUser() user: JwtPayload,
  ): Promise<SubmitProfileResponseDto> {
    return this.onboardingService.submitProfile(user.sub);
  }
}
