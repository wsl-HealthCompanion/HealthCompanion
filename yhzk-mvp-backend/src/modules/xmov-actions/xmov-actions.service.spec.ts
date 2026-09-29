import { XmovActionsClient } from './xmov-actions.client';
import { XmovActionsService } from './xmov-actions.service';
import { XmovActionsClientError } from './xmov-actions.types';

describe('XmovActionsService', () => {
  it('fetches raw actions once and returns normalized actions', async () => {
    const fetchRawActions = jest.fn().mockResolvedValue({
      error_code: 0,
      error_reason: '',
      data: [
        {
          name: 'M_CN03_show03__PointingSelf',
          cn_name: '指向自己',
          ka_type: 'body_action',
        },
        {
          name: 'prefix__Wave',
          cn_name: '挥手',
          ka_type: 'body_action',
        },
      ],
    });

    const client = { fetchRawActions } as unknown as XmovActionsClient;
    const service = new XmovActionsService(client);

    await expect(service.listActions()).resolves.toEqual({
      actions: [
        {
          semantic: 'PointingSelf',
          name: 'PointingSelf',
          cnName: '指向自己',
          type: 'body_action',
          rawName: 'M_CN03_show03__PointingSelf',
        },
        {
          semantic: 'Wave',
          name: 'Wave',
          cnName: '挥手',
          type: 'body_action',
          rawName: 'prefix__Wave',
        },
      ],
    });

    expect(fetchRawActions).toHaveBeenCalledTimes(1);
  });

  it('returns an empty action list without inventing fallbacks', async () => {
    const fetchRawActions = jest.fn().mockResolvedValue({
      error_code: 0,
      error_reason: '',
      data: [],
    });

    const client = { fetchRawActions } as unknown as XmovActionsClient;
    const service = new XmovActionsService(client);

    await expect(service.listActions()).resolves.toEqual({ actions: [] });
    expect(fetchRawActions).toHaveBeenCalledTimes(1);
  });

  it('preserves client failures unchanged', async () => {
    const upstreamError = new XmovActionsClientError(
      'UPSTREAM',
      'Xmov KA API request failed (HTTP 502)',
    );
    const fetchRawActions = jest.fn().mockRejectedValue(upstreamError);

    const client = { fetchRawActions } as unknown as XmovActionsClient;
    const service = new XmovActionsService(client);

    await expect(service.listActions()).rejects.toBe(upstreamError);
    expect(fetchRawActions).toHaveBeenCalledTimes(1);
  });
});
