import { ConfigService } from '@nestjs/config';
import { UploadTicketService } from './upload-ticket.service';

const EXPECTED_TOKEN =
  'eyJzY29wZSI6ImF2YXRhcjp1cGxvYWQiLCJ0YXNrX2lkIjoiMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTExIiwiYXZhdGFyX2lkIjoiMTAwOSIsIm1vZGVsIjoid2F2MmxpcCIsImV4cCI6MTc4NjQ0MjcwMH0.n8BOzIEUhgeFTpJgW1zH5w2Yd4m5Iqlgr2UK-zcVzPQ';

describe('UploadTicketService', () => {
  const service = new UploadTicketService(
    new ConfigService({ AVATAR_UPLOAD_TICKET_SECRET: 'cross-language-secret' }),
  );
  const input = {
    taskId: '11111111-1111-4111-8111-111111111111',
    avatarId: '1009',
    model: 'wav2lip' as const,
  };

  it('creates the fixed five-minute cross-language ticket vector', () => {
    const token = service.issue(input, new Date(1786442400 * 1000));

    expect(token).toBe(EXPECTED_TOKEN);
    expect(service.verify(token, new Date(1786442699 * 1000))).toEqual({
      scope: 'avatar:upload',
      task_id: input.taskId,
      avatar_id: input.avatarId,
      model: 'wav2lip',
      exp: 1786442700,
    });
  });

  it('rejects an expired ticket', () => {
    expect(() => service.verify(EXPECTED_TOKEN, new Date(1786442701 * 1000))).toThrow(
      'upload ticket expired',
    );
  });

  it.each([
    `${EXPECTED_TOKEN.slice(0, -1)}A`,
    `e30.${EXPECTED_TOKEN.split('.')[1]}`,
    'missing-dot',
  ])('rejects a malformed or tampered ticket', (token) => {
    expect(() => service.verify(token, new Date(1786442500 * 1000))).toThrow();
  });
});
