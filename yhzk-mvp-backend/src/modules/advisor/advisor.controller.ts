import {
  Controller,
  Get,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { AdvisorService } from './advisor.service';
import { AdvisorInfoDto, MyAdvisorDto } from './advisor.dto';

@ApiTags('Advisor — 顾问')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('advisor')
export class AdvisorController {
  constructor(private readonly advisorService: AdvisorService) {}

  /**
   * GET /api/v1/advisor/my
   * 获取我的专属顾问
   */
  @Get('my')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取我的专属顾问' })
  @ApiResponse({ status: 200, description: '顾问信息 + 匹配详情' })
  async getMyAdvisor(@CurrentUser() user: JwtPayload): Promise<MyAdvisorDto> {
    return this.advisorService.getMyAdvisor(user.sub);
  }

  /**
   * GET /api/v1/advisor/:advisorId
   * 获取顾问信息
   */
  @Get(':advisorId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取顾问信息' })
  @ApiResponse({ status: 200, description: '顾问详情' })
  async getAdvisor(
    @CurrentUser() user: JwtPayload,
    @Param('advisorId') advisorId: string,
  ): Promise<AdvisorInfoDto> {
    return this.advisorService.getAdvisorInfo(advisorId);
  }
}
