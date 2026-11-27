import { SPREADSHEET_THEMES } from '@livedoc/sheets';
import { describe, expect, it, vi } from 'vitest';
import { catalogueItems } from '@/lib/office/office-catalogue';
import {
  bindingsSignature,
  gridMenuBindings,
  gridMenuOutline,
  gridOffice,
  sheetFontSize,
  historyBindings,
  sheetBarBindings,
  type GridMenuActions,
  type GridMenuPort,
} from './spreadsheet-menu-bindings';
import { spreadsheetMenus } from './spreadsheet-menus';
import { SPREADSHEET_CONTEXT_MENUS } from './spreadsheet-context-menus';
import { SPREADSHEET_TOOLBAR } from './spreadsheet-toolbar';
import { SPREADSHEET_SHORTCUTS } from './spreadsheet-shortcuts';

const actions = (): GridMenuActions => ({
  toggle: vi.fn(),
  numberFormat: vi.fn(),
  decimals: vi.fn(),
  format: vi.fn(),
  clear: vi.fn(),
  insert: vi.fn(),
  shift: vi.fn(),
  remove: vi.fn(),
  moveAxis: vi.fn(() => true),
  goTo: vi.fn(),
  freeze: vi.fn(),
  setOptions: vi.fn(),
  sortColumn: vi.fn(),
  sortRange: vi.fn(),
  toggleFilter: vi.fn(),
  cut: vi.fn(),
  copy: vi.fn(),
  paste: vi.fn(),
  pasteSpecial: vi.fn(),
  group: vi.fn(),
  ungroup: vi.fn(),
  foldAll: vi.fn(),
  hide: vi.fn(),
  resize: vi.fn(),
  openLink: vi.fn(),
  openCustomFormat: vi.fn(),
  openCustomCurrency: vi.fn(),
  openCustomDateTime: vi.fn(),
  merge: vi.fn(),
  unmerge: vi.fn(),
  borders: vi.fn(),
  paintStart: vi.fn(),
  paintStop: vi.fn(),
  openCustomAngle: vi.fn(),
  openSortRange: vi.fn(),
});

const noGroups = { selected: false, collapsed: false, expanded: false };
const FOLDS = [
  'collapse-all-column-groups',
  'collapse-all-row-groups',
  'expand-all-column-groups',
  'expand-all-row-groups',
];

const port = (over: Partial<GridMenuPort> = {}): GridMenuPort => ({
  canWrite: true,
  canShape: true,
  range: { r1: 1, c1: 1, r2: 3, c2: 1 },
  active: { r: 1, c: 1 },
  rows: 10,
  cols: 5,
  format: undefined,
  frozenRows: 0,
  frozenCols: 0,
  showGrid: true,
  filtered: false,
  outline: { r: noGroups, c: noGroups },
  link: null,
  recentCodes: [],
  merged: false,
  painting: false,
  borderLine: { colour: '#000000', line: 'thin' },
  chooseBorderLine: vi.fn(),
  act: actions(),
  ...over,
});

// docs/specs/029-sheets/surface.md "Menu bar"; grid-and-editing.md "Who may do what".
describe('gridMenuBindings', () => {
  it('binds every built grid item of the menus and the toolbar, and nothing they do not hold', () => {
    const bound = Object.keys(gridMenuBindings(port()));
    const contexts = Object.values(SPREADSHEET_CONTEXT_MENUS).map((entries) => ({
      id: 'context',
      label: 'Context',
      entries,
    }));
    const built = catalogueItems([...spreadsheetMenus('ods', 'en-GB'), ...contexts])
      .filter(({ item }) => item.status === 'built')
      .map(({ item }) => item.id)
      .concat(SPREADSHEET_TOOLBAR.flatMap((g) => g.controls).map((c) => c.id))
      // A shortcut no item names binds under its row's id (the border shortcuts).
      .concat(SPREADSHEET_SHORTCUTS.filter((row) => row.status === 'built').map((row) => row.id));
    for (const id of bound) expect(built, id).toContain(id);
  });

  it('gives a Viewer Copy and the folds alone, a Participant the value items, an Editor the rest', () => {
    expect(
      Object.keys(gridMenuBindings(port({ canWrite: false, canShape: false }))).sort(),
    ).toEqual(['copy', ...FOLDS].sort());
    expect(Object.keys(gridMenuBindings(port({ canShape: false }))).sort()).toEqual(
      ['copy', 'cut', 'delete-values', 'paste', 'paste-values-only', ...FOLDS].sort(),
    );
    expect(Object.keys(gridMenuBindings(port())).length).toBeGreaterThan(50);
  });

  it('runs the clipboard and clearing items', () => {
    const p = port();
    const b = gridMenuBindings(p);
    for (const id of ['cut', 'copy', 'paste', 'paste-values-only', 'paste-format-only'])
      b[id]!.run();
    b['delete-values']!.run();
    b['clear-formatting']!.run();
    expect(p.act.cut).toHaveBeenCalled();
    expect(p.act.copy).toHaveBeenCalled();
    expect(p.act.paste).toHaveBeenCalled();
    expect(p.act.pasteSpecial).toHaveBeenNthCalledWith(1, 'values');
    expect(p.act.pasteSpecial).toHaveBeenNthCalledWith(2, 'formats');
    // Paste Special's other items (grid-and-editing.md "Clipboard").
    const more = {
      'paste-formula-only': 'formulas',
      'paste-conditional-formatting-only': 'formatRules',
      'paste-data-validation-only': 'validation',
      'paste-transposed': 'transposed',
      'paste-column-widths-only': 'widths',
      'paste-all-except-borders': 'noBorders',
    } as const;
    for (const [id, mode] of Object.entries(more)) {
      b[id]!.run();
      expect(p.act.pasteSpecial).toHaveBeenLastCalledWith(mode);
    }
    expect(p.act.clear).toHaveBeenNthCalledWith(1, 'inputs');
    expect(p.act.clear).toHaveBeenNthCalledWith(2, 'formats');
  });

  it('moves the selected lines one place and the selection with them, dimmed at the edge', () => {
    const p = port({ range: { r1: 1, c1: 1, r2: 3, c2: 2 } });
    const b = gridMenuBindings(p);
    b['move-row-up']!.run();
    expect(p.act.moveAxis).toHaveBeenLastCalledWith('r', 1, 3, 0);
    expect(p.act.goTo).toHaveBeenLastCalledWith({ r1: 0, c1: 1, r2: 2, c2: 2 });
    b['move-row-down']!.run();
    expect(p.act.moveAxis).toHaveBeenLastCalledWith('r', 1, 3, 5);
    expect(p.act.goTo).toHaveBeenLastCalledWith({ r1: 2, c1: 1, r2: 4, c2: 2 });
    b['move-column-left']!.run();
    expect(p.act.moveAxis).toHaveBeenLastCalledWith('c', 1, 2, 0);
    expect(p.act.goTo).toHaveBeenLastCalledWith({ r1: 1, c1: 0, r2: 3, c2: 1 });
    b['move-column-right']!.run();
    expect(p.act.moveAxis).toHaveBeenLastCalledWith('c', 1, 2, 4);
    expect(p.act.goTo).toHaveBeenLastCalledWith({ r1: 1, c1: 2, r2: 3, c2: 3 });
    const edge = gridMenuBindings(port({ range: { r1: 0, c1: 0, r2: 9, c2: 4 } }));
    expect(
      ['move-row-up', 'move-row-down', 'move-column-left', 'move-column-right'].map(
        (id) => edge[id]!.disabled,
      ),
    ).toEqual([true, true, true, true]);
  });

  it('keeps the selection where it was when a move is refused', () => {
    const p = port();
    vi.mocked(p.act.moveAxis).mockReturnValue(false);
    gridMenuBindings(p)['move-row-up']!.run();
    expect(p.act.goTo).not.toHaveBeenCalled();
  });

  it('counts what insert and delete act on, as Google’s words do', () => {
    const b = gridMenuBindings(port());
    expect(b['insert-rows-above']!.label).toBe('Insert 3 Rows Above');
    expect(b['insert-rows-below']!.label).toBe('Insert 3 Rows Below');
    expect(b['insert-columns-left']!.label).toBe('Insert 1 Column Left');
    expect(b['insert-columns-right']!.label).toBe('Insert 1 Column Right');
    expect(b['delete-rows']!.label).toBe('Delete Rows 2 - 4');
    expect(b['delete-columns']!.label).toBe('Delete Column B');
    const wide = gridMenuBindings(port({ range: { r1: 4, c1: 0, r2: 4, c2: 27 } }));
    expect(wide['delete-rows']!.label).toBe('Delete Row 5');
    expect(wide['delete-columns']!.label).toBe('Delete Columns A - AB');
  });

  it('inserts, deletes and shifts', () => {
    const p = port();
    const b = gridMenuBindings(p);
    for (const id of [
      'insert-rows-above',
      'insert-rows-below',
      'insert-columns-left',
      'insert-columns-right',
      'delete-rows',
      'delete-columns',
      'insert-cells-shift-right',
      'insert-cells-shift-down',
      'delete-cells-shift-up',
      'delete-cells-shift-left',
    ])
      b[id]!.run();
    expect(vi.mocked(p.act.insert).mock.calls).toEqual([
      ['r', 'before'],
      ['r', 'after'],
      ['c', 'before'],
      ['c', 'after'],
    ]);
    expect(vi.mocked(p.act.remove).mock.calls).toEqual([['r'], ['c']]);
    expect(vi.mocked(p.act.shift).mock.calls).toEqual([
      ['insertRight'],
      ['insertDown'],
      ['deleteUp'],
      ['deleteLeft'],
    ]);
  });

  it('freezes, ticking what is frozen, Up to the active row and column', () => {
    const p = port({ frozenRows: 2, frozenCols: 0, active: { r: 4, c: 2 } });
    const b = gridMenuBindings(p);
    expect(b['freeze-2-rows']!.checked).toBe(true);
    expect(b['freeze-1-row']!.checked).toBe(false);
    expect(b['freeze-no-columns']!.checked).toBe(true);
    expect(b['freeze-up-to-row']!.label).toBe('Up to Row 5');
    expect(b['freeze-up-to-column']!.label).toBe('Up to Column C');
    expect(b['freeze-no-rows']!.label).toBeUndefined();
    b['freeze-up-to-row']!.run();
    b['freeze-no-rows']!.run();
    b['freeze-up-to-column']!.run();
    b['freeze-1-column']!.run();
    expect(vi.mocked(p.act.freeze).mock.calls).toEqual([[5], [0], [undefined, 3], [undefined, 1]]);
    expect(
      gridMenuBindings(port({ frozenRows: 5, active: { r: 4, c: 0 } }))['freeze-up-to-row']!
        .checked,
    ).toBe(true);
  });

  it('shows or hides the gridlines, ticked while shown', () => {
    const shown = port();
    gridMenuBindings(shown)['show-gridlines']!.run();
    expect(shown.act.setOptions).toHaveBeenCalledWith({ showGrid: false });
    expect(gridMenuBindings(shown)['show-gridlines']!.checked).toBe(true);
    const hidden = port({ showGrid: false });
    gridMenuBindings(hidden)['show-gridlines']!.run();
    expect(hidden.act.setOptions).toHaveBeenCalledWith({ showGrid: true });
    expect(gridMenuBindings(hidden)['show-gridlines']!.checked).toBe(false);
  });

  it('toggles text styles, ticked from the active cell', () => {
    const p = port({ format: { b: true, st: true } });
    const b = gridMenuBindings(p);
    expect(['bold', 'italic', 'underline', 'strikethrough'].map((id) => b[id]!.checked)).toEqual([
      true,
      false,
      false,
      true,
    ]);
    for (const id of ['bold', 'italic', 'underline', 'strikethrough']) b[id]!.run();
    expect(vi.mocked(p.act.toggle).mock.calls).toEqual([['b'], ['i'], ['u'], ['st']]);
  });

  it('sets number formats, Automatic ticked for a cell with none', () => {
    const plain = gridMenuBindings(port());
    expect(plain['number-automatic']!.checked).toBe(true);
    expect(plain['number-financial']!.checked).toBe(false);
    const p = port({ format: { nf: 'percent' } });
    const b = gridMenuBindings(p);
    expect(b['number-percent']!.checked).toBe(true);
    expect(b['number-automatic']!.checked).toBe(false);
    b['number-date-time']!.run();
    expect(p.act.numberFormat).toHaveBeenCalledWith('datetime');
  });

  // formatting.md "Number formats": Currency Rounded is Currency with no decimals, Currency ticked only with some.
  it('sets Financial and Currency Rounded, ticking Currency only while it shows decimals', () => {
    const p = port({ format: { nf: 'currency', dp: 0 } });
    const b = gridMenuBindings(p);
    expect(b['number-currency-rounded']!.checked).toBe(true);
    expect(b['number-currency']!.checked).toBe(false);
    b['number-currency-rounded']!.run();
    expect(p.act.format).toHaveBeenCalledWith({ nf: 'currency', dp: 0, nc: null });
    b['number-financial']!.run();
    expect(p.act.numberFormat).toHaveBeenCalledWith('financial');
    const two = gridMenuBindings(port({ format: { nf: 'currency' } }));
    expect(two['number-currency']!.checked).toBe(true);
    expect(two['number-currency-rounded']!.checked).toBe(false);
  });

  // formatting.md "Number formats" (D194): a recently used code formats the selection, ticked where the cell holds it.
  it('applies a recently used code, ticked while the active cell holds it', () => {
    const p = port({ recentCodes: ['0.0', '#,##0'], format: { nf: 'custom', nc: '#,##0' } });
    const b = gridMenuBindings(p);
    expect(b['number-recent-0']!.checked).toBe(false);
    expect(b['number-recent-1']!.checked).toBe(true);
    b['number-recent-0']!.run();
    expect(p.act.format).toHaveBeenCalledWith({ nf: 'custom', nc: '0.0', dp: null });
    expect(gridOffice(p).recentCodes).toEqual(['0.0', '#,##0']);
  });

  it('opens Format › Number’s three dialogs', () => {
    const p = port();
    gridMenuBindings(p)['custom-number-format']!.run();
    expect(p.act.openCustomFormat).toHaveBeenCalledOnce();
    gridMenuBindings(p)['custom-currency']!.run();
    expect(p.act.openCustomCurrency).toHaveBeenCalledOnce();
    gridMenuBindings(p)['custom-date-and-time']!.run();
    expect(p.act.openCustomDateTime).toHaveBeenCalledOnce();
  });

  it('aligns and wraps, the grid’s defaults clearing the cell’s own', () => {
    const p = port();
    const b = gridMenuBindings(p);
    expect(b['align-middle']!.checked).toBe(true);
    expect(b['wrap-overflow']!.checked).toBe(true);
    expect(b['align-left']!.checked).toBe(false);
    b['align-left']!.run();
    b['align-middle']!.run();
    b['align-bottom']!.run();
    b['wrap-overflow']!.run();
    b['wrap-clip']!.run();
    expect(vi.mocked(p.act.format).mock.calls).toEqual([
      [{ ha: 'l' }],
      [{ va: null }],
      [{ va: 'b' }],
      [{ wr: null }],
      [{ wr: 'c' }],
    ]);
    const set = gridMenuBindings(port({ format: { ha: 'r', va: 't', wr: 'w' } }));
    expect(['align-right', 'align-top', 'wrap-wrap'].map((id) => set[id]!.checked)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('sizes the font, the default clearing the cell’s own', () => {
    const p = port();
    const b = gridMenuBindings(p);
    expect(b['font-size-10']!.checked).toBe(true);
    b['font-size-10']!.run();
    b['font-size-24']!.run();
    expect(vi.mocked(p.act.format).mock.calls).toEqual([[{ fs: null }], [{ fs: 24 }]]);
    expect(gridMenuBindings(port({ format: { fs: 24 } }))['font-size-24']!.checked).toBe(true);
  });

  it('sorts the sheet and the range by the active column, and creates or removes a filter', () => {
    const p = port({ active: { r: 2, c: 3 } });
    const b = gridMenuBindings(p);
    b['sort-sheet-a-to-z']!.run();
    b['sort-sheet-z-to-a']!.run();
    b['sort-range-a-to-z']!.run();
    b['sort-range-z-to-a']!.run();
    b['create-a-filter']!.run();
    expect(vi.mocked(p.act.sortColumn).mock.calls).toEqual([[true], [false]]);
    expect(vi.mocked(p.act.sortRange).mock.calls).toEqual([
      [[{ col: 3, ascending: true }], false],
      [[{ col: 3, ascending: false }], false],
    ]);
    expect(p.act.toggleFilter).toHaveBeenCalled();
    expect(b['create-a-filter']!.label).toBeUndefined();
    expect(gridMenuBindings(port({ filtered: true }))['create-a-filter']!.label).toBe(
      'Remove Filter',
    );
    // Over part of a table, dimmed with why (data-tools.md, D481); a filter on the sheet can still be removed.
    const near = gridMenuBindings(port({ filterNote: 'Overlaps Table1' }))['create-a-filter']!;
    expect([near.disabled, near.note]).toEqual([true, 'Overlaps Table1']);
    const on = gridMenuBindings(port({ filtered: true, filterNote: 'Overlaps Table1' }));
    expect(on['create-a-filter']!.disabled).toBeUndefined();
  });

  // data-tools.md "Sort": an Editor's, as every sort is.
  it("opens Advanced Range Sorting Options' dialog", () => {
    const p = port();
    gridMenuBindings(p)['sort-range-advanced']!.run();
    expect(p.act.openSortRange).toHaveBeenCalledOnce();
    expect(gridMenuBindings(port({ canShape: false }))['sort-range-advanced']).toBeUndefined();
  });
});

// grid-and-editing.md "Groups and the outline": View › Group.
// surface.md "Context menus": a header's Clear, Hide and Resize, Freeze Up to here, and Open Link for anyone (D189).
describe('the context menus’ own bindings', () => {
  it('clears, hides and resizes the selected lines, named by what they act on', () => {
    const p = port({ range: { r1: 1, c1: 1, r2: 3, c2: 3 } });
    const b = gridMenuBindings(p);
    expect(b['clear-rows']?.label).toBe('Clear Rows 2 - 4');
    expect(b['hide-columns']?.label).toBe('Hide Columns B - D');
    expect(b['resize-rows']?.label).toBe('Resize Rows 2 - 4');
    b['clear-rows']!.run();
    b['clear-columns']!.run();
    expect(p.act.clear).toHaveBeenCalledTimes(2);
    expect(p.act.clear).toHaveBeenCalledWith('all');
    b['hide-rows']!.run();
    b['hide-columns']!.run();
    expect(p.act.hide).toHaveBeenNthCalledWith(1, 'r');
    expect(p.act.hide).toHaveBeenNthCalledWith(2, 'c');
    b['resize-rows']!.run();
    b['resize-columns']!.run();
    expect(p.act.resize).toHaveBeenNthCalledWith(1, 'r', 1, 3);
    expect(p.act.resize).toHaveBeenNthCalledWith(2, 'c', 1, 3);
  });

  it('freezes up to the active row and column, named by it', () => {
    const p = port({ active: { r: 4, c: 2 } });
    const b = gridMenuBindings(p);
    expect(b['freeze-up-to-this-row']?.label).toBe('Freeze Up to Row 5');
    expect(b['freeze-up-to-this-column']?.label).toBe('Freeze Up to Column C');
    b['freeze-up-to-this-row']!.run();
    b['freeze-up-to-this-column']!.run();
    expect(p.act.freeze).toHaveBeenNthCalledWith(1, 5);
    expect(p.act.freeze).toHaveBeenNthCalledWith(2, undefined, 3);
  });

  it('opens the active cell’s link for anyone, and is not bound without one', () => {
    expect(gridMenuBindings(port())['open-link']).toBeUndefined();
    const p = port({ canWrite: false, canShape: false, link: 'https://example.com' });
    gridMenuBindings(p)['open-link']!.run();
    expect(p.act.openLink).toHaveBeenCalledWith('https://example.com');
  });
});

describe('View › Group', () => {
  it('groups and ungroups the selection’s lines, named, Ungroup dimmed where none is grouped', () => {
    const p = port({ outline: { r: { ...noGroups, selected: true }, c: noGroups } });
    const b = gridMenuBindings(p);
    expect(b['group-rows']?.label).toBe('Group Rows 2 - 4');
    expect(b['group-columns']?.label).toBe('Group Column B');
    expect(b['ungroup-rows']).toMatchObject({ label: 'Ungroup Rows 2 - 4', disabled: false });
    expect(b['ungroup-columns']).toMatchObject({ label: 'Ungroup Column B', disabled: true });
    for (const id of ['group-rows', 'group-columns', 'ungroup-rows', 'ungroup-columns'])
      b[id]!.run();
    expect(p.act.group).toHaveBeenNthCalledWith(1, 'r');
    expect(p.act.group).toHaveBeenNthCalledWith(2, 'c');
    expect(p.act.ungroup).toHaveBeenNthCalledWith(1, 'r');
    expect(p.act.ungroup).toHaveBeenNthCalledWith(2, 'c');
  });

  it('expands and collapses all, dimmed with nothing to fold', () => {
    const p = port({
      outline: { r: { ...noGroups, collapsed: true }, c: { ...noGroups, expanded: true } },
    });
    const b = gridMenuBindings(p);
    expect(FOLDS.map((id) => b[id]!.disabled)).toEqual([false, true, true, false]);
    for (const id of FOLDS) b[id]!.run();
    expect(vi.mocked(p.act.foldAll).mock.calls).toEqual([
      ['c', true],
      ['r', true],
      ['c', false],
      ['r', false],
    ]);
  });

  it('reads each axis’s groups from the layout', () => {
    const layout = {
      rows: ['ra', 'rb', 'rc', 'rd'],
      cols: ['ca', 'cb'],
      rowDepth: { rb: 1, rd: 1 },
      rowCollapsed: [{ at: 'rd', depth: 1 }],
    };
    expect(gridMenuOutline(layout, { r1: 0, c1: 0, r2: 1, c2: 1 })).toEqual({
      r: { selected: true, collapsed: true, expanded: true },
      c: noGroups,
    });
  });
});

describe('the toolbar’s own bindings', () => {
  it('steps decimals and the font size a point at a time, dimmed at the limits (D128)', () => {
    const p = port({ format: { fs: 12 } });
    const b = gridMenuBindings(p);
    b['decrease-decimal-places']!.run();
    b['increase-decimal-places']!.run();
    expect(vi.mocked(p.act.decimals).mock.calls).toEqual([[-1], [1]]);
    b['font-size-decrease']!.run();
    b['font-size-increase']!.run();
    expect(vi.mocked(p.act.format).mock.calls).toEqual([[{ fs: 11 }], [{ fs: 13 }]]);
    const plain = port();
    gridMenuBindings(plain)['font-size-increase']!.run();
    expect(plain.act.format).toHaveBeenCalledWith({ fs: 11 });
    expect(gridMenuBindings(port({ format: { fs: 6 } }))['font-size-decrease']!.disabled).toBe(
      true,
    );
    expect(gridMenuBindings(port({ format: { fs: 400 } }))['font-size-increase']!.disabled).toBe(
      true,
    );
    expect(b['font-size-increase']!.disabled).toBe(false);
  });

  it('presses Create a Filter while the sheet has one', () => {
    expect(gridMenuBindings(port({ filtered: true }))['create-a-filter']!.checked).toBe(true);
    expect(gridMenuBindings(port())['create-a-filter']!.checked).toBe(false);
  });

  it('keeps a typed size whole, within 6 to 400, the default clearing the cell’s own (D128)', () => {
    expect(sheetFontSize(14)).toBe(14);
    expect(sheetFontSize(13.6)).toBe(14);
    expect(sheetFontSize(2)).toBe(6);
    expect(sheetFontSize(400)).toBe(400);
    expect(sheetFontSize(401)).toBe(400);
    expect(sheetFontSize(10)).toBeNull();
  });
});

// formatting.md "Text and colour" (D199): the toolbar's colours over the selection, an Editor's.
describe('gridColours', () => {
  it('reads the active cell\u2019s colours, sets and resets the selection\u2019s', () => {
    const p = port({ format: { fc: '#ff0000' } });
    const colours = gridOffice(p).colours!;
    expect(colours['text-colour']).toMatchObject({ leading: 'Reset', none: '#000000' });
    expect(colours['text-colour']!.read()).toBe('#ff0000');
    expect(colours['fill-colour']!.read()).toBeUndefined();
    colours['fill-colour']!.set('#00ff00');
    expect(p.act.format).toHaveBeenCalledWith({ bg: '#00ff00' });
    colours['text-colour']!.set(null);
    expect(p.act.format).toHaveBeenCalledWith({ fc: null });
  });

  // formatting.md "Themes": the theme's nine colours lead each picker, picked by name.
  it('leads each picker with the theme’s colours, Standard’s for none', () => {
    const ocean = SPREADSHEET_THEMES[2]!;
    const row = gridOffice(port({ theme: ocean })).colours!['fill-colour']!.theme!;
    expect(row).toHaveLength(9);
    expect(row[2]).toEqual({
      id: 'theme:accent1',
      colour: ocean.colours.accent1,
      label: 'Accent 1',
    });
    expect(gridOffice(port()).colours!['text-colour']!.theme![0]!.colour).toBe('#000000');
    // The theme's font is the cells' default: shown for none, set as none.
    const themed = port({ theme: ocean });
    expect(gridOffice(themed).fontFamily).toBe('Roboto');
    gridOffice(themed).setFontFamily('Roboto');
    expect(themed.act.format).toHaveBeenCalledWith({ ff: null });
  });

  it('gives no one but an Editor the colours', () => {
    expect(gridOffice(port({ canShape: false })).colours).toBeNull();
  });
});

describe('gridOffice', () => {
  it('gives an Editor the active cell’s size and sets it, and no one else either', () => {
    const p = port({ format: { fs: 18 } });
    const editor = gridOffice(p);
    expect(editor.fontSize).toBe(18);
    expect(Object.keys(editor.actions)).toContain('bold');
    editor.setFontSize(24);
    expect(p.act.format).toHaveBeenCalledWith({ fs: 24 });
    expect(gridOffice(port()).fontSize).toBe(10);
    const participant = port({ canShape: false });
    const office = gridOffice(participant);
    expect(office.fontSize).toBeNull();
    office.setFontSize(24);
    expect(participant.act.format).not.toHaveBeenCalled();
  });

  it('gives an Editor the active cell’s family, Arial for none, and sets the selection’s (formatting.md "Font")', () => {
    const p = port({ format: { ff: 'Lora' } });
    const editor = gridOffice(p);
    expect(editor.fontFamily).toBe('Lora');
    expect(gridOffice(port()).fontFamily).toBe('Arial');
    editor.setFontFamily('Roboto Mono');
    editor.setFontFamily('Arial');
    expect(vi.mocked(p.act.format).mock.calls).toEqual([[{ ff: 'Roboto Mono' }], [{ ff: null }]]);
    const participant = port({ canShape: false });
    const office = gridOffice(participant);
    expect(office.fontFamily).toBeNull();
    office.setFontFamily('Lora');
    expect(participant.act.format).not.toHaveBeenCalled();
  });
});

describe('gridOffice borders', () => {
  it('gives an Editor the Borders panel in the line chosen, and no one else', () => {
    const p = port({ borderLine: { colour: '#ff0000', line: 'thick' } });
    const borders = gridOffice(p).borders!;
    borders.apply('all');
    expect(p.act.borders).toHaveBeenCalledWith('all', { w: 3, s: 'solid', c: '#ff0000' });
    borders.setLine('dotted');
    expect(p.chooseBorderLine).toHaveBeenCalledWith({ colour: '#ff0000', line: 'dotted' });
    expect(gridOffice(port({ canShape: false })).borders).toBeNull();
    gridMenuBindings(p)['apply-outer-border']!.run();
    expect(p.act.borders).toHaveBeenLastCalledWith('outer', { w: 3, s: 'solid', c: '#ff0000' });
  });

  // formatting.md "Alignment, wrapping, rotation": an Editor's, as every format is.
  it("gives an Editor the rotations, ticked by the active cell, and Custom Angle's dialog", () => {
    const p = port({ format: { ro: -45 } });
    const bound = gridMenuBindings(p);
    expect(bound['rotate-tilt-down']!.checked).toBe(true);
    bound['rotate-up']!.run();
    expect(p.act.format).toHaveBeenCalledWith({ ro: 90 });
    bound['rotate-custom-angle']!.run();
    expect(p.act.openCustomAngle).toHaveBeenCalledOnce();
    expect(gridMenuBindings(port({ canShape: false }))['rotate-none']).toBeUndefined();
  });
});

describe('historyBindings', () => {
  it('binds Undo and Redo for anyone who writes, dimmed without a step', () => {
    const history = { undo: vi.fn(), redo: vi.fn(), canUndo: true, canRedo: false };
    const b = historyBindings(history, true);
    expect(b.undo!.disabled).toBe(false);
    expect(b.redo!.disabled).toBe(true);
    b.undo!.run();
    b.redo!.run();
    expect(history.undo).toHaveBeenCalled();
    expect(history.redo).toHaveBeenCalled();
    expect(historyBindings(history, false)).toEqual({});
    expect(historyBindings(null, true)).toEqual({});
  });
});

// spreadsheet.md "Sheets in the sheet bar": Insert › Sheet adds after the open sheet (D170), for an Editor.
describe('sheetBarBindings', () => {
  it('binds Insert › Sheet and View › Hidden Sheets for an Editor alone (D180)', () => {
    const add = vi.fn();
    const listSheets = vi.fn();
    const bar = { canChange: true, add, hiddenCount: 2, listSheets };
    sheetBarBindings(bar)['insert-sheet']!.run();
    expect(add).toHaveBeenCalledWith('afterOpen');
    const hidden = sheetBarBindings(bar)['hidden-sheets']!;
    expect([hidden.label, hidden.disabled]).toEqual(['Hidden Sheets (2)', false]);
    hidden.run();
    expect(listSheets).toHaveBeenCalledWith(true);
    expect(sheetBarBindings({ ...bar, hiddenCount: 0 })['hidden-sheets']!.disabled).toBe(true);
    expect(sheetBarBindings({ ...bar, canChange: false })).toEqual({});
    expect(sheetBarBindings(null)).toEqual({});
  });
});

describe('bindingsSignature', () => {
  it('changes with what the menus draw, never with a new run', () => {
    const run = () => {};
    const a = bindingsSignature({ bold: { run, checked: true }, cut: { run } });
    expect(bindingsSignature({ cut: { run: () => {} }, bold: { run, checked: true } })).toBe(a);
    expect(bindingsSignature({ bold: { run }, cut: { run } })).not.toBe(a);
    expect(
      bindingsSignature({ bold: { run, checked: true }, cut: { run, disabled: true } }),
    ).not.toBe(a);
    expect(bindingsSignature({ bold: { run, checked: true }, cut: { run, label: 'x' } })).not.toBe(
      a,
    );
  });
});
