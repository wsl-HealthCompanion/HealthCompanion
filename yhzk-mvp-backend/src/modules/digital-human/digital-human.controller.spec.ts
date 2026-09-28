import { ConfigService } from '@nestjs/config';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateDigitalHumanSessionDto } from './digital-human.dto';
import { DigitalHumanController } from './digital-human.controller';
import { RealUserGuard } from './real-user.guard';

describe('DigitalHumanController contract', () => {
  const result = {
    sessionId: 'session-a',
    controlToken: 'control-a',
    streamUrl: '/live/dh_stream-a.flv',
    expiresAt: '2026-08-13T15:00:00.000Z',
    mediaTicket: 'http-only-ticket',
  };

  it('rejects demo-token principals', () => {
    const guard = new RealUserGuard();
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'demo', isDemo: true } }) }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('whitelists only clientInstanceId in session creation', async () => {
    const dto = plainToInstance(CreateDigitalHumanSessionDto, {
      clientInstanceId: 'client-instance-0001',
      userId: 'victim',
      avatarId: '1008',
      streamKey: 'chosen-stream',
      audioPort: 19876,
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map((entry) => entry.property)).toEqual(expect.arrayContaining([
      'userId', 'avatarId', 'streamKey', 'audioPort',
    ]));
  });

  it('sets an HTTP staging media cookie without exposing its value in the body', async () => {
    const sessions = { createSession: jest.fn().mockResolvedValue(result) };
    const controller = new DigitalHumanController(
      sessions as never,
      new ConfigService({ DIGITAL_HUMAN_COOKIE_SECURE: 'false' }),
    );
    const response = { cookie: jest.fn() };

    const body = await controller.create(
      { sub: 'user-a', isDemo: false },
      { clientInstanceId: 'client-instance-0001' },
      response as never,
    );

    expect(response.cookie).toHaveBeenCalledWith(
      expect.stringMatching(/^dh_media_[a-f0-9]{16}$/),
      'http-only-ticket',
      {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      path: '/live/',
      maxAge: 180_000,
      },
    );
    expect(body).not.toHaveProperty('mediaTicket');
    expect(body.streamUrl).toBe('/live/dh_stream-a.flv');
  });

  it('passes the exact cookie and original stream URI to fail-closed authorization', async () => {
    const sessions = { authorizeMedia: jest.fn().mockRejectedValue(new Error('mismatch')) };
    const controller = new DigitalHumanController(sessions as never, new ConfigService());

    await expect(controller.authorize(
      { headers: { cookie: 'other=x; dh_media_abcd1234=bound-ticket' } } as never,
      '/live/dh_other.flv',
    )).rejects.toThrow('mismatch');
    expect(sessions.authorizeMedia).toHaveBeenCalledWith(
      'bound-ticket',
      '/live/dh_other.flv',
    );
  });

  it('allows a current per-session media cookie without an older cookie blocking it', async () => {
    const sessions = {
      authorizeMedia: jest.fn()
        .mockRejectedValueOnce(new ForbiddenException('old generation'))
        .mockResolvedValueOnce(undefined),
    };
    const controller = new DigitalHumanController(sessions as never, new ConfigService());

    await expect(controller.authorize(
      { headers: { cookie: 'dh_media_old=old-ticket; dh_media_new=current-ticket' } } as never,
      '/live/dh_current.flv',
    )).resolves.toBeUndefined();
    expect(sessions.authorizeMedia).toHaveBeenNthCalledWith(
      2,
      'current-ticket',
      '/live/dh_current.flv',
    );
  });

  it('exempts the nginx media authorization subrequest from API throttling', () => {
    expect(Reflect.getMetadata(
      'THROTTLER:SKIPdefault',
      DigitalHumanController.prototype.authorize,
    )).toBe(true);
  });
});
