import {
  Body, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, Post, Query, Req, Res,
  UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { createHash } from 'crypto';
import { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { CreateDigitalHumanSessionDto, SpeakDigitalHumanDto } from './digital-human.dto';
import { DigitalHumanSessionService } from './digital-human.service';
import { RealUserGuard } from './real-user.guard';

@Controller('digital-human')
export class DigitalHumanController {
  constructor(
    private readonly sessions: DigitalHumanSessionService,
    private readonly config: ConfigService,
  ) {}

  @Post('session')
  @UseGuards(JwtAuthGuard, RealUserGuard)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateDigitalHumanSessionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.sessions.createSession(user.sub, body.clientInstanceId);
    this.setMediaCookie(response, result.sessionId, result.mediaTicket);
    const { mediaTicket: _hidden, ...publicResult } = result;
    return publicResult;
  }

  @Post('session/speak')
  @UseGuards(JwtAuthGuard, RealUserGuard)
  speak(@CurrentUser() user: JwtPayload, @Headers('x-digital-human-session') id: string,
    @Headers('x-digital-human-control') token: string, @Body() body: SpeakDigitalHumanDto) {
    return this.sessions.speak(user.sub, id, token, {
      text: body.text,
      round_id: body.roundId,
      subtitle_segments: body.subtitleSegments,
      tts: body.tts,
    });
  }

  @Post('session/interrupt')
  @UseGuards(JwtAuthGuard, RealUserGuard)
  interrupt(@CurrentUser() user: JwtPayload, @Headers('x-digital-human-session') id: string,
    @Headers('x-digital-human-control') token: string) {
    return this.sessions.interrupt(user.sub, id, token);
  }

  @Post('session/heartbeat')
  @UseGuards(JwtAuthGuard, RealUserGuard)
  async heartbeat(@CurrentUser() user: JwtPayload, @Headers('x-digital-human-session') id: string,
    @Headers('x-digital-human-control') token: string,
    @Res({ passthrough: true }) response: Response) {
    const mediaTicket = await this.sessions.heartbeat(user.sub, id, token);
    this.setMediaCookie(response, id, mediaTicket);
    return { alive: true };
  }

  @Get('session/subtitles')
  @Throttle({ default: { limit: 3600, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard, RealUserGuard)
  subtitles(@CurrentUser() user: JwtPayload, @Headers('x-digital-human-session') id: string,
    @Headers('x-digital-human-control') token: string, @Query('after') after = '0') {
    return this.sessions.subtitles(user.sub, id, token, Math.max(0, Number(after) || 0));
  }

  @Delete('session')
  @UseGuards(JwtAuthGuard, RealUserGuard)
  async close(@CurrentUser() user: JwtPayload, @Headers('x-digital-human-session') id: string,
    @Headers('x-digital-human-control') token: string,
    @Res({ passthrough: true }) response: Response) {
    await this.sessions.close(user.sub, id, token);
    response.clearCookie(this.mediaCookieName(id), { path: '/live/' });
    return { closed: true };
  }

  @Get('media/authorize')
  @HttpCode(204)
  @SkipThrottle()
  async authorize(@Req() request: Request, @Headers('x-original-uri') originalUri: string) {
    const tickets = this.mediaCookies(request.headers.cookie);
    if (!tickets.length || !originalUri) throw new UnauthorizedException('媒体凭证缺失');
    for (const ticket of tickets) {
      try {
        await this.sessions.authorizeMedia(ticket, originalUri);
        return;
      } catch (error) {
        if (error instanceof ForbiddenException) continue;
        throw error;
      }
    }
    throw new UnauthorizedException('Media credential does not match this stream');
  }

  private mediaCookies(header: string | undefined): string[] {
    const values: string[] = [];
    for (const part of String(header ?? '').split(';')) {
      const [key, ...rest] = part.trim().split('=');
      if (key.startsWith('dh_media_') && rest.length) {
        values.push(decodeURIComponent(rest.join('=')));
      }
    }
    return values;
  }

  private mediaCookieName(sessionId: string): string {
    return `dh_media_${createHash('sha256').update(sessionId).digest('hex').slice(0, 16)}`;
  }

  private setMediaCookie(response: Response, sessionId: string, ticket: string): void {
    response.cookie(this.mediaCookieName(sessionId), ticket, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.get<string>('DIGITAL_HUMAN_COOKIE_SECURE') === 'true',
      path: '/live/',
      maxAge: 180_000,
    });
  }
}
