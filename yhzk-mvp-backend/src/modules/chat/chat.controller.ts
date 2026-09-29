import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Headers,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { ChatService } from './chat.service';
import { SendMessageDto, ChatSessionsResponseDto, ChatMessagesResponseDto } from './chat.dto';

@ApiTags('Chat — 智能对话')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  /**
   * POST /api/v1/chat/message
   * 发送消息 (SSE 流式响应)
   */
  @Post('message')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发送消息 (SSE流式响应)' })
  async sendMessage(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendMessageDto,
    @Headers('x-session-id') headerSessionId: string,
    @Res() res: Response,
  ): Promise<void> {
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲
    res.flushHeaders(); // 立即发送响应头, 防止连接超时被断开

    const sessionId = dto.sessionId || headerSessionId || null;

    try {
      const stream = this.chatService.processMessage(
        user.sub,
        sessionId,
        dto.message,
        (dto.type as 'text' | 'quick_reply') || 'text',
        dto.profile, // H5 前端传来的档案
        dto.skipTts === true,
      );

      for await (const event of stream) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      this.logger.error(`SSE stream error: ${error}`);
      res.write(`data: ${JSON.stringify({ type: 'error', code: 10000, message: '服务器内部错误', timestamp: Date.now() })}\n\n`);
    }

    res.end();
  }

  /**
   * POST /api/v1/chat/ping — 真机连通性测试, 立即返回
   */
  @Post('ping')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '连通性测试' })
  async ping() {
    return { pong: true, time: Date.now() };
  }

  /**
   * POST /api/v1/chat/simple
   * 发送消息 (JSON 一次性返回 — 小程序前端兼容, 无 authentication 也允许)
   */
  @Post('simple')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发送消息 (JSON响应, 兼容前端 /chat/simple)' })
  async sendMessageSimple(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendMessageDto,
    @Headers('x-session-id') headerSessionId: string,
  ) {
    return this._sendJson(user, dto, headerSessionId);
  }

  /**
   * POST /api/v1/chat/send
   * 发送消息 (简单JSON响应,不走SSE — 微信小程序兼容)
   */
  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发送消息 (JSON响应)' })
  async sendMessageJson(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendMessageDto,
    @Headers('x-session-id') headerSessionId: string,
  ) {
    return this._sendJson(user, dto, headerSessionId);
  }

  private async _sendJson(
    user: JwtPayload,
    dto: SendMessageDto,
    headerSessionId: string,
  ) {
    const sessionId = dto.sessionId || headerSessionId || null;
    let finalReply = '';
    let intent = '';
    let confidence = 0;
    let emotion = 'neutral';
    let citations: any[] = [];
    let quickRepliesList: any[] = [];
    let returnedSessionId: string | null = null;

    const stream = this.chatService.processMessage(
      user.sub, sessionId, dto.message,
      (dto.type as 'text' | 'quick_reply') || 'text',
      dto.profile,
      dto.skipTts === true,
    );

    for await (const event of stream) {
      if (event.type === 'token') finalReply += (event as any).content;
      if (event.type === 'intent') {
        intent = (event as any).primary || '';
        confidence = (event as any).confidence || 0;
      }
      if (event.type === 'citation') citations.push(event);
      if (event.type === 'quick_replies') quickRepliesList = (event as any).replies || [];
      if (event.type === 'done') {
        emotion = (event as any).emotion || 'neutral';
        returnedSessionId = (event as any).sessionId || null;
        if (!finalReply && (event as any).content) {
          finalReply = (event as any).content;
        }
      }
    }
    if (!finalReply) finalReply = '有什么我可以帮你的吗?';

    return {
      answer: finalReply,
      intent,
      confidence,
      emotion,
      citations,
      quickReplies: quickRepliesList,
      sessionId: returnedSessionId,
    };
  }

  /**
   * GET /api/v1/chat/sessions
   * 获取历史会话列表
   */
  @Get('sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取历史会话列表' })
  async getSessions(@CurrentUser() user: JwtPayload): Promise<ChatSessionsResponseDto> {
    return this.chatService.getSessions(user.sub);
  }

  /**
   * GET /api/v1/chat/sessions/:sessionId/messages
   * 获取会话历史消息
   */
  @Get('sessions/:sessionId/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取会话历史消息' })
  async getMessages(
    @CurrentUser() user: JwtPayload,
    @Param('sessionId') sessionId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: number,
  ): Promise<ChatMessagesResponseDto> {
    return this.chatService.getMessages(user.sub, sessionId, before, limit || 50);
  }
}
