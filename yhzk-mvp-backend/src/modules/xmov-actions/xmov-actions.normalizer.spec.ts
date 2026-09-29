import { normalizeXmovActions } from './xmov-actions.normalizer';

describe('normalizeXmovActions', () => {
  it('normalizes a complete official KA action', () => {
    const raw = {
      error_code: 0,
      error_reason: '',
      data: [{
        name: 'M_CN03_show03__PointingSelf',
        cn_name: '指向自己',
        ka_type: 'body_action',
        render_image_oss: 'https://example.test/pointing.png',
        render_movie_oss: 'https://example.test/pointing.mp4',
      }],
    };

    expect(normalizeXmovActions(raw)).toEqual([{
      semantic: 'PointingSelf',
      name: 'PointingSelf',
      cnName: '指向自己',
      type: 'body_action',
      imageUrl: 'https://example.test/pointing.png',
      movieUrl: 'https://example.test/pointing.mp4',
      rawName: 'M_CN03_show03__PointingSelf',
    }]);
  });

  it('preserves an empty official action list', () => {
    expect(normalizeXmovActions({
      error_code: 0,
      error_reason: '',
      data: [],
    })).toEqual([]);
  });

  it('accepts a single action object as the data payload', () => {
    expect(normalizeXmovActions({
      error_code: 0,
      data: {
        name: 'M_CN03_show03__Wave',
        cn_name: '挥手',
        ka_type: 'body_action',
      },
    })).toEqual([{
      semantic: 'Wave',
      name: 'Wave',
      cnName: '挥手',
      type: 'body_action',
      rawName: 'M_CN03_show03__Wave',
    }]);
  });

  it('uses an unprefixed official name as semantic and display name', () => {
    expect(normalizeXmovActions({
      error_code: 0,
      data: [{ name: 'Welcome' }],
    })).toEqual([{
      semantic: 'Welcome',
      name: 'Welcome',
      cnName: '',
      type: 'unknown',
      rawName: 'Welcome',
    }]);
  });

  it('uses explicit fallbacks for missing optional metadata', () => {
    expect(normalizeXmovActions({
      error_code: 0,
      data: [{ name: 'prefix__Nod' }],
    })).toEqual([{
      semantic: 'Nod',
      name: 'Nod',
      cnName: '',
      type: 'unknown',
      rawName: 'prefix__Nod',
    }]);
  });

  it('omits blank previews and trims valid preview URLs', () => {
    expect(normalizeXmovActions({
      error_code: 0,
      data: [{
        name: 'prefix__Smile',
        render_image_oss: '   ',
        render_movie_oss: '  https://example.test/smile.mp4  ',
      }],
    })).toEqual([{
      semantic: 'Smile',
      name: 'Smile',
      cnName: '',
      type: 'unknown',
      movieUrl: 'https://example.test/smile.mp4',
      rawName: 'prefix__Smile',
    }]);
  });
});
