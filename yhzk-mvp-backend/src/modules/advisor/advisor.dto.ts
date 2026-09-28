import { ApiProperty } from '@nestjs/swagger';

export class AdvisorInfoDto {
  @ApiProperty({ description: '顾问ID' })
  id!: string;

  @ApiProperty({ description: '顾问姓名' })
  name!: string;

  @ApiProperty({ description: '职称' })
  title!: string;

  @ApiProperty({ description: '头像URL' })
  avatar!: string;

  @ApiProperty({ description: '专长领域' })
  specialties!: string[];

  @ApiProperty({ description: '从业年限' })
  yearsOfExperience!: number;

  @ApiProperty({ description: '欢迎语' })
  greeting!: string;

  @ApiProperty({ description: '二维码URL (用于扫码报到)' })
  qrCode!: string;
}

export class MyAdvisorDto {
  @ApiProperty({ description: '顾问信息' })
  advisor!: AdvisorInfoDto;

  @ApiProperty({ description: '匹配时间' })
  matchedAt!: string;

  @ApiProperty({ description: '匹配得分' })
  matchScore!: number;
}
