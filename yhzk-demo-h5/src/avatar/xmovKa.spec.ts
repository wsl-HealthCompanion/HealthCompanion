import { describe, expect, it } from 'vitest';
import { buildXmovKaSsml } from './xmovKa';

describe('buildXmovKaSsml', () => {
  it('builds the official skill KA ue4event for a semantic', () => {
    const ssml = buildXmovKaSsml('PointingSelf');

    expect(ssml).toContain('<speak>');
    expect(ssml).toContain('<type>ka</type>');
    expect(ssml).toContain(
      '<action_semantic>PointingSelf</action_semantic>',
    );
    expect(ssml).toContain('</speak>');
  });

  it('trims surrounding whitespace from semantic', () => {
    expect(buildXmovKaSsml('  PointingSelf  ')).toContain(
      '<action_semantic>PointingSelf</action_semantic>',
    );
  });

  it('escapes XML-sensitive characters inside action_semantic', () => {
    expect(buildXmovKaSsml('A&B<1>')).toContain(
      '<action_semantic>A&amp;B&lt;1&gt;</action_semantic>',
    );
  });

  it('rejects a blank semantic', () => {
    expect(() => buildXmovKaSsml('   ')).toThrow(/semantic/i);
  });
});
