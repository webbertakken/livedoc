// docs/specs/034-text-documents/links-and-navigation.md "A tab's menu": renaming, emoji, adding a subtab, inserting a
// copy after a tab's subtabs, moving a tab with its subtabs past its sibling, indenting and outdenting, removing a tab
// with its subtabs; each refused (null) where the menu dims it.
import { describe, expect, it } from 'vitest';
import { DocumentTabList, type DocumentTabEntry } from './document-tab-list';
import { TEXT_DOCUMENT_TAB_NAME_MAX } from './document-tabs';

const e = (id: string, depth: 0 | 1 | 2 = 0): DocumentTabEntry => ({ id, name: id, depth });
// A shape to read: "id:depth" in order.
const shape = (list: readonly DocumentTabEntry[] | null) =>
  list ? list.map((t) => `${t.id}:${t.depth}`).join(' ') : null;

// a, its subtabs a1 (with a1x) and a2, then b, then c.
const LIST = [e('a'), e('a1', 1), e('a1x', 2), e('a2', 1), e('b'), e('c')];

describe('DocumentTabList', () => {
  it('finds the end of a tab’s subtabs', () => {
    expect(DocumentTabList.subtreeEnd(LIST, 0)).toBe(4);
    expect(DocumentTabList.subtreeEnd(LIST, 1)).toBe(3);
    expect(DocumentTabList.subtreeEnd(LIST, 4)).toBe(5);
  });

  it('renames a tab, trimmed and cut to the most, refusing an empty name', () => {
    expect(DocumentTabList.rename(LIST, 'b', '  Notes ')![4]!.name).toBe('Notes');
    expect(
      DocumentTabList.rename(LIST, 'b', 'x'.repeat(TEXT_DOCUMENT_TAB_NAME_MAX + 3))![4]!.name,
    ).toHaveLength(TEXT_DOCUMENT_TAB_NAME_MAX);
    expect(DocumentTabList.rename(LIST, 'b', '   ')).toBeNull();
    expect(DocumentTabList.rename(LIST, 'gone', 'X')).toBeNull();
  });

  it('gives and takes away a tab’s emoji', () => {
    const given = DocumentTabList.setEmoji(LIST, 'c', '📌')!;
    expect(given[5]!.emoji).toBe('📌');
    expect('emoji' in DocumentTabList.setEmoji(given, 'c', undefined)![5]!).toBe(false);
  });

  it('adds a subtab after the tab’s subtabs, one deeper; none under a tab at depth 2', () => {
    expect(shape(DocumentTabList.addSubtab(LIST, 'a', e('n')))).toBe(
      'a:0 a1:1 a1x:2 a2:1 n:1 b:0 c:0',
    );
    expect(shape(DocumentTabList.addSubtab(LIST, 'a1', e('n')))).toBe(
      'a:0 a1:1 a1x:2 n:2 a2:1 b:0 c:0',
    );
    expect(DocumentTabList.addSubtab(LIST, 'a1x', e('n'))).toBeNull();
  });

  it('puts a tab after another’s subtabs at its depth (a copy)', () => {
    expect(shape(DocumentTabList.insertAfter(LIST, 'a1', e('n')))).toBe(
      'a:0 a1:1 a1x:2 n:1 a2:1 b:0 c:0',
    );
    expect(shape(DocumentTabList.insertAfter(LIST, 'c', e('n')))).toBe(
      'a:0 a1:1 a1x:2 a2:1 b:0 c:0 n:0',
    );
  });

  it('moves a tab and its subtabs past the sibling before or after it, with that one’s subtabs', () => {
    expect(shape(DocumentTabList.moveDown(LIST, 'a'))).toBe('b:0 a:0 a1:1 a1x:2 a2:1 c:0');
    expect(shape(DocumentTabList.moveUp(LIST, 'b'))).toBe('b:0 a:0 a1:1 a1x:2 a2:1 c:0');
    expect(shape(DocumentTabList.moveUp(LIST, 'a2'))).toBe('a:0 a2:1 a1:1 a1x:2 b:0 c:0');
    expect(DocumentTabList.moveUp(LIST, 'a')).toBeNull();
    expect(DocumentTabList.moveUp(LIST, 'a1')).toBeNull();
    expect(DocumentTabList.moveDown(LIST, 'c')).toBeNull();
    expect(DocumentTabList.moveDown(LIST, 'a2')).toBeNull();
  });

  it('indents a tab and its subtabs under the sibling before it, never past depth 2', () => {
    expect(shape(DocumentTabList.indent(LIST, 'b'))).toBe('a:0 a1:1 a1x:2 a2:1 b:1 c:0');
    expect(shape(DocumentTabList.indent(LIST, 'a2'))).toBe('a:0 a1:1 a1x:2 a2:2 b:0 c:0');
    expect(DocumentTabList.indent(LIST, 'a')).toBeNull();
    expect(DocumentTabList.indent(LIST, 'a1')).toBeNull();
    expect(DocumentTabList.indent([e('a'), e('b'), e('b1', 1), e('b1x', 2)], 'b')).toBeNull();
  });

  it('outdents a tab and its subtabs one shallower; refused at the top level', () => {
    expect(shape(DocumentTabList.outdent(LIST, 'a1'))).toBe('a:0 a1:0 a1x:1 a2:1 b:0 c:0');
    expect(DocumentTabList.outdent(LIST, 'b')).toBeNull();
  });

  it('removes a tab with its subtabs, refusing to leave none', () => {
    const removed = DocumentTabList.remove(LIST, 'a')!;
    expect(shape(removed.list)).toBe('b:0 c:0');
    expect(removed.removed).toEqual(['a', 'a1', 'a1x', 'a2']);
    expect(DocumentTabList.remove([e('a'), e('a1', 1)], 'a')).toBeNull();
  });

  it('names a copy Copy of and its name, cut to the most', () => {
    expect(DocumentTabList.copyName('Plan')).toBe('Copy of Plan');
    expect(DocumentTabList.copyName('x'.repeat(TEXT_DOCUMENT_TAB_NAME_MAX))).toHaveLength(
      TEXT_DOCUMENT_TAB_NAME_MAX,
    );
  });
});
