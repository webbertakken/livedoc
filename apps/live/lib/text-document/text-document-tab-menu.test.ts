// docs/specs/034-text-documents/links-and-navigation.md "A tab's menu", "Share roles": the items in order with their
// separators, each bound only where it applies (dimmed otherwise), and only Copy link for a session that may not edit.
import { describe, expect, it, vi } from 'vitest';
import type { DocumentTab } from '@livedoc/text-documents';
import {
  TAB_MENU_ENTRIES,
  TAB_MENU_ITEMS,
  tabMenuActions,
  tabMenuEntries,
  type TabMenuRun,
} from './text-document-tab-menu';

const tab = (id: string, depth: 0 | 1 | 2 = 0, emoji?: string): DocumentTab => ({
  id,
  name: id,
  depth,
  body: [],
  ...(emoji ? { emoji } : {}),
});

const run = (): TabMenuRun => ({
  rename: vi.fn(),
  chooseEmoji: vi.fn(),
  removeEmoji: vi.fn(),
  addSubtab: vi.fn(),
  duplicate: vi.fn(),
  copyLink: vi.fn(),
  move: vi.fn(),
  askDelete: vi.fn(),
});

// The items that apply: bound and not dimmed.
const bound = (list: DocumentTab[], id: string, canEdit = true) =>
  Object.entries(tabMenuActions(list, id, canEdit, run()))
    .filter(([, action]) => action && !action.disabled)
    .map(([item]) => item)
    .sort();

describe('the tab menu', () => {
  it('lists its items in order, grouped by separators', () => {
    expect(TAB_MENU_ENTRIES.map((e) => (e.kind === 'item' ? e.label : '—'))).toEqual([
      'Rename',
      'Choose emoji',
      'Remove emoji',
      '—',
      'Add subtab',
      'Duplicate',
      'Copy link',
      '—',
      'Move up',
      'Move down',
      'Indent',
      'Outdent',
      '—',
      'Delete',
    ]);
  });

  it('binds every item to a subtab with an emoji between two others', () => {
    const list = [tab('a'), tab('x', 1), tab('b', 1, '📌'), tab('y', 1)];
    expect(bound(list, 'b')).toEqual(Object.values(TAB_MENU_ITEMS).sort());
  });

  it('dims what cannot apply: no emoji to remove, no move or indent past the ends, no subtab at depth 2', () => {
    const list = [tab('a'), tab('a1', 1), tab('a1x', 2)];
    const at = bound(list, 'a1x');
    expect(at).not.toContain(TAB_MENU_ITEMS.removeEmoji);
    expect(at).not.toContain(TAB_MENU_ITEMS.addSubtab);
    expect(at).not.toContain(TAB_MENU_ITEMS.moveUp);
    expect(at).not.toContain(TAB_MENU_ITEMS.indent);
    expect(at).toContain(TAB_MENU_ITEMS.outdent);
    const top = bound(list, 'a');
    expect(top).not.toContain(TAB_MENU_ITEMS.outdent);
    expect(top).not.toContain(TAB_MENU_ITEMS.delete);
  });

  it('binds every item, dimming those that cannot apply', () => {
    const actions = tabMenuActions([tab('a')], 'a', true, run());
    expect(Object.keys(actions).sort()).toEqual(Object.values(TAB_MENU_ITEMS).sort());
    expect(actions[TAB_MENU_ITEMS.delete]!.disabled).toBe(true);
  });

  it('offers only Copy link to a session that may not edit', () => {
    expect(bound([tab('a'), tab('b')], 'b', false)).toEqual([TAB_MENU_ITEMS.copyLink]);
    expect(tabMenuEntries(false).map((e) => (e.kind === 'item' ? e.label : '—'))).toEqual([
      'Copy link',
    ]);
    expect(tabMenuEntries(true)).toBe(TAB_MENU_ENTRIES);
  });

  it('runs each item with the tab it was opened on', () => {
    const handlers = run();
    const actions = tabMenuActions([tab('a'), tab('b')], 'b', true, handlers);
    actions[TAB_MENU_ITEMS.moveUp]!.run();
    actions[TAB_MENU_ITEMS.delete]!.run();
    expect(handlers.move).toHaveBeenCalledWith('b', 'moveUp');
    expect(handlers.askDelete).toHaveBeenCalledWith('b');
  });
});
