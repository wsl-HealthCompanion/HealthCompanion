import { Request } from 'express';
import { requestMeta } from './admin-request';

describe('requestMeta', () => {
  it('uses the first trusted proxy address and preserves the user agent', () => {
    const request = {
      headers: {
        'x-forwarded-for': '203.0.113.9, 10.0.0.2',
        'user-agent': 'avatar-admin-test',
      },
      ip: '10.0.0.2',
      socket: { remoteAddress: '10.0.0.3' },
    } as unknown as Request;

    expect(requestMeta(request)).toEqual({
      ip: '203.0.113.9',
      userAgent: 'avatar-admin-test',
    });
  });

  it('falls back to the direct request address when no proxy header exists', () => {
    const request = {
      headers: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.2' },
    } as unknown as Request;

    expect(requestMeta(request)).toEqual({ ip: '127.0.0.1', userAgent: null });
  });
});
