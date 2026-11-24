// docs/specs/034-text-documents/links-and-navigation.md "A tab's menu" (Dragging): a tab dropped before, after or into
// another tab, its subtabs with it at their depths under it; refused into its own subtabs or past the depth of 3.
import { describe, expect, it } from 'vitest';
import { DocumentTabList, type DocumentTabEntry } from './document-tab-list';

const e = (id: string, depth: 0 | 1 | 2 = 0): DocumentTabEntry => ({ id, name: id, depth });
const shape = (list: readonly DocumentTabEntry[] | null) =>
  list ? list.map((t) => `${t.id}:${t.depth}`).join(' ') : null;

// a, its subtabs a1 (with a1x) and a2, then b, then c.
const LIST = [e('a'), e('a1', 1), e('a1x', 2), e('a2', 1), e('b'), e('c')];

describe('DocumentTabList.drop', () => {
  it('drops before a tab, taking its place and depth', () => {
    expect(shape(DocumentTabList.drop(LIST, 'c', 'a2', 'before'))).toBe(
      'a:0 a1:1 a1x:2 c:1 a2:1 b:0',
    );
  });

  it('drops after a tab’s subtabs, at its depth', () => {
    expect(shape(DocumentTabList.drop(LIST, 'c', 'a', 'after'))).toBe(
      'a:0 a1:1 a1x:2 a2:1 c:0 b:0',
    );
  });

  it('drops into a tab as its first subtab', () => {
    expect(shape(DocumentTabList.drop(LIST, 'c', 'b', 'into'))).toBe('a:0 a1:1 a1x:2 a2:1 b:0 c:1');
    expect(shape(DocumentTabList.drop(LIST, 'b', 'a', 'into'))).toBe('a:0 b:1 a1:1 a1x:2 a2:1 c:0');
  });

  it('carries the subtabs at their depths under the tab', () => {
    expect(shape(DocumentTabList.drop(LIST, 'a1', 'c', 'after'))).toBe(
      'a:0 a2:1 b:0 c:0 a1:0 a1x:1',
    );
    expect(shape(DocumentTabList.drop(LIST, 'a1', 'b', 'before'))).toBe(
      'a:0 a2:1 a1:0 a1x:1 b:0 c:0',
    );
  });

  it('refuses a drop on itself or into its own subtabs', () => {
    expect(DocumentTabList.drop(LIST, 'a', 'a', 'into')).toBeNull();
    expect(DocumentTabList.drop(LIST, 'a', 'a1x', 'after')).toBeNull();
    expect(DocumentTabList.drop(LIST, 'a', 'a2', 'before')).toBeNull();
  });

  it('refuses a drop past the depth of 3', () => {
    expect(DocumentTabList.drop(LIST, 'a1', 'a2', 'into')).toBeNull();
    expect(DocumentTabList.drop(LIST, 'b', 'a1x', 'into')).toBeNull();
    expect(DocumentTabList.drop(LIST, 'a', 'c', 'into')).toBeNull();
    expect(shape(DocumentTabList.drop(LIST, 'c', 'a1', 'into'))).toBe(
      'a:0 a1:1 c:2 a1x:2 a2:1 b:0',
    );
  });

  it('refuses unknown tabs', () => {
    expect(DocumentTabList.drop(LIST, 'gone', 'a', 'before')).toBeNull();
    expect(DocumentTabList.drop(LIST, 'a', 'gone', 'before')).toBeNull();
  });

  it('gives an equal list for a drop where the tab is', () => {
    expect(shape(DocumentTabList.drop(LIST, 'b', 'c', 'before'))).toBe(shape(LIST));
    expect(shape(DocumentTabList.drop(LIST, 'b', 'a', 'after'))).toBe(shape(LIST));
    expect(DocumentTabList.same(LIST, DocumentTabList.drop(LIST, 'b', 'c', 'before')!)).toBe(true);
    expect(DocumentTabList.same(LIST, DocumentTabList.drop(LIST, 'c', 'b', 'into')!)).toBe(false);
  });
});
