// docs/specs/034-text-documents/links-and-navigation.md "A tab's menu" (Dragging): a row's top quarter drops before,
// its bottom quarter after (into, when the tab has subtabs), the rest into.
import { describe, expect, it } from 'vitest';
import { TAB_DROP_EDGE, tabDropPlace } from './text-document-tab-drag';

describe('tabDropPlace', () => {
  it('drops before in the row’s top quarter', () => {
    expect(tabDropPlace(0, 32, false)).toBe('before');
    expect(tabDropPlace(32 * TAB_DROP_EDGE - 1, 32, false)).toBe('before');
  });

  it('drops into in the middle', () => {
    expect(tabDropPlace(8, 32, false)).toBe('into');
    expect(tabDropPlace(16, 32, true)).toBe('into');
    expect(tabDropPlace(24, 32, false)).toBe('into');
  });

  it('drops after in the bottom quarter, into when the tab has subtabs', () => {
    expect(tabDropPlace(25, 32, false)).toBe('after');
    expect(tabDropPlace(32, 32, false)).toBe('after');
    expect(tabDropPlace(30, 32, true)).toBe('into');
  });

  it('reads a row with no height as into', () => {
    expect(tabDropPlace(0, 0, false)).toBe('into');
  });
});
