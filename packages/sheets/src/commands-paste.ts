// Paste (docs/specs/029-sheets/sheet.md "Clipboard"): the sheet's own cells (formulas shifted by the distance
// moved), cut cells moved (and every formula on the tab pointing at them following), and HTML or text from
// elsewhere read as if typed. A paste past the grid grows it, up to its limits, and says when it was cut.
import type { GridRange } from './address';
import type { Rand } from './ids';
import { makeAxisIds } from './ids';
import {
  cellKey,
  type CellFormat,
  type IdRange,
  type Sheet,
  type SheetLayout,
  type StoredRef,
} from './sheet';
import { posRangeOf } from './layout';
import { r1c1ToA1 } from './formula/r1c1-text';
import { mapFormulaRefs, shiftForCopy } from './formula/stored';
import { readTypedInput } from './typed-input';
import { FORMAT_KEYS, type FormatPatch } from './format';
import type { SheetClip } from './clipboard';
import type { PastedCell } from './clipboard-read';
import type { CellChange, LayoutChange, SheetWrite } from './store';
import type { Workbook } from './engine/workbook';
import type { Edit } from './commands';

// The cells' paste modes (grid-and-editing.md "Clipboard"): everything, Values Only, Format Only, Formula Only,
// Transposed and All Except Borders. Column widths and rules are paste-layout.ts's.
export type PasteMode = 'all' | 'values' | 'formats' | 'formulas' | 'transposed' | 'noBorders';

const BORDERS = ['bt', 'br', 'bb', 'bl'] as const;

// A pasted format in place of the cell's own, as a patch: every key the copy lacks is cleared (null for none).
function replacing(format: CellFormat | FormatPatch | undefined): FormatPatch | null {
  if (!format || Object.keys(format).length === 0) return null;
  const patch: FormatPatch = Object.fromEntries(FORMAT_KEYS.map((k) => [k, null]));
  return { ...patch, ...format };
}

// A copied format in place of the cell's own, the cell's borders kept (All Except Borders).
function withoutBorders(
  copied: CellFormat | undefined,
  own: CellFormat | undefined,
): FormatPatch | null {
  const out: CellFormat = { ...copied };
  for (const side of BORDERS) {
    delete out[side];
    if (own?.[side]) out[side] = own[side];
  }
  return replacing(out);
}

export type PasteResult = { edits: Edit[]; range: GridRange; truncated: boolean };

// The rows and columns the paste needs added at the end, and the target box cut to the limits.
function grow(
  wb: Workbook,
  sheet: Sheet,
  at: { r: number; c: number },
  rows: number,
  cols: number,
  rand: Rand,
) {
  const needRows = Math.max(0, at.r + rows - sheet.layout.rows.length);
  const needCols = Math.max(0, at.c + cols - sheet.layout.cols.length);
  const room = wb.room(sheet.id);
  const addRows = Math.min(needRows, room.rows);
  const addCols = Math.min(needCols, room.cols);
  const changes: LayoutChange[] = [];
  let rowIds = sheet.layout.rows;
  let colIds = sheet.layout.cols;
  if (addRows > 0) {
    const ids = makeAxisIds(addRows, rand, new Set(rowIds));
    changes.push({ k: 'insertRows', after: rowIds[rowIds.length - 1] ?? null, ids });
    rowIds = [...rowIds, ...ids];
  }
  if (addCols > 0) {
    const ids = makeAxisIds(addCols, rand, new Set(colIds));
    changes.push({ k: 'insertCols', after: colIds[colIds.length - 1] ?? null, ids });
    colIds = [...colIds, ...ids];
  }
  return { changes, rowIds, colIds, truncated: addRows < needRows || addCols < needCols };
}

// How many times the copied block repeats to fill the selection (a whole multiple of it), else once.
function tiles(sel: GridRange, rows: number, cols: number): { rows: number; cols: number } {
  const h = sel.r2 - sel.r1 + 1;
  const w = sel.c2 - sel.c1 + 1;
  const tileRows = h > rows && h % rows === 0 ? h : rows;
  const tileCols = w > cols && w % cols === 0 ? w : cols;
  return { rows: tileRows, cols: tileCols };
}

function write(changes: LayoutChange[], cells: CellChange[]): SheetWrite {
  return changes.length ? { kind: 'layout', changes, cells } : { kind: 'cells', cells };
}

// The sheet's own cells, copied (not cut): formulas shift by the distance moved; Paste Values Only puts the
// values as they show, typed; Paste Formatting Only, formats; Formula Only, the inputs; Transposed turns rows into
// columns, once (D142); All Except Borders keeps the cells' own borders.
export function pasteClip(
  wb: Workbook,
  sheetId: string,
  sel: GridRange,
  clip: SheetClip,
  mode: PasteMode,
  rand: Rand = Math.random,
): PasteResult | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  const turned = mode === 'transposed';
  const size = turned ? { rows: clip.cols, cols: clip.rows } : tiles(sel, clip.rows, clip.cols);
  const g = grow(wb, sheet, { r: sel.r1, c: sel.c1 }, size.rows, size.cols, rand);
  const from = wb.ctxFor(clip.from.sheetId);
  const to = wb.ctxFor(sheetId);
  // The destination's layout after growing, so a formula shifted onto a new row encodes against it.
  const toCtx = g.changes.length
    ? { ...to, own: { ...to.own, layout: { ...to.own.layout, rows: g.rowIds, cols: g.colIds } } }
    : to;
  const cells: CellChange[] = [];
  for (let i = 0; i < size.rows; i++)
    for (let j = 0; j < size.cols; j++) {
      const r = sel.r1 + i;
      const c = sel.c1 + j;
      const rowId = g.rowIds[r];
      const colId = g.colIds[c];
      if (!rowId || !colId) continue;
      // The copied cell this one takes: the block repeated, or turned.
      const si = turned ? j : i % clip.rows;
      const sj = turned ? i : j % clip.cols;
      const src = clip.cells[si]![sj];
      const ch: CellChange = { r: rowId, c: colId };
      if (mode === 'values') {
        const read = readTypedInput(clip.values[si]![sj]!, wb.locale, to, false);
        ch.i = read.kind === 'value' ? read.input : null;
      } else if (mode !== 'formats') {
        const input = src?.input;
        const dr = r - (clip.from.r + si);
        const dc = c - (clip.from.c + sj);
        ch.i =
          input && 'f' in input
            ? { f: shiftForCopy(input.f, dr, dc, from, toCtx) }
            : (input ?? null);
      }
      if (mode === 'noBorders')
        ch.f = withoutBorders(src?.format, sheet.cells.get(cellKey(rowId, colId))?.format);
      else if (mode !== 'values' && mode !== 'formulas') ch.f = replacing(src?.format);
      cells.push(ch);
    }
  return {
    edits: [{ sheetId, write: write(g.changes, cells) }],
    range: {
      r1: sel.r1,
      c1: sel.c1,
      r2: Math.min(sel.r1 + size.rows, g.rowIds.length) - 1,
      c2: Math.min(sel.c1 + size.cols, g.colIds.length) - 1,
    },
    truncated: g.truncated,
  };
}

// Cut cells pasted: they move (no shift), their old place empties, and every formula on the tab that read a moved
// cell (or a range wholly inside the moved block) reads it at its new place; one reading a table in `tablesMoved`
// (moving with the cut, D454) reads its columns where they land, on this sheet.
export function pasteCut(
  wb: Workbook,
  sheetId: string,
  at: { r: number; c: number },
  clip: SheetClip,
  rand: Rand = Math.random,
  tablesMoved: ReadonlySet<string> = new Set(),
): PasteResult | null {
  const src = wb.sheet(clip.from.sheetId);
  const dest = wb.sheet(sheetId);
  if (!src || !dest) return null;
  const g = grow(wb, dest, at, clip.rows, clip.cols, rand);
  // Old ids -> new ids, cell by cell.
  const moved = new Map<string, { r: string; c: string }>();
  for (let i = 0; i < clip.rows; i++)
    for (let j = 0; j < clip.cols; j++) {
      const a = { r: src.layout.rows[clip.from.r + i], c: src.layout.cols[clip.from.c + j] };
      const b = { r: g.rowIds[at.r + i], c: g.colIds[at.c + j] };
      if (a.r && a.c && b.r && b.c) moved.set(cellKey(a.r, a.c), { r: b.r, c: b.c });
    }
  // Old column ids -> new, for a moving table's column references.
  const colMoved = new Map<string, string>();
  for (let j = 0; j < clip.cols; j++) {
    const a = src.layout.cols[clip.from.c + j];
    const b = g.colIds[at.c + j];
    if (a && b) colMoved.set(a, b);
  }
  const follow = (ref: StoredRef, ownId: string): StoredRef => {
    const target = ref.s ?? (ref.st === undefined ? ownId : undefined);
    if (ref.t !== undefined) {
      if (target !== clip.from.sheetId || !tablesMoved.has(ref.t)) return ref;
      const out: StoredRef = { ...ref };
      if (ref.tc1 !== undefined) out.tc1 = colMoved.get(ref.tc1) ?? ref.tc1;
      if (ref.tc2 !== undefined) out.tc2 = colMoved.get(ref.tc2) ?? ref.tc2;
      if (sheetId === clip.from.sheetId) return out;
      if (sheetId === ownId) delete out.s;
      else out.s = sheetId;
      return out;
    }
    if (target !== clip.from.sheetId || ref.r1 === undefined || ref.c1 === undefined) return ref;
    const a = moved.get(cellKey(ref.r1, ref.c1));
    const isRange = ref.r2 !== undefined || ref.c2 !== undefined;
    if (!isRange) return a ? retarget(ref, ownId, a, undefined) : ref;
    if (ref.r2 === undefined || ref.c2 === undefined) return ref;
    const b = moved.get(cellKey(ref.r2, ref.c2));
    return a && b ? retarget(ref, ownId, a, b) : ref;
  };
  const retarget = (
    ref: StoredRef,
    ownId: string,
    a: { r: string; c: string },
    b?: { r: string; c: string },
  ): StoredRef => {
    const out: StoredRef = { ...ref, r1: a.r, c1: a.c, ...(b ? { r2: b.r, c2: b.c } : {}) };
    if (sheetId === ownId) delete out.s;
    else out.s = sheetId;
    return out;
  };
  const bySheet = new Map<string, CellChange[]>();
  const push = (id: string, ch: CellChange) => bySheet.set(id, [...(bySheet.get(id) ?? []), ch]);
  // Clear the old place (unless the new place covers it), then put the moved cells down.
  const landing = new Set([...moved.values()].map((x) => cellKey(x.r, x.c)));
  for (const key of moved.keys())
    if (!(clip.from.sheetId === sheetId && landing.has(key))) {
      const [r, c] = key.split(':') as [string, string];
      push(clip.from.sheetId, { r, c, i: null, f: null });
    }
  for (const [key, to] of moved) {
    const cell = src.cells.get(key);
    const input = cell?.input;
    const i =
      input && 'f' in input
        ? { f: mapFormulaRefs(input.f, (ref) => follow(ref, clip.from.sheetId)) }
        : (input ?? null);
    push(sheetId, { r: to.r, c: to.c, i, f: cell?.format ?? null });
  }
  // Formulas elsewhere on the tab that read the moved cells.
  for (const sheet of wb.sheetList()) {
    for (const [key, cell] of sheet.cells) {
      if (sheet.id === clip.from.sheetId && moved.has(key)) continue;
      const input = cell.input;
      if (!input || !('f' in input)) continue;
      const next = mapFormulaRefs(input.f, (ref) => follow(ref, sheet.id));
      if (next === input.f) continue;
      const [r, c] = key.split(':') as [string, string];
      push(sheet.id, { r, c, i: { f: next } });
    }
  }
  const edits: Edit[] = [];
  for (const [id, cells] of bySheet)
    edits.push({ sheetId: id, write: write(id === sheetId ? g.changes : [], cells) });
  if (!bySheet.has(sheetId) && g.changes.length)
    edits.push({ sheetId, write: { kind: 'layout', changes: g.changes } });
  return {
    edits,
    range: { r1: at.r, c1: at.c, r2: at.r + clip.rows - 1, c2: at.c + clip.cols - 1 },
    truncated: g.truncated,
  };
}

// HTML or text from elsewhere (Google Sheets, Excel, a web page): each value read as if typed, with the formats
// the HTML carried; Google's formulas read from where each lands (D152), and with `merges` (an Editor's paste) each
// spanning cell merged unless it crosses a merge (D154).
export function pasteExternal(
  wb: Workbook,
  sheetId: string,
  sel: GridRange,
  pasted: readonly (readonly (PastedCell | string)[])[],
  mode: PasteMode,
  opts: { merges?: boolean; rand?: Rand } = {},
): PasteResult | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet || pasted.length === 0) return null;
  const turned = mode === 'transposed';
  const rows = turned ? turnRows(pasted) : pasted;
  // A loop, not a spread: a pasted file can have more rows than a spread call takes.
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const size = turned ? { rows: rows.length, cols: width } : tiles(sel, rows.length, width);
  const g = grow(
    wb,
    sheet,
    { r: sel.r1, c: sel.c1 },
    size.rows,
    size.cols,
    opts.rand ?? Math.random,
  );
  const ctx = wb.ctxFor(sheetId);
  const toCtx = g.changes.length
    ? { ...ctx, own: { ...ctx.own, layout: { ...ctx.own.layout, rows: g.rowIds, cols: g.colIds } } }
    : ctx;
  const cells: CellChange[] = [];
  for (let i = 0; i < size.rows; i++)
    for (let j = 0; j < size.cols; j++) {
      const rowId = g.rowIds[sel.r1 + i];
      const colId = g.colIds[sel.c1 + j];
      if (!rowId || !colId) continue;
      const raw = rows[i % rows.length]![j % width];
      const cell: PastedCell = typeof raw === 'string' ? { text: raw } : (raw ?? { text: '' });
      const ch: CellChange = { r: rowId, c: colId };
      if (mode !== 'formats') {
        const current = sheet.cells.get(cellKey(rowId, colId))?.format;
        const asText = current?.nf === 'text';
        // Google's formula, read where it lands; one that cannot be read pastes its value.
        const a1 =
          cell.formula && FORMULA_MODES.has(mode)
            ? r1c1ToA1(cell.formula, { r: sel.r1 + i, c: sel.c1 + j })
            : null;
        const asFormula = a1 ? readTypedInput(a1, wb.locale, toCtx, asText) : null;
        const read =
          asFormula?.kind === 'value'
            ? asFormula
            : readTypedInput(cell.text, wb.locale, toCtx, asText);
        ch.i =
          read.kind === 'value' ? read.input : read.kind === 'invalid' ? { s: cell.text } : null;
        // A formula's hint never overrides the copied cell's own format.
        const own = cell.format?.nf && cell.format.nf !== 'auto';
        // Formula Only takes no formats; everything else from elsewhere pastes as everything.
        const all = mode !== 'values' && mode !== 'formulas';
        if (read.kind === 'value' && read.hint && all && !(read.hint.ifAutomatic && own))
          ch.f = replacing(hintFormat(cell.format, read.hint));
        else if (all) ch.f = replacing(cell.format);
      } else {
        ch.f = replacing(cell.format);
      }
      cells.push(ch);
    }
  const spans =
    opts.merges && MERGE_MODES.has(mode)
      ? pastedMerges(sheet.layout, g, sel, size, rows, width)
      : null;
  const changes = spans ? [...g.changes, spans] : g.changes;
  return {
    edits: [{ sheetId, write: write(changes, cells) }],
    range: { r1: sel.r1, c1: sel.c1, r2: sel.r1 + size.rows - 1, c2: sel.c1 + size.cols - 1 },
    truncated: g.truncated,
  };
}

// The modes that paste Google's formulas, and those that paste its merges (with the formats).
const FORMULA_MODES: ReadonlySet<PasteMode> = new Set(['all', 'formulas', 'noBorders']);
const MERGE_MODES: ReadonlySet<PasteMode> = new Set(['all', 'formats', 'noBorders']);

// The pasted spanning cells as merges (D154), each cut to the pasted box; one crossing a merge already there, or one
// before it, is left out. Null when none is added.
function pastedMerges(
  layout: SheetLayout,
  g: { rowIds: readonly string[]; colIds: readonly string[] },
  sel: GridRange,
  size: { rows: number; cols: number },
  rows: readonly (readonly (PastedCell | string)[])[],
  width: number,
): LayoutChange | null {
  const boxes: GridRange[] = [];
  for (const m of layout.merges ?? []) {
    const b = posRangeOf(layout, m);
    if (b) boxes.push(b);
  }
  const added: IdRange[] = [];
  const crosses = (a: GridRange) =>
    boxes.some((b) => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2);
  for (let i = 0; i < size.rows; i++)
    for (let j = 0; j < size.cols; j++) {
      const raw = rows[i % rows.length]![j % width];
      const span = typeof raw === 'object' ? raw.span : undefined;
      if (!span) continue;
      const box = {
        r1: sel.r1 + i,
        c1: sel.c1 + j,
        r2: Math.min(sel.r1 + i + span.rows, sel.r1 + size.rows, g.rowIds.length) - 1,
        c2: Math.min(sel.c1 + j + span.cols, sel.c1 + size.cols, g.colIds.length) - 1,
      };
      if ((box.r1 === box.r2 && box.c1 === box.c2) || crosses(box)) continue;
      boxes.push(box);
      added.push({
        r1: g.rowIds[box.r1]!,
        c1: g.colIds[box.c1]!,
        r2: g.rowIds[box.r2]!,
        c2: g.colIds[box.c2]!,
      });
    }
  return added.length ? { k: 'merges', merges: [...(layout.merges ?? []), ...added] } : null;
}

function hintFormat(
  format: CellFormat | undefined,
  hint: { nf: string; cur?: string },
): FormatPatch {
  return { ...(format ?? {}), nf: hint.nf, ...(hint.cur ? { cur: hint.cur } : {}) };
}

// Rows turned into columns (Paste Special › Transposed), a short row's missing cells empty.
export function turnRows<T>(rows: readonly (readonly (T | string)[])[]): (T | string)[][] {
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const out: (T | string)[][] = [];
  for (let j = 0; j < width; j++) {
    const row: (T | string)[] = [];
    for (const source of rows) row.push(source[j] ?? '');
    out.push(row);
  }
  return out;
}
