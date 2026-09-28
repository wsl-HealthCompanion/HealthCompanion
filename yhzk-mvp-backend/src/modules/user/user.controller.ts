import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { UserService } from './user.service';
import { UpdateUserDto, UserProfileDto } from './user.dto';

@ApiTags('User — 用户')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * GET /api/v1/user/me
   * 获取当前用户信息
   */
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取当前用户信息' })
  @ApiResponse({ status: 200, description: '用户信息' })
  async getMe(@CurrentUser() user: JwtPayload): Promise<UserProfileDto> {
    return this.userService.getProfile(user.sub);
  }

  /**
   * PUT /api/v1/user/me
   * 更新当前用户信息
   */
  @Put('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新当前用户信息' })
  @ApiResponse({ status: 200, description: '更新后的用户信息' })
  async updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateUserDto,
  ): Promise<UserProfileDto> {
    return this.userService.updateProfile(user.sub, dto);
  }
}
