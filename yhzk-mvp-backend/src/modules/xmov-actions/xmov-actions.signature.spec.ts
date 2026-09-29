import {
  XMOV_KA_SUMMARY_PATH,
  buildXmovAuthHeaders,
} from './xmov-actions.signature';

describe('Xmov request signing', () => {
  it('builds deterministic auth headers for the KA summary request', () => {
    const headers = buildXmovAuthHeaders({
      appId: 'app-test',
      appSecret: 'secret-test',
      method: 'GET',
      apiPath: XMOV_KA_SUMMARY_PATH,
      data: {},
      timestamp: 1790690000,
    });

    expect(headers).toEqual({
      'X-APP-ID': 'app-test',
      'X-TIMESTAMP': '1790690000',
      'X-TOKEN': '3be711ca225b4418d8acf75203dbeab7',
    });
  });

  it('sorts nested object keys and uses compact JSON before hashing', () => {
    const headers = buildXmovAuthHeaders({
      appId: 'app-test',
      appSecret: 'secret-test',
      method: 'GET',
      apiPath: '/MiXeD/Path',
      data: { z: 1, a: { y: 2, x: 3 } },
      timestamp: 1790690000,
    });

    expect(headers['X-TOKEN']).toBe('2a5f4f0f3d86752d0456c43a8f8d55ed');
  });
});
