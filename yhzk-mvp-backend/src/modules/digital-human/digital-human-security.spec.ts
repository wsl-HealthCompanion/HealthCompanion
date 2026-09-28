import { ConfigService } from '@nestjs/config';
import {
  hashDigitalHumanSecret,
  matchesDigitalHumanSecret,
} from './digital-human.types';
import { DigitalHumanMediaTicketService } from './digital-human-media-ticket.service';
import { RedisDigitalHumanSessionRepository } from './redis-digital-human-session.repository';

const MEDIA_SECRET = 'm'.repeat(32);

describe('digital-human security primitives', () => {
  afterEach(() => jest.restoreAllMocks());

  it('never matches one session control token against another token hash', () => {
    const tokenA = 'a'.repeat(43);
    const tokenB = 'b'.repeat(43);

    expect(matchesDigitalHumanSecret(tokenA, hashDigitalHumanSecret(tokenA))).toBe(true);
    expect(matchesDigitalHumanSecret(tokenA, hashDigitalHumanSecret(tokenB))).toBe(false);
  });

  it('binds a media ticket to one exact stream and generation', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_786_600_000_000);
    const service = new DigitalHumanMediaTicketService(
      new ConfigService({ DIGITAL_HUMAN_MEDIA_SECRET: MEDIA_SECRET }),
    );
    const ticket = service.issue(
      { sessionId: 's'.repeat(32), streamKey: 'a'.repeat(32), generation: 4 },
      180,
    );

    expect(service.verify(ticket)).toMatchObject({
      sessionId: 's'.repeat(32),
      streamKey: 'a'.repeat(32),
      generation: 4,
    });
    expect(service.verify(ticket).streamKey).not.toBe('b'.repeat(32));
  });

  it('rejects expired and tampered media tickets', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_786_600_000_000);
    const service = new DigitalHumanMediaTicketService(
      new ConfigService({ DIGITAL_HUMAN_MEDIA_SECRET: MEDIA_SECRET }),
    );
    const ticket = service.issue(
      { sessionId: 's'.repeat(32), streamKey: 'a'.repeat(32), generation: 1 },
      1,
    );

    expect(() => service.verify(`${ticket.slice(0, -1)}x`)).toThrow();
    jest.spyOn(Date, 'now').mockReturnValue(1_786_600_002_000);
    expect(() => service.verify(ticket)).toThrow(/expired/i);
  });

  it('propagates Redis ownership lookup failures instead of granting access', async () => {
    const redis = { get: jest.fn().mockRejectedValue(new Error('redis down')) };
    const repository = new RedisDigitalHumanSessionRepository(redis as never);

    await expect(repository.getActiveSessionId('user-a')).rejects.toThrow('redis down');
  });

  it('refuses a media secret shorter than 32 characters', () => {
    expect(
      () => new DigitalHumanMediaTicketService(
        new ConfigService({ DIGITAL_HUMAN_MEDIA_SECRET: 'short' }),
      ),
    ).toThrow(/32/);
  });
});
