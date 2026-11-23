// Paste Special's layout items (docs/specs/029-sheets/grid-and-editing.md "Clipboard"): Column Widths Only, and
// Conditional Formatting Only and Data Validation Only (D143). A copy keeps its columns' widths and the rules over
// its cells, each cut to them and placed by its offset in the block; a paste sets them again at the active cell, cut
// at the grid's edge, as new rules. A custom formula shifts by the distance its rule's corner moved.
import type { GridRange } from './address';
import { makeAxisIds, type Rand } from './ids';
import { colWidth, posRangeOf } from './layout';
import { shiftForCopy } from './formula/stored';
import type { FormatRule, IdRange, SheetLayout, ValidationRule } from './sheet';
import type { LayoutChange } from './store';
import type { Workbook } from './engine/workbook';
import type { SheetClip } from './clipboard';
import type { PasteMode, PasteResult } from './commands-paste';

type Place = { i1: number; j1: number; i2: number; j2: number };

// A copied rule: its settings, where it lies in the copied block, and how far its corner is from the rule's own
// (a custom formula is written for that corner).
export type ClipRule<R> = {
  rule: Omit<R, 'id' | keyof IdRange>;
  at: Place;
  corner: { dr: number; dc: number };
};

export type ClipLayout = {
  // Each copied column's width, in px.
  widths: number[];
  rules: { f: ClipRule<FormatRule>[]; v: ClipRule<ValidationRule>[] };
};

export type LayoutPasteMode = 'widths' | 'formatRules' | 'validation';

/** Paste Special's items (grid-and-editing.md "Clipboard"): the cells' modes and the layout's. */
export type PasteSpecialMode = Exclude<PasteMode, 'all'> | LayoutPasteMode;

function settingsOf<R extends IdRange & { id: string }>(rule: R): Omit<R, 'id' | keyof IdRange> {
  const { id: _id, r1: _r1, c1: _c1, r2: _r2, c2: _c2, ...rest } = rule;
  return rest;
}

function clipRules<R extends IdRange & { id: string }>(
  layout: SheetLayout,
  rules: readonly R[] | undefined,
  range: GridRange,
): ClipRule<R>[] {
  const out: ClipRule<R>[] = [];
  for (const rule of rules ?? []) {
    const pos = posRangeOf(layout, rule);
    if (!pos) continue;
    const r1 = Math.max(pos.r1, range.r1);
    const c1 = Math.max(pos.c1, range.c1);
    const r2 = Math.min(pos.r2, range.r2);
    const c2 = Math.min(pos.c2, range.c2);
    if (r1 > r2 || c1 > c2) continue;
    out.push({
      rule: settingsOf(rule),
      at: { i1: r1 - range.r1, j1: c1 - range.c1, i2: r2 - range.r1, j2: c2 - range.c1 },
      corner: { dr: r1 - pos.r1, dc: c1 - pos.c1 },
    });
  }
  return out;
}

/** What a copy of the range keeps of its sheet's layout: widths and rules. */
export function clipLayoutOf(layout: SheetLayout, range: GridRange): ClipLayout {
  return {
    widths: layout.cols.slice(range.c1, range.c2 + 1).map((colId) => colWidth(layout, colId)),
    rules: {
      f: clipRules(layout, layout.formatRules, range),
      v: clipRules(layout, layout.rules, range),
    },
  };
}

/** Column Widths Only, Conditional Formatting Only or Data Validation Only; null when the clip holds none. */
export function pasteClipLayout(
  wb: Workbook,
  sheetId: string,
  at: { r: number; c: number },
  clip: SheetClip,
  mode: LayoutPasteMode,
  rand: Rand = Math.random,
): PasteResult | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  const { rows, cols } = sheet.layout;
  const changes: LayoutChange[] = [];
  if (mode === 'widths') {
    clip.widths?.forEach((px, j) => {
      const colId = cols[at.c + j];
      if (colId) changes.push({ k: 'size', axis: 'c', ids: [colId], px });
    });
  } else {
    const copied = mode === 'formatRules' ? clip.rules?.f : clip.rules?.v;
    const taken = new Set([
      ...(sheet.layout.formatRules ?? []).map((x) => x.id),
      ...(sheet.layout.rules ?? []).map((x) => x.id),
    ]);
    const from = wb.ctxFor(clip.from.sheetId);
    const to = wb.ctxFor(sheetId);
    for (const { rule, at: place, corner } of copied ?? []) {
      const r1 = rows[at.r + place.i1];
      const c1 = cols[at.c + place.j1];
      if (!r1 || !c1) continue;
      const r2 = rows[Math.min(at.r + place.i2, rows.length - 1)]!;
      const c2 = cols[Math.min(at.c + place.j2, cols.length - 1)]!;
      const [id] = makeAxisIds(1, rand, taken);
      taken.add(id!);
      const where = { id: id!, r1, c1, r2, c2 };
      if (mode === 'formatRules') {
        const f = rule as ClipRule<FormatRule>['rule'];
        const dr = at.r - clip.from.r + corner.dr;
        const dc = at.c - clip.from.c + corner.dc;
        const fx = f.fx ? { fx: shiftForCopy(f.fx, dr, dc, from, to) } : {};
        changes.push({ k: 'frule', id: id!, rule: { ...f, ...fx, ...where } });
      } else {
        changes.push({
          k: 'vrule',
          id: id!,
          rule: { ...(rule as ClipRule<ValidationRule>['rule']), ...where },
        });
      }
    }
  }
  if (changes.length === 0) return null;
  return {
    edits: [{ sheetId, write: { kind: 'layout', changes } }],
    range: {
      r1: at.r,
      c1: at.c,
      r2: Math.min(at.r + clip.rows, rows.length) - 1,
      c2: Math.min(at.c + clip.cols, cols.length) - 1,
    },
    truncated: false,
  };
}
