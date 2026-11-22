import { describe, expect, it, vi } from 'vitest';
import { createPinnedArrow, createShape, type Element, type ShapeElement } from '@livedoc/document';
import { mindSelectionMenu } from './mind-selection-menu';

// docs/specs/009-elements/mind-node.md "Several nodes selected": the multi-selection menu's Mind Map row, for an
// Editor on a selection of mind nodes with or without the lines between them.

const node = (id: string, parent?: string): ShapeElement => ({
  ...createShape('mind-node', 0, 0),
  id,
  ...(parent ? { mindParentId: parent } : { mindFlow: 'tree' as const }),
});
const line = (from: string, to: string): Element => ({
  ...createPinnedArrow(from, 'e', to, 'w'),
  id: `${from}-${to}`,
});
const square = { ...createShape('square', 0, 0), id: 'sq' } as Element;
const elements: Element[] = [
  node('r'),
  node('a', 'r'),
  node('a1', 'a'),
  node('b', 'r'),
  line('r', 'a'),
  line('a', 'a1'),
  line('r', 'b'),
  square,
];
const pick = (...ids: string[]) => elements.filter((e) => ids.includes(e.id));

function deps(over: { level?: 'edit' | 'comment' | 'view'; canEditOutline?: boolean } = {}) {
  return {
    elements,
    can: { level: over.level ?? 'edit' },
    selectMarquee: vi.fn(),
    mindOutline: { canEdit: () => over.canEditOutline ?? true, open: vi.fn() },
    onTidyBranches: vi.fn(),
  };
}

describe('mindSelectionMenu', () => {
  it('offers the Mind Map row for several mind nodes and the lines between them', () => {
    const menu = mindSelectionMenu({ ...deps(), selection: pick('a', 'b', 'r-a', 'r-b') });
    expect(menu).toBeDefined();
    expect(menu!.flowRows).toContain('auto');
  });

  it('offers it for several mind nodes alone', () => {
    expect(mindSelectionMenu({ ...deps(), selection: pick('a', 'b') })).toBeDefined();
  });

  it('keeps the plain multi-selection menu with another element in it', () => {
    expect(mindSelectionMenu({ ...deps(), selection: pick('a', 'b', 'sq') })).toBeUndefined();
  });

  it('is an Editor\u2019s only', () => {
    expect(
      mindSelectionMenu({ ...deps({ level: 'comment' }), selection: pick('a', 'b') }),
    ).toBeUndefined();
  });

  it('selects every selected node\u2019s branch, or every map, with their lines', () => {
    const d = deps();
    const menu = mindSelectionMenu({ ...d, selection: pick('a', 'b', 'r-a') })!;
    menu.onSelectBranch();
    expect([...d.selectMarquee.mock.calls[0]![0]].sort()).toEqual(['a', 'a-a1', 'a1', 'b']);
    menu.onSelectMap();
    expect([...d.selectMarquee.mock.calls[1]![0]].sort()).toEqual(
      ['a', 'a-a1', 'a1', 'b', 'r', 'r-a', 'r-b'].sort(),
    );
  });

  it('opens the one map\u2019s outline, and offers none when the outline may not be edited', () => {
    const d = deps();
    mindSelectionMenu({ ...d, selection: pick('a', 'b') })!.onEditOutline!();
    expect(d.mindOutline.open).toHaveBeenCalledWith('r');
    const locked = mindSelectionMenu({
      ...deps({ canEditOutline: false }),
      selection: pick('a', 'b'),
    })!;
    expect(locked.onEditOutline).toBeUndefined();
  });

  it('hands Tidy Branches to the selection-wide setter', () => {
    const d = deps();
    mindSelectionMenu({ ...d, selection: pick('a', 'b') })!.onTidyBranches();
    expect(d.onTidyBranches).toHaveBeenCalled();
  });
});
