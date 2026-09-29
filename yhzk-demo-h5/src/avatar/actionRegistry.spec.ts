import { describe, expect, it } from 'vitest';
import { resolveHealthAction } from './actionRegistry';

describe('resolveHealthAction', () => {
  it('maps business keys to real-account visually verified KA semantics', () => {
    const mappings = [
      ['acknowledge', 'Nod'],
      ['encourage', 'skill_like'],
      ['show_direction', 'LeftSide'],
      ['warm_up', 'daoyou_Hello01'],
      ['confirm', 'Nod'],
    ] as const;

    for (const [businessKey, semantic] of mappings) {
      expect(resolveHealthAction(businessKey)).toMatchObject({
        businessKey,
        semantic,
        verified: true,
      });
    }
  });

  it('keeps fallback explicitly unmapped', () => {
    expect(resolveHealthAction('fallback')).toMatchObject({
      businessKey: 'fallback',
      semantic: null,
      verified: false,
    });
  });

  it('returns null for an unknown business key', () => {
    expect(resolveHealthAction('unreviewed_action')).toBeNull();
  });
});
