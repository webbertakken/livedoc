// docs/specs/034-text-documents/standard-mapping.md "Kept content", "Shown as it reads".
import { describe, expect, it } from 'vitest';
import { keptPresenceOf } from './kept-presence';

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
