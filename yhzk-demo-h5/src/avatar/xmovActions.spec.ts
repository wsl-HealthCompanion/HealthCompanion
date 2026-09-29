import { describe, expect, it, vi } from 'vitest';
import { fetchXmovActions } from './xmovActions';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('fetchXmovActions', () => {
  it('unwraps the canonical backend response and requests the stable endpoint', async () => {
    const actions = [{
      semantic: 'PointingSelf',
      name: 'PointingSelf',
      cnName: '指向自己',
      type: 'body_action',
      rawName: 'M_CN03_show03__PointingSelf',
    }];
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      code: 0,
      message: 'ok',
      data: { actions },
      requestId: 'req-test',
    }));

    await expect(fetchXmovActions({
      apiBase: 'https://api.test/api/v1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).resolves.toEqual(actions);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/v1/xmov/actions',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('accepts a direct stable actions payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ actions: [] }),
    );

    await expect(fetchXmovActions({
      apiBase: 'https://api.test/api/v1/',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).resolves.toEqual([]);
  });

  it('rejects non-success HTTP responses with the status code', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ message: 'bad gateway' }, { status: 502 }),
    );

    await expect(fetchXmovActions({
      apiBase: 'https://api.test/api/v1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow(/HTTP 502/);
  });

  it('rejects a successful response without an actions array', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ data: {} }),
    );

    await expect(fetchXmovActions({
      apiBase: 'https://api.test/api/v1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow(/actions/i);
  });

  it('rejects a successful response whose actions value is not an array', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ data: { actions: null } }),
    );

    await expect(fetchXmovActions({
      apiBase: 'https://api.test/api/v1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow(/actions/i);
  });
});
