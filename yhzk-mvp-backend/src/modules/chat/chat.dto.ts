import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsIn, Length } from 'class-validator';

// ===== 发送消息请求 =====

export class SendMessageDto {
  @ApiProperty({ description: '用户消息内容', example: '我最近血压怎么样' })
  @IsString()
  @Length(1, 500)
  message!: string;

  @ApiPropertyOptional({ description: '会话ID(恢复会话用)', example: 'sess_xxx' })
  @IsOptional()
  sessionId?: string;

  @ApiPropertyOptional({ description: '消息类型', enum: ['text', 'quick_reply'], default: 'text' })
  @IsOptional()
  @IsIn(['text', 'quick_reply'])
  type?: string;

  @ApiPropertyOptional({ description: '用户档案上下文(小程序传)' })
  @IsOptional()
  profile?: any;
}

// ===== 会话列表响应 =====

export class ChatSessionDto {
  @ApiProperty({ description: '会话ID' })
  sessionId!: string;

  @ApiProperty({ description: '最后一条消息预览' })
  lastMessage!: string;

  @ApiProperty({ description: '最后活跃时间' })
  lastActive!: string;

  @ApiProperty({ description: '消息数' })
  messageCount!: number;

  @ApiProperty({ description: '上下文级别: full/summary/new' })
  contextLevel!: string;
}

export class ChatSessionsResponseDto {
  @ApiProperty({ description: '会话列表' })
  items!: ChatSessionDto[];

  @ApiProperty({ description: '总数' })
  total!: number;
}

// ===== 历史消息响应 =====

export class ChatMessageDto {
  @ApiProperty({ description: '消息ID' })
  id!: string;

  @ApiProperty({ description: '角色: user/assistant/system' })
  role!: string;

  @ApiProperty({ description: '消息内容' })
  content!: string;

  @ApiPropertyOptional({ description: '意图分类' })
  intent?: string;

  @ApiPropertyOptional({ description: '引用来源' })
  citations?: Array<{ source: string; text: string }>;

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;
}

export class ChatMessagesResponseDto {
  @ApiProperty({ description: '消息列表' })
  items!: ChatMessageDto[];
}
