import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import { XmovActionsClient } from './xmov-actions.client';

describe('XmovActionsClient success contract', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requests the official KA summary endpoint with signed headers', async () => {
    const request = jest.fn();
    jest.spyOn(axios, 'create').mockReturnValue({ request } as unknown as AxiosInstance);
    jest.spyOn(Date, 'now').mockReturnValue(1790690000000);

    const raw = {
      error_code: 0,
      error_reason: '',
      data: [{ name: 'M_CN03_show03__PointingSelf' }],
    };
    request.mockResolvedValue({ data: raw });

    const client = new XmovActionsClient(new ConfigService({
      XMOV_APP_ID: 'app-test',
      XMOV_APP_SECRET: 'secret-test',
      XMOV_API_BASE_URL: 'https://nebula-agent.xingyun3d.com',
    }));

    expect(axios.create).toHaveBeenCalledWith({
      baseURL: 'https://nebula-agent.xingyun3d.com',
      timeout: 10_000,
    });

    await expect(client.fetchRawActions()).resolves.toBe(raw);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: '/user/v1/external/lite_ka_summary',
      data: {},
      headers: {
        'X-APP-ID': 'app-test',
        'X-TIMESTAMP': '1790690000',
        'X-TOKEN': '3be711ca225b4418d8acf75203dbeab7',
      },
    }));
  });

  it('preserves an empty action list as a valid raw result', async () => {
    const request = jest.fn();
    jest.spyOn(axios, 'create').mockReturnValue({ request } as unknown as AxiosInstance);
    jest.spyOn(Date, 'now').mockReturnValue(1790690000000);

    const raw = { error_code: 0, error_reason: '', data: [] };
    request.mockResolvedValue({ data: raw });

    const client = new XmovActionsClient(new ConfigService({
      XMOV_APP_ID: 'app-test',
      XMOV_APP_SECRET: 'secret-test',
    }));

    await expect(client.fetchRawActions()).resolves.toBe(raw);
  });
});
