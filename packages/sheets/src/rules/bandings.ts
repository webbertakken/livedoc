// Alternating colours (docs/specs/029-sheets/formatting.md "Alternating colours", D216): a banding shades its range's
// rows, an optional header, then colour 1 and colour 2 alternating by position, then an optional footer; drawn under
// a cell's own fill and a met format rule's. Neither file format holds one: it is written as format rules.
import { formatA1 } from '../address';
import { isColour } from '../format';
import { isAxisId } from '../ids';
import { layoutIndex, posRangeOf } from '../layout';
import type { Banding, BandingColours, IdRange, SheetLayout } from '../sheet';
import type { FileFormatRule } from '../files/file-format-rules';
import { firstRuleAt, ruleIndex } from './rule-index';

/** The default styles, LiveDoc's own (D216): the first is a new banding's. */
export const BANDING_STYLES: readonly { label: string; colours: BandingColours }[] = [
  {
    label: 'Grey',
    colours: { head: '#bdbdbd', band1: '#ffffff', band2: '#f3f3f3', foot: '#dedede' },
  },
  {
    label: 'Blue',
    colours: { head: '#5b95f9', band1: '#ffffff', band2: '#e8f0fe', foot: '#a8c7fa' },
  },
  {
    label: 'Green',
    colours: { head: '#57bb8a', band1: '#ffffff', band2: '#e7f9ef', foot: '#a8dcc0' },
  },
  {
    label: 'Orange',
    colours: { head: '#f6b26b', band1: '#ffffff', band2: '#fef1e1', foot: '#fbd5aa' },
  },
  {
    label: 'Red',
    colours: { head: '#e67c73', band1: '#ffffff', band2: '#fce8e6', foot: '#f2b8b3' },
  },
  {
    label: 'Purple',
    colours: { head: '#8e7cc3', band1: '#ffffff', band2: '#efecf8', foot: '#c9bfe6' },
  },
  {
    label: 'Teal',
    colours: { head: '#4db6ac', band1: '#ffffff', band2: '#e0f2f1', foot: '#a7dbd6' },
  },
  {
    label: 'Yellow',
    colours: { head: '#f7cb4d', band1: '#ffffff', band2: '#fef8e3', foot: '#fbe3a1' },
  },
];

/** A new banding over a range: the first default style, its header on (D216). */
export function newBanding(id: string, range: IdRange): Banding {
  return { id, ...range, ...BANDING_STYLES[0]!.colours, header: true };
}

/** A banding in another style, its range and switches kept. */
export function bandingWith(banding: Banding, colours: BandingColours): Banding {
  return { ...banding, ...colours };
}

/** The colour of row `r` in a banding whose rows run `p.r1` to `p.r2`. */
export function bandingFill(b: Banding, p: { r1: number; r2: number }, r: number): string {
  if (b.header && r === p.r1) return b.head;
  if (b.footer && r === p.r2) return b.foot;
  const first = p.r1 + (b.header ? 1 : 0);
  return (r - first) % 2 === 0 ? b.band1 : b.band2;
}

/** The banding covering a cell, or null. */
export function bandingAt(layout: SheetLayout, r: number, c: number): Banding | null {
  const list = layout.bands;
  return list?.length ? firstRuleAt(ruleIndex(layout, list), r, c) : null;
}

/** The fill a banding gives a cell, or null for none. */
export function bandingFillAt(layout: SheetLayout, r: number, c: number): string | null {
  const b = bandingAt(layout, r, c);
  const p = b && posRangeOf(layout, b)!;
  return b && p ? bandingFill(b, p, r) : null;
}

const KEYS = new Set([
  'id',
  'r1',
  'c1',
  'r2',
  'c2',
  'head',
  'band1',
  'band2',
  'foot',
  'header',
  'footer',
]);

/** Whether `v` is a banding a write may store on this layout, with the id it names. */
export function isBanding(v: unknown, id: string, layout: SheetLayout): v is Banding {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const b = v as Record<string, unknown>;
  if (b.id !== id || !isAxisId(id) || !Object.keys(b).every((k) => KEYS.has(k))) return false;
  const ix = layoutIndex(layout);
  const on = (axis: ReadonlyMap<string, number>, x: unknown) => isAxisId(x) && axis.has(x);
  return (
    on(ix.rowPos, b.r1) &&
    on(ix.rowPos, b.r2) &&
    on(ix.colPos, b.c1) &&
    on(ix.colPos, b.c2) &&
    [b.head, b.band1, b.band2, b.foot].every(isColour) &&
    (b.header === undefined || b.header === true) &&
    (b.footer === undefined || b.footer === true)
  );
}

/** Whether a banding overlaps another of the layout's (one with another id). */
export function bandingOverlaps(layout: SheetLayout, banding: Banding): boolean {
  const p = posRangeOf(layout, banding);
  return (layout.bands ?? []).some((x) => {
    const q = x.id === banding.id ? null : posRangeOf(layout, x);
    return !!p && !!q && p.r1 <= q.r2 && q.r1 <= p.r2 && p.c1 <= q.c2 && q.c1 <= p.c2;
  });
}

const fillRule = (
  ranges: FileFormatRule['ranges'],
  formula: string,
  bg: string,
): FileFormatRule => ({
  ranges,
  is: 'when',
  op: 'formula',
  formula,
  style: { bg },
});

/** A sheet's bandings as the format rules a file holds them as (D216): header, colour rows, footer. */
export function bandingRules(layout: SheetLayout): FileFormatRule[] {
  const out: FileFormatRule[] = [];
  for (const b of layout.bands ?? []) {
    const p = posRangeOf(layout, b);
    if (!p) continue;
    const row = (r: number) => [{ r1: r, c1: p.c1, r2: r, c2: p.c2 }];
    if (b.header) out.push(fillRule(row(p.r1), '=TRUE', b.head));
    const r1 = p.r1 + (b.header ? 1 : 0);
    const r2 = p.r2 - (b.footer && p.r2 >= r1 ? 1 : 0);
    if (r1 <= r2) {
      const body = [{ r1, c1: p.c1, r2, c2: p.c2 }];
      const first = formatA1(r1, p.c1, { row: true, col: true });
      out.push(fillRule(body, `=ISEVEN(ROW()-ROW(${first}))`, b.band1));
      out.push(fillRule(body, `=ISODD(ROW()-ROW(${first}))`, b.band2));
    }
    if (b.footer && p.r2 >= r1) out.push(fillRule(row(p.r2), '=TRUE', b.foot));
  }
  return out;
}
