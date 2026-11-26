// Paste Special's layout items (docs/specs/029-sheets/grid-and-editing.md "Clipboard"): Column Widths Only, and
// Conditional Formatting Only and Data Validation Only (D143). A copy keeps its columns' widths and the rules over
// its cells, each cut to them and placed by its offset in the block; a paste sets them again at the active cell, cut
// at the grid's edge, as new rules. A custom formula shifts by the distance its rule's corner moved. A format rule of
// several rectangles is copied as the pieces of them over the copy, one rule, the first piece its anchor.
import type { GridRange } from './address';
import { makeAxisIds, type Rand } from './ids';
import { colWidth, posRangeOf } from './layout';
import { shiftForCopy } from './formula/stored';
import type { FormatRule, IdRange, SheetLayout, ValidationRule } from './sheet';
import { rulePositions } from './rules/rule-ranges';
import type { LayoutChange } from './store';
import type { Workbook } from './engine/workbook';
import type { SheetClip } from './clipboard';
import { pasteClip, pasteCut, type PasteMode, type PasteResult } from './commands-paste';

type Place = { i1: number; j1: number; i2: number; j2: number };

// A copied rule: its settings, where it lies in the copied block (`more`: its further rectangles' pieces), and how
// far the first piece's corner is from the rule's own (a custom formula is written for that corner).
export type ClipRule<R> = {
  rule: Omit<R, 'id' | 'also' | keyof IdRange>;
  at: Place;
  more?: Place[];
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

type Ruled = IdRange & { id: string; also?: IdRange[] };

function settingsOf<R extends Ruled>(rule: R): Omit<R, 'id' | 'also' | keyof IdRange> {
  const { id: _id, r1: _r1, c1: _c1, r2: _r2, c2: _c2, also: _also, ...rest } = rule;
  return rest;
}

function clipRules<R extends Ruled>(
  layout: SheetLayout,
  rules: readonly R[] | undefined,
  range: GridRange,
): ClipRule<R>[] {
  const out: ClipRule<R>[] = [];
  for (const rule of rules ?? []) {
    const pos = posRangeOf(layout, rule);
    if (!pos) continue;
    const [at, ...more] = rulePositions(layout, rule).flatMap((p): Place[] => {
      const r1 = Math.max(p.r1, range.r1);
      const c1 = Math.max(p.c1, range.c1);
      const r2 = Math.min(p.r2, range.r2);
      const c2 = Math.min(p.c2, range.c2);
      if (r1 > r2 || c1 > c2) return [];
      return [{ i1: r1 - range.r1, j1: c1 - range.c1, i2: r2 - range.r1, j2: c2 - range.c1 }];
    });
    if (!at) continue;
    out.push({
      rule: settingsOf(rule),
      at,
      ...(more.length ? { more } : {}),
      corner: { dr: range.r1 + at.i1 - pos.r1, dc: range.c1 + at.j1 - pos.c1 },
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
    // A piece cut at the grid's edge; null when it starts past it.
    const landed = (place: Place): IdRange | null => {
      const r1 = rows[at.r + place.i1];
      const c1 = cols[at.c + place.j1];
      if (!r1 || !c1) return null;
      const r2 = rows[Math.min(at.r + place.i2, rows.length - 1)]!;
      const c2 = cols[Math.min(at.c + place.j2, cols.length - 1)]!;
      return { r1, c1, r2, c2 };
    };
    for (const { rule, at: first, more, corner } of copied ?? []) {
      const places = [first, ...(more ?? [])].flatMap((p) => {
        const box = landed(p);
        return box ? [{ p, box }] : [];
      });
      if (!places.length) continue;
      const [{ p: place, box }, ...rest] = places as [(typeof places)[0], ...typeof places];
      const [id] = makeAxisIds(1, rand, taken);
      taken.add(id!);
      const where = { id: id!, ...box };
      // A custom formula is written for its rule's top-left cell: moved as far as that corner lands from it.
      const dr = at.r - clip.from.r + corner.dr + place.i1 - first.i1;
      const dc = at.c - clip.from.c + corner.dc + place.j1 - first.j1;
      const fx = rule.fx ? { fx: shiftForCopy(rule.fx, dr, dc, from, to) } : {};
      if (mode === 'formatRules') {
        const f = rule as ClipRule<FormatRule>['rule'];
        const also = rest.length ? { also: rest.map((x) => x.box) } : {};
        changes.push({ k: 'frule', id: id!, rule: { ...f, ...fx, ...where, ...also } });
      } else {
        changes.push({
          k: 'vrule',
          id: id!,
          rule: { ...(rule as ClipRule<ValidationRule>['rule']), ...fx, ...where },
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

/** The rules lying wholly over a cut range, taken from their old place as the cut moves (D155). */
export function cutRuleRemovals(layout: SheetLayout, range: GridRange): LayoutChange[] {
  const inside = (rule: Ruled) => {
    const boxes = rulePositions(layout, rule);
    return (
      !!posRangeOf(layout, rule) &&
      boxes.every(
        (p) => p.r1 >= range.r1 && p.r2 <= range.r2 && p.c1 >= range.c1 && p.c2 <= range.c2,
      )
    );
  };
  return [
    ...(layout.formatRules ?? [])
      .filter(inside)
      .map((x) => ({ k: 'frule' as const, id: x.id, rule: null })),
    ...(layout.rules ?? [])
      .filter(inside)
      .map((x) => ({ k: 'vrule' as const, id: x.id, rule: null })),
  ];
}

/** A plain paste of the sheet's own cells with their rules (D155): the cells moved (a cut) or copied, the copied
 *  rules set again over them, and a cut's rules wholly over its cells taken from their old place; one change. */
export function pasteWithRules(
  wb: Workbook,
  sheetId: string,
  sel: GridRange,
  clip: SheetClip,
  rand: Rand = Math.random,
): PasteResult | null {
  const cells = clip.cut
    ? pasteCut(wb, sheetId, { r: sel.r1, c: sel.c1 }, clip, rand)
    : pasteClip(wb, sheetId, sel, clip, 'all', rand);
  if (!cells) return null;
  const at = { r: sel.r1, c: sel.c1 };
  const rules = (['formatRules', 'validation'] as const).flatMap(
    (mode) => pasteClipLayout(wb, sheetId, at, clip, mode, rand)?.edits ?? [],
  );
  const source = wb.sheet(clip.from.sheetId);
  const removals =
    clip.cut && source
      ? cutRuleRemovals(source.layout, {
          r1: clip.from.r,
          c1: clip.from.c,
          r2: clip.from.r + clip.rows - 1,
          c2: clip.from.c + clip.cols - 1,
        })
      : [];
  // Removals first, so a rule set again where it was is the one kept.
  const removing = removals.length
    ? [{ sheetId: clip.from.sheetId, write: { kind: 'layout' as const, changes: removals } }]
    : [];
  return { ...cells, edits: [...removing, ...cells.edits, ...rules] };
}
