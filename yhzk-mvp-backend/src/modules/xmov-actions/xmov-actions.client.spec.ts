import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import { XmovActionsClient } from './xmov-actions.client';
import { XmovActionsClientError } from './xmov-actions.types';

function config(values: Record<string, string> = {}): ConfigService {
  return new ConfigService(values);
}

describe('XmovActionsClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockHttp() {
    const request = jest.fn();
    jest.spyOn(axios, 'create').mockReturnValue({ request } as unknown as AxiosInstance);
    return request;
  }

  it('requests the official KA summary endpoint with signed headers', async () => {
    const request = mockHttp();
    jest.spyOn(Date, 'now').mockReturnValue(1790690000000);

    const raw = {
      error_code: 0,
      error_reason: '',
      data: [{ name: 'M_CN03_show03__PointingSelf' }],
    };
    request.mockResolvedValue({ data: raw });

    const client = new XmovActionsClient(config({
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
    const request = mockHttp();
    jest.spyOn(Date, 'now').mockReturnValue(1790690000000);

    const raw = { error_code: 0, error_reason: '', data: [] };
    request.mockResolvedValue({ data: raw });

    const client = new XmovActionsClient(config({
      XMOV_APP_ID: 'app-test',
      XMOV_APP_SECRET: 'secret-test',
    }));

    await expect(client.fetchRawActions()).resolves.toBe(raw);
  });

  it('fails with CONFIG before HTTP when XMOV_APP_ID is missing', async () => {
    const request = mockHttp();
    const client = new XmovActionsClient(config({
      XMOV_APP_SECRET: 'secret-test',
    }));

    await expect(client.fetchRawActions()).rejects.toMatchObject({
      code: 'CONFIG',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('fails with CONFIG before HTTP when XMOV_APP_SECRET is missing', async () => {
    const request = mockHttp();
    const client = new XmovActionsClient(config({
      XMOV_APP_ID: 'app-test',
    }));

    await expect(client.fetchRawActions()).rejects.toMatchObject({
      code: 'CONFIG',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('classifies axios timeouts as TIMEOUT', async () => {
    const request = mockHttp();
    request.mockRejectedValue(Object.assign(new Error('timeout'), {
      code: 'ECONNABORTED',
      isAxiosError: true,
    }));

    const client = new XmovActionsClient(config({
      XMOV_APP_ID: 'app-test',
      XMOV_APP_SECRET: 'secret-test',
    }));

    await expect(client.fetchRawActions()).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('classifies HTTP response failures as UPSTREAM', async () => {
    const request = mockHttp();
    request.mockRejectedValue({
      isAxiosError: true,
      message: 'bad gateway',
      response: { status: 502 },
    });

    const client = new XmovActionsClient(config({
      XMOV_APP_ID: 'app-test',
      XMOV_APP_SECRET: 'secret-test',
    }));

    await expect(client.fetchRawActions()).rejects.toMatchObject({
      code: 'UPSTREAM',
    });
  });

  it('classifies official nonzero error_code as UPSTREAM and preserves the reason', async () => {
    const request = mockHttp();
    request.mockResolvedValue({
      data: {
        error_code: 1001,
        error_reason: 'bad token',
        data: null,
      },
    });

    const client = new XmovActionsClient(config({
      XMOV_APP_ID: 'app-test',
      XMOV_APP_SECRET: 'secret-test',
    }));

    await expect(client.fetchRawActions()).rejects.toEqual(
      expect.objectContaining({
        code: 'UPSTREAM',
        message: expect.stringContaining('bad token'),
      }),
    );
  });

  it('classifies an empty successful HTTP body as PROTOCOL', async () => {
    const request = mockHttp();
    request.mockResolvedValue({ data: undefined });

    const client = new XmovActionsClient(config({
      XMOV_APP_ID: 'app-test',
      XMOV_APP_SECRET: 'secret-test',
    }));

    await expect(client.fetchRawActions()).rejects.toMatchObject({
      code: 'PROTOCOL',
    });
  });

  it('classifies a body without numeric error_code as PROTOCOL', async () => {
    const request = mockHttp();
    request.mockResolvedValue({ data: { data: [] } });

    const client = new XmovActionsClient(config({
      XMOV_APP_ID: 'app-test',
      XMOV_APP_SECRET: 'secret-test',
    }));

    await expect(client.fetchRawActions()).rejects.toMatchObject({
      code: 'PROTOCOL',
    });
  });

  it('uses the exported typed error contract', () => {
    const error = new XmovActionsClientError('CONFIG', 'missing');
    expect(error).toMatchObject({
      name: 'XmovActionsClientError',
      code: 'CONFIG',
      message: 'missing',
    });
  });
});
