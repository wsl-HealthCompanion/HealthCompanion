import { parseTrustedProxyHops } from './trusted-proxy';

describe('parseTrustedProxyHops', () => {
  it('does not trust forwarded headers by default', () => {
    expect(parseTrustedProxyHops(undefined)).toBe(false);
    expect(parseTrustedProxyHops('')).toBe(false);
  });

  it('accepts a positive integer hop count', () => {
    expect(parseTrustedProxyHops('1')).toBe(1);
    expect(parseTrustedProxyHops('2')).toBe(2);
  });

  it.each(['0', '-1', '1.5', 'true', 'abc'])('rejects unsafe hop count %s', (value) => {
    expect(() => parseTrustedProxyHops(value)).toThrow('TRUST_PROXY_HOPS must be a positive integer');
  });
});
