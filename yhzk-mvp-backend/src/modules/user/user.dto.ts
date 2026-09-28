import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: '关怀模式开关' })
  @IsOptional()
  @IsBoolean()
  care_mode?: boolean;
}

export class UserProfileDto {
  @ApiProperty({ description: '用户ID' })
  id!: string;

  @ApiProperty({ description: '手机号', nullable: true })
  phone!: string | null;

  @ApiProperty({ description: '用户状态' })
  status!: string;

  @ApiProperty({ description: '是否为老年人(>=60岁)' })
  isElderly!: boolean;

  @ApiProperty({ description: '关怀模式是否开启' })
  careMode!: boolean;

  @ApiProperty({ description: '注册时间' })
  createdAt!: string;

  @ApiProperty({ description: '最后登录时间', nullable: true })
  lastLoginAt!: string | null;
}
