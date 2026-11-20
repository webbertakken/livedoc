// docs/specs/034-text-documents/standard-mapping.md "Kept content", "Shown as it reads".
import { describe, expect, it } from 'vitest';
import { keptBreakOf, keptPresenceOf } from './kept-presence';

describe('keptPresenceOf', () => {
  it('hides what has nothing to see, in either format', () => {
    for (const name of [
      'sequence-decls',
      'bookmark-start',
      'bookmarkStart',
      'commentRangeEnd',
      'proofErr',
    ])
      expect(keptPresenceOf(name)).toBe('hidden');
  });

  it('breaks the line for a kept line break', () => {
    expect(keptPresenceOf('br')).toBe('break');
    expect(keptPresenceOf('line-break')).toBe('break');
  });

  it('shows anything else as the placeholder', () => {
    for (const name of ['tbl', 'table', 'footnoteReference', 'note', 'drawing'])
      expect(keptPresenceOf(name)).toBe('placeholder');
  });
});

describe('keptBreakOf (page-layout.md "Breaks")', () => {
  it("reads a Word page or column break from the kept run, whatever the file's prefix", () => {
    expect(keptBreakOf('br', '<w:r><w:br w:type="page"/></w:r>')).toBe('page');
    expect(keptBreakOf('br', '<x:r><x:rPr/><x:br x:type="column"/></x:r>')).toBe('column');
  });

  it('reads anything else as no page or column break', () => {
    expect(keptBreakOf('br', '<w:r><w:br/></w:r>')).toBeNull();
    expect(keptBreakOf('br', '<w:r><w:br w:type="textWrapping"/></w:r>')).toBeNull();
    expect(keptBreakOf('drawing', '<w:r><w:br w:type="page"/></w:r>')).toBeNull();
  });
});
