// What the spreadsheet's menu items run (docs/specs/029-sheets/surface.md "Menu bar"): each built item bound by its id
// to what the grid already does, while the session's role may use it (grid-and-editing.md "Who may do what"). A tick
// and a dimmed item are read from the grid as the menus are drawn; labels count what an item acts on, as Google's do.
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  columnLetters,
  groupedWithin,
  outlineOf,
  type SheetLayout,
  type CellFormat,
  type FormatPatch,
  type MergeMode,
  type GridRange,
  type NumberFormatKind,
  type PasteSpecialMode,
} from '@livedoc/sheets';
import type { OfficeAction, OfficeActions } from '@/lib/office/office-catalogue';
import type { OfficeColours } from '@/components/office/OfficeColourControl';
import { FREEZE_ITEMS, MENU_FONT_SIZES, NUMBER_FORMAT_ITEMS } from './spreadsheet-menus';
import { lineSpan } from './line-span';
import { recentFormatItemId } from './recent-formats';
import { mergeBindings } from './merge-bindings';
import { cellFamilyOf, cellFontPatch } from './spreadsheet-fonts';

type Axis = 'r' | 'c';

/** The grid's actions the menus run (components/sheets/useSheetActions, useSheetClipboard). */
export type GridMenuActions = {
  toggle: (flag: 'b' | 'i' | 'u' | 'st') => void;
  numberFormat: (nf: NumberFormatKind) => void;
  decimals: (delta: 1 | -1) => void;
  format: (patch: FormatPatch) => void;
  clear: (what: 'inputs' | 'formats' | 'all') => void;
  insert: (axis: Axis, side: 'before' | 'after') => void;
  shift: (mode: 'insertDown' | 'insertRight' | 'deleteUp' | 'deleteLeft') => void;
  remove: (axis: Axis) => void;
  moveAxis: (axis: Axis, from: number, to: number, before: number) => boolean;
  goTo: (range: GridRange) => void;
  freeze: (rows?: number, cols?: number) => void;
  setOptions: (options: { showGrid?: boolean }) => void;
  sortColumn: (ascending: boolean) => void;
  sortRange: (keys: { col: number; ascending: boolean }[], header: boolean) => void;
  toggleFilter: () => void;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  pasteSpecial: (mode: PasteSpecialMode) => void;
  group: (axis: Axis) => void;
  ungroup: (axis: Axis) => void;
  foldAll: (axis: Axis, collapsed: boolean) => void;
  // The context menus' own (surface.md "Context menus"): the selected lines hidden, the Resize dialog over lines
  // from..to, the active cell's link opened.
  hide: (axis: Axis) => void;
  resize: (axis: Axis, from: number, to: number) => void;
  openLink: (url: string) => void;
  // Format › Number › Custom Number Format's dialog (formatting.md "Number formats").
  openCustomFormat: () => void;
  // Format › Number › Custom Currency's dialog.
  openCustomCurrency: () => void;
  // Format › Number › Custom Date and Time's dialog.
  openCustomDateTime: () => void;
  // Format › Merge Cells (formatting.md "Merges"): asking first where a merge would clear values.
  merge: (mode: MergeMode) => void;
  unmerge: () => void;
};

/** An axis's groups as the menus read them: any in the selection's lines, any collapsed, any expanded. */
export type GridMenuOutline = { selected: boolean; collapsed: boolean; expanded: boolean };

/** What the grid offers the menus: the role, the selection, the active cell's look, the sheet's layout. */
export type GridMenuPort = {
  // A Participant and up write cells; only an Editor shapes the sheet.
  canWrite: boolean;
  canShape: boolean;
  range: GridRange;
  active: { r: number; c: number };
  rows: number;
  cols: number;
  format: CellFormat | undefined;
  frozenRows: number;
  frozenCols: number;
  showGrid: boolean;
  filtered: boolean;
  outline: Record<Axis, GridMenuOutline>;
  // The active cell's link (a HYPERLINK), or null.
  link: string | null;
  // The Number menu's recently used codes, ranked (formatting.md "Number formats", D194).
  recentCodes: readonly string[];
  // Whether the selection holds a merge (formatting.md "Merges").
  merged: boolean;
  act: GridMenuActions;
};

/** The person's one timeline (grid-and-editing.md "Undo"): the editor's undo and redo. */
export type SpreadsheetHistory = {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

const run = (fn: () => void, extra: Omit<OfficeAction, 'run'> = {}): OfficeAction => ({
  run: fn,
  ...extra,
});

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** A span of lines as Edit's items name it: "Row 3", "Rows 2 - 4", "Column B", "Columns B - D". */
function spanLabel(axis: Axis, a: number, b: number): string {
  const span = lineSpan(axis, a, b);
  return span.charAt(0).toUpperCase() + span.slice(1);
}

function writeBindings(port: GridMenuPort): Record<string, OfficeAction> {
  const { act } = port;
  return {
    cut: run(act.cut),
    paste: run(act.paste),
    'paste-values-only': run(() => act.pasteSpecial('values')),
    'delete-values': run(() => act.clear('inputs')),
  };
}

// Expand all and Collapse all, anyone's: an Editor's for everyone, anyone else's for themselves (D163).
function foldBindings(port: GridMenuPort): Record<string, OfficeAction> {
  const { act, outline } = port;
  return {
    'expand-all-row-groups': run(() => act.foldAll('r', false), {
      disabled: !outline.r.collapsed,
    }),
    'collapse-all-row-groups': run(() => act.foldAll('r', true), {
      disabled: !outline.r.expanded,
    }),
    'expand-all-column-groups': run(() => act.foldAll('c', false), {
      disabled: !outline.c.collapsed,
    }),
    'collapse-all-column-groups': run(() => act.foldAll('c', true), {
      disabled: !outline.c.expanded,
    }),
  };
}

function shapeBindings(port: GridMenuPort): Record<string, OfficeAction> {
  const { act, range: g, format: f } = port;
  const rowsSelected = g.r2 - g.r1 + 1;
  const colsSelected = g.c2 - g.c1 + 1;
  // Edit › Move: the selected lines one place along, the selection going with them, as Google's does.
  const move = (axis: Axis, step: -1 | 1) => {
    const [a, b] = axis === 'r' ? [g.r1, g.r2] : [g.c1, g.c2];
    if (!act.moveAxis(axis, a, b, step < 0 ? a - 1 : b + 2)) return;
    act.goTo(
      axis === 'r'
        ? { ...g, r1: g.r1 + step, r2: g.r2 + step }
        : { ...g, c1: g.c1 + step, c2: g.c2 + step },
    );
  };
  const out: Record<string, OfficeAction> = {
    'paste-format-only': run(() => act.pasteSpecial('formats')),
    'paste-formula-only': run(() => act.pasteSpecial('formulas')),
    'paste-conditional-formatting-only': run(() => act.pasteSpecial('formatRules')),
    'paste-data-validation-only': run(() => act.pasteSpecial('validation')),
    'paste-transposed': run(() => act.pasteSpecial('transposed')),
    'paste-column-widths-only': run(() => act.pasteSpecial('widths')),
    'paste-all-except-borders': run(() => act.pasteSpecial('noBorders')),
    'move-row-up': run(() => move('r', -1), { disabled: g.r1 === 0 }),
    'move-row-down': run(() => move('r', 1), { disabled: g.r2 >= port.rows - 1 }),
    'move-column-left': run(() => move('c', -1), { disabled: g.c1 === 0 }),
    'move-column-right': run(() => move('c', 1), { disabled: g.c2 >= port.cols - 1 }),
    'delete-rows': run(() => act.remove('r'), { label: `Delete ${spanLabel('r', g.r1, g.r2)}` }),
    'delete-columns': run(() => act.remove('c'), {
      label: `Delete ${spanLabel('c', g.c1, g.c2)}`,
    }),
    'group-rows': run(() => act.group('r'), { label: `Group ${spanLabel('r', g.r1, g.r2)}` }),
    'group-columns': run(() => act.group('c'), { label: `Group ${spanLabel('c', g.c1, g.c2)}` }),
    'ungroup-rows': run(() => act.ungroup('r'), {
      label: `Ungroup ${spanLabel('r', g.r1, g.r2)}`,
      disabled: !port.outline.r.selected,
    }),
    'ungroup-columns': run(() => act.ungroup('c'), {
      label: `Ungroup ${spanLabel('c', g.c1, g.c2)}`,
      disabled: !port.outline.c.selected,
    }),
    ...lineBindings(port),
    'delete-cells-shift-up': run(() => act.shift('deleteUp')),
    'delete-cells-shift-left': run(() => act.shift('deleteLeft')),
    'show-gridlines': run(() => act.setOptions({ showGrid: !port.showGrid }), {
      checked: port.showGrid,
    }),
    'insert-cells-shift-right': run(() => act.shift('insertRight')),
    'insert-cells-shift-down': run(() => act.shift('insertDown')),
    'insert-rows-above': run(() => act.insert('r', 'before'), {
      label: `Insert ${plural(rowsSelected, 'Row')} Above`,
    }),
    'insert-rows-below': run(() => act.insert('r', 'after'), {
      label: `Insert ${plural(rowsSelected, 'Row')} Below`,
    }),
    'insert-columns-left': run(() => act.insert('c', 'before'), {
      label: `Insert ${plural(colsSelected, 'Column')} Left`,
    }),
    'insert-columns-right': run(() => act.insert('c', 'after'), {
      label: `Insert ${plural(colsSelected, 'Column')} Right`,
    }),
    bold: run(() => act.toggle('b'), { checked: !!f?.b }),
    italic: run(() => act.toggle('i'), { checked: !!f?.i }),
    underline: run(() => act.toggle('u'), { checked: !!f?.u }),
    strikethrough: run(() => act.toggle('st'), { checked: !!f?.st }),
    'clear-formatting': run(() => act.clear('formats')),
    'custom-number-format': run(act.openCustomFormat),
    'custom-currency': run(act.openCustomCurrency),
    'custom-date-and-time': run(act.openCustomDateTime),
    ...Object.fromEntries(
      port.recentCodes.map((nc, i) => [
        recentFormatItemId(i),
        run(() => act.format({ nf: 'custom', nc, dp: null }), {
          checked: f?.nf === 'custom' && f.nc === nc,
        }),
      ]),
    ),
    'sort-sheet-a-to-z': run(() => act.sortColumn(true)),
    'sort-sheet-z-to-a': run(() => act.sortColumn(false)),
    'sort-range-a-to-z': run(() => act.sortRange([{ col: port.active.c, ascending: true }], false)),
    'sort-range-z-to-a': run(() =>
      act.sortRange([{ col: port.active.c, ascending: false }], false),
    ),
    'create-a-filter': run(act.toggleFilter, {
      checked: port.filtered,
      ...(port.filtered ? { label: 'Remove Filter' } : {}),
    }),
    // The toolbar's own (surface.md "Toolbar"): decimals, and the font size a point at a time (D128).
    'decrease-decimal-places': run(() => act.decimals(-1)),
    'increase-decimal-places': run(() => act.decimals(1)),
    'font-size-decrease': run(() => setFontSize(act, fontSizeOf(f) - 1), {
      disabled: fontSizeOf(f) <= FONT_SIZE_MIN,
    }),
    'font-size-increase': run(() => setFontSize(act, fontSizeOf(f) + 1), {
      disabled: fontSizeOf(f) >= FONT_SIZE_MAX,
    }),
  };
  for (const { id, axis, count } of FREEZE_ITEMS) {
    const frozen = axis === 'r' ? port.frozenRows : port.frozenCols;
    const n = count === 'active' ? (axis === 'r' ? port.active.r : port.active.c) + 1 : count;
    const freeze = () => (axis === 'r' ? act.freeze(n) : act.freeze(undefined, n));
    const label =
      count === 'active'
        ? `Up to ${axis === 'r' ? `Row ${n}` : `Column ${columnLetters(n - 1)}`}`
        : undefined;
    out[id] = run(freeze, { checked: frozen === n, ...(label ? { label } : {}) });
  }
  // An item fixing its decimals (Currency Rounded) is ticked by them; Currency only while it shows some.
  for (const { id, nf, dp } of NUMBER_FORMAT_ITEMS) {
    const same = (f?.nf ?? 'auto') === nf;
    const rounded = nf === 'currency' && f?.dp === 0;
    out[id] =
      dp === undefined
        ? run(() => act.numberFormat(nf), { checked: same && !rounded })
        : run(() => act.format({ nf, dp, nc: null }), { checked: same && f?.dp === dp });
  }
  const aligns = [
    ['align-left', 'ha', 'l'],
    ['align-centre', 'ha', 'c'],
    ['align-right', 'ha', 'r'],
    ['align-top', 'va', 't'],
    ['align-middle', 'va', 'm'],
    ['align-bottom', 'va', 'b'],
    ['wrap-overflow', 'wr', 'o'],
    ['wrap-wrap', 'wr', 'w'],
    ['wrap-clip', 'wr', 'c'],
  ] as const;
  // Middle and Overflow are the grid's own defaults: setting them clears the cell's own.
  const defaults = { ha: undefined, va: 'm', wr: 'o' } as const;
  for (const [id, key, value] of aligns) {
    const now = f?.[key] ?? defaults[key];
    out[id] = run(() => act.format({ [key]: value === defaults[key] ? null : value }), {
      checked: now === value,
    });
  }
  for (const size of MENU_FONT_SIZES) {
    out[`font-size-${size}`] = run(() => setFontSize(act, size), {
      checked: fontSizeOf(f) === size,
    });
  }
  return out;
}

// A header menu's Clear, Hide and Resize of the selected lines, and Freeze Up to the active cell's row or column
// (surface.md "Context menus"), each named by what it acts on.
function lineBindings({ act, range: g, active }: GridMenuPort): Record<string, OfficeAction> {
  const out: Record<string, OfficeAction> = {};
  for (const [axis, noun] of [
    ['r', 'rows'],
    ['c', 'columns'],
  ] as const) {
    const [a, b] = axis === 'r' ? [g.r1, g.r2] : [g.c1, g.c2];
    const span = spanLabel(axis, a, b);
    out[`clear-${noun}`] = run(() => act.clear('all'), { label: `Clear ${span}` });
    out[`hide-${noun}`] = run(() => act.hide(axis), { label: `Hide ${span}` });
    out[`resize-${noun}`] = run(() => act.resize(axis, a, b), { label: `Resize ${span}` });
  }
  const row = active.r + 1;
  const col = active.c + 1;
  out['freeze-up-to-this-row'] = run(() => act.freeze(row), { label: `Freeze Up to Row ${row}` });
  out['freeze-up-to-this-column'] = run(() => act.freeze(undefined, col), {
    label: `Freeze Up to Column ${columnLetters(col - 1)}`,
  });
  return out;
}

/** Each axis's groups as the menus read them, from the layout this person sees (D163). */
export function gridMenuOutline(layout: SheetLayout, g: GridRange): Record<Axis, GridMenuOutline> {
  const of = (axis: Axis, a: number, b: number): GridMenuOutline => {
    const { groups } = outlineOf(layout, axis);
    return {
      selected: groupedWithin(layout, axis, a, b),
      collapsed: groups.some((x) => x.collapsed),
      expanded: groups.some((x) => !x.collapsed),
    };
  };
  return { r: of('r', g.r1, g.r2), c: of('c', g.c1, g.c2) };
}

const fontSizeOf = (f: CellFormat | undefined) => f?.fs ?? FONT_SIZE_DEFAULT;

/** A size asked for, kept whole and within the grid's limits; the default clears the cell's own (D128). */
export function sheetFontSize(pt: number): number | null {
  const size = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(pt)));
  return size === FONT_SIZE_DEFAULT ? null : size;
}

function setFontSize(act: GridMenuActions, pt: number) {
  act.format({ fs: sheetFontSize(pt) });
}

/** What the open sheet offers the title row: its items' bindings and the active cell's font size. */
export type GridOffice = {
  actions: OfficeActions;
  // The toolbar's Text Colour and Fill Colour, for an Editor; null for anyone else (formatting.md "Text and colour").
  colours: OfficeColours | null;
  // The Number menu's recently used codes (D194), for the title row's catalogue.
  recentCodes: readonly string[];
  // The active cell's size in points; null while no sheet is open or the session may not format.
  fontSize: number | null;
  setFontSize: (pt: number) => void;
  // The active cell's family (Arial where it sets none); null while no sheet is open or the session may not format.
  fontFamily: string | null;
  setFontFamily: (family: string) => void;
};

/**
 * Text Colour and Fill Colour over the selection (formatting.md "Text and colour", D199): each reads the active cell's
 * own colour and sets the selection's, Reset taking it away.
 */
export function gridColours({ format: f, act }: GridMenuPort): OfficeColours {
  return {
    'text-colour': {
      read: () => f?.fc,
      set: (colour) => act.format({ fc: colour }),
      leading: 'Reset',
      none: '#000000',
    },
    'fill-colour': {
      read: () => f?.bg,
      set: (colour) => act.format({ bg: colour }),
      leading: 'Reset',
    },
  };
}

/** The grid's menu and toolbar bindings, and its font size and family for an Editor. */
export function gridOffice(port: GridMenuPort): GridOffice {
  const editor = port.canWrite && port.canShape;
  return {
    actions: gridMenuBindings(port),
    colours: editor ? gridColours(port) : null,
    recentCodes: port.recentCodes,
    fontSize: editor ? fontSizeOf(port.format) : null,
    setFontSize: (pt) => {
      if (editor) setFontSize(port.act, pt);
    },
    fontFamily: editor ? cellFamilyOf(port.format) : null,
    setFontFamily: (family) => {
      if (editor) port.act.format(cellFontPatch(family));
    },
  };
}

/**
 * The grid's items for this session: Copy and the active cell's link for anyone, values for a Participant, the rest for
 * an Editor.
 */
export function gridMenuBindings(port: GridMenuPort): OfficeActions {
  const { link } = port;
  return {
    copy: run(port.act.copy),
    ...(link ? { 'open-link': run(() => port.act.openLink(link)) } : {}),
    ...foldBindings(port),
    ...(port.canWrite ? writeBindings(port) : {}),
    ...(port.canWrite && port.canShape ? shapeBindings(port) : {}),
    ...(port.canWrite && port.canShape
      ? mergeBindings({
          range: port.range,
          merged: port.merged,
          merge: port.act.merge,
          unmerge: port.act.unmerge,
        })
      : {}),
  };
}

/**
 * The sheet bar's items, for an Editor: Insert › Sheet adds a sheet after the open one (D170); View › Hidden Sheets,
 * counting them and dimmed at none, opens All Sheets (D180).
 */
export function sheetBarBindings(
  bar: {
    canChange: boolean;
    add: (place: 'afterOpen') => void;
    hiddenCount: number;
    listSheets: (open: boolean) => void;
  } | null,
): OfficeActions {
  if (!bar?.canChange) return {};
  return {
    'insert-sheet': run(() => bar.add('afterOpen')),
    'hidden-sheets': run(() => bar.listSheets(true), {
      label: `Hidden Sheets (${bar.hiddenCount})`,
      disabled: bar.hiddenCount === 0,
    }),
  };
}

/** Undo and Redo for anyone who writes, dimmed without a step to take. */
export function historyBindings(
  history: SpreadsheetHistory | null,
  canWrite: boolean,
): OfficeActions {
  if (!history || !canWrite) return {};
  return {
    undo: run(history.undo, { disabled: !history.canUndo }),
    redo: run(history.redo, { disabled: !history.canRedo }),
  };
}

/** A binding set's signature: what the menus draw of it (ids, ticks, dimmed, words), to publish only on change. */
export function bindingsSignature(actions: OfficeActions): string {
  return Object.keys(actions)
    .sort()
    .map((id) => {
      const a = actions[id]!;
      return `${id}:${a.checked ? 1 : 0}${a.disabled ? 1 : 0}${a.label ?? ''}`;
    })
    .join('|');
}
