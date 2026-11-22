// What the spreadsheet's menu items run (docs/specs/029-sheets/surface.md "Menu bar"): each built item bound by its id
// to what the grid already does, while the session's role may use it (grid-and-editing.md "Who may do what"). A tick
// and a dimmed item are read from the grid as the menus are drawn; labels count what an item acts on, as Google's do.
import {
  FONT_SIZE_DEFAULT,
  columnLetters,
  type CellFormat,
  type FormatPatch,
  type GridRange,
  type NumberFormatKind,
} from '@livedoc/sheets';
import type { OfficeAction, OfficeActions } from '@/lib/office/office-catalogue';
import { FREEZE_ITEMS, MENU_FONT_SIZES, NUMBER_FORMAT_ITEMS } from './spreadsheet-menus';

type Axis = 'r' | 'c';

/** The grid's actions the menus run (components/sheets/useSheetActions, useSheetClipboard). */
export type GridMenuActions = {
  toggle: (flag: 'b' | 'i' | 'u' | 'st') => void;
  numberFormat: (nf: NumberFormatKind) => void;
  format: (patch: FormatPatch) => void;
  clear: (what: 'inputs' | 'formats') => void;
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
  pasteSpecial: (mode: 'values' | 'formats') => void;
};

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

/** A span of lines as Google names it: "Row 3", "Rows 2 - 4", "Column B", "Columns B - D". */
function spanLabel(axis: Axis, a: number, b: number): string {
  const name = (p: number) => (axis === 'r' ? String(p + 1) : columnLetters(p));
  const noun = axis === 'r' ? 'Row' : 'Column';
  return a === b ? `${noun} ${name(a)}` : `${noun}s ${name(a)} - ${name(b)}`;
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
    'move-row-up': run(() => move('r', -1), { disabled: g.r1 === 0 }),
    'move-row-down': run(() => move('r', 1), { disabled: g.r2 >= port.rows - 1 }),
    'move-column-left': run(() => move('c', -1), { disabled: g.c1 === 0 }),
    'move-column-right': run(() => move('c', 1), { disabled: g.c2 >= port.cols - 1 }),
    'delete-rows': run(() => act.remove('r'), { label: `Delete ${spanLabel('r', g.r1, g.r2)}` }),
    'delete-columns': run(() => act.remove('c'), {
      label: `Delete ${spanLabel('c', g.c1, g.c2)}`,
    }),
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
    'sort-sheet-a-to-z': run(() => act.sortColumn(true)),
    'sort-sheet-z-to-a': run(() => act.sortColumn(false)),
    'sort-range-a-to-z': run(() => act.sortRange([{ col: port.active.c, ascending: true }], false)),
    'sort-range-z-to-a': run(() =>
      act.sortRange([{ col: port.active.c, ascending: false }], false),
    ),
    'create-a-filter': run(act.toggleFilter, port.filtered ? { label: 'Remove Filter' } : {}),
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
  for (const { id, nf } of NUMBER_FORMAT_ITEMS) {
    if (!nf) continue;
    out[id] = run(() => act.numberFormat(nf), { checked: (f?.nf ?? 'auto') === nf });
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
    out[`font-size-${size}`] = run(
      () => act.format({ fs: size === FONT_SIZE_DEFAULT ? null : size }),
      {
        checked: (f?.fs ?? FONT_SIZE_DEFAULT) === size,
      },
    );
  }
  return out;
}

/** The grid's items for this session: Copy for anyone, values for a Participant, the rest for an Editor. */
export function gridMenuBindings(port: GridMenuPort): OfficeActions {
  return {
    copy: run(port.act.copy),
    ...(port.canWrite ? writeBindings(port) : {}),
    ...(port.canWrite && port.canShape ? shapeBindings(port) : {}),
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
