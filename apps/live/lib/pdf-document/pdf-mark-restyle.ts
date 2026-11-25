// Restyling the selected marks (docs/specs/035-pdf-documents/marks.md "Changing a mark"): their colour, from the
// toolbar's Colour, or each kind's first look on Reset (a stamp its own); their opacity, line width and line style, from
// the Format menu; a Rectangle's and an Ellipse's fill, from the toolbar's Fill. A width and a style reach only a mark
// with a line, a fill only a shape. Each restyle is one change under the person's own origin, so
// it is one step of their undo, made from the marks as the live changes hold them now.
import type * as Y from 'yjs';
import {
  PdfChange,
  PdfLiveChanges,
  Stamps,
  type DrawingMark,
  type LineMark,
  type LineStyle,
  type Mark,
  type MarkLook,
  type ShapeMark,
} from '@livedoc/pdf-documents';
import { FIRST_LOOKS } from './pdf-mark-looks';
import { STAMP_COLOURS } from './pdf-stamp';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';

/** What a restyle sets, as `[pdf] marks-restyled look=<…>` names it. */
export type RestyledLook = 'colour' | 'opacity' | 'width' | 'style' | 'fill';

/** Format > Opacity's steps (reading-surface.md "Format"), by item id. */
export const OPACITY_ITEMS: Readonly<Record<string, number>> = {
  'opacity-100': 1,
  'opacity-75': 0.75,
  'opacity-50': 0.5,
  'opacity-25': 0.25,
  'opacity-10': 0.1,
};

/** Format > Line width's steps, in points, by item id. */
export const WIDTH_ITEMS: Readonly<Record<string, number>> = {
  'line-width-0-5-pt': 0.5,
  'line-width-1-pt': 1,
  'line-width-2-pt': 2,
  'line-width-4-pt': 4,
  'line-width-8-pt': 8,
  'line-width-12-pt': 12,
};

/** Format > Line style's styles, by item id. */
export const STYLE_ITEMS: Readonly<Record<string, LineStyle>> = {
  'line-style-solid': 'solid',
  'line-style-dashed': 'dashed',
  'line-style-dotted': 'dotted',
  'line-style-dash-dot': 'dash-dot',
  'line-style-long-dashes': 'long-dashes',
};

/** A mark drawn as a line: a Drawing, a Line, an Arrow, a Rectangle or an Ellipse. */
type LinedMark = DrawingMark | LineMark | ShapeMark;

const isLined = (mark: Mark): mark is LinedMark => 'width' in mark;

/** A mark's line width; undefined for a mark with no line. */
export const widthOf = (mark: Mark): number | undefined => (isLined(mark) ? mark.width : undefined);

/** A mark's line style, Solid where it holds none; undefined for a mark with no line. */
export const lineStyleOf = (mark: Mark): LineStyle | undefined =>
  isLined(mark) ? (mark.lineStyle ?? 'solid') : undefined;

/** A Rectangle's or an Ellipse's fill, null for none; undefined for a mark that takes no fill. */
export const fillOf = (mark: Mark): string | null | undefined =>
  mark.kind === 'rectangle' || mark.kind === 'ellipse' ? (mark.fill ?? null) : undefined;

/** The colour Reset gives a mark: its kind's first look, a stamp its own; a stamp LiveDoc does not draw keeps its. */
export function firstColour(mark: Mark): string {
  if (mark.kind !== 'stamp') return FIRST_LOOKS[mark.kind].colour;
  const known = Stamps.of(mark.stamp);
  return known ? STAMP_COLOURS[known.tone] : mark.colour;
}

/** The value every mark holding one holds of `read`; null where they differ, or where none holds one. */
export function sharedOf<Value>(
  marks: readonly Mark[],
  read: (mark: Mark) => Value | undefined,
): Value | null {
  const values = marks.map(read).filter((value) => value !== undefined);
  const first = values[0];
  if (first === undefined) return null;
  return values.every((value) => value === first) ? first : null;
}

/** What of `look` would change `mark`: a width and a style only where it has a line, a fill only where it takes one,
 *  nothing it holds already. */
function changeOf(mark: Mark, look: MarkLook): MarkLook {
  const fill = fillOf(mark);
  const asked: MarkLook = {
    ...(look.colour === undefined ? {} : { colour: look.colour.toLowerCase() }),
    ...(look.opacity === undefined ? {} : { opacity: look.opacity }),
    ...(look.width === undefined || !isLined(mark) ? {} : { width: look.width }),
    ...(look.lineStyle === undefined || !isLined(mark) ? {} : { lineStyle: look.lineStyle }),
    ...(look.fill === undefined || fill === undefined
      ? {}
      : { fill: look.fill?.toLowerCase() ?? null }),
  };
  const held = {
    ...mark,
    ...(isLined(mark) ? { lineStyle: lineStyleOf(mark) } : {}),
    ...(fill === undefined ? {} : { fill }),
  } as Readonly<Record<string, unknown>>;
  return Object.fromEntries(
    Object.entries(asked).filter(([key, value]) => held[key] !== value),
  ) as MarkLook;
}

/** The marks of `ids` given the look `lookOf` asks of each, as one change, `now` their time of change; answers how
 *  many changed. */
export function restyleMarks(
  doc: Y.Doc,
  ids: readonly string[],
  lookOf: (mark: Mark) => MarkLook,
  now: number,
): number {
  const changes = ids.flatMap((id) => {
    const mark = PdfLiveChanges.mark(doc, id);
    const change = mark ? changeOf(mark, lookOf(mark)) : {};
    return Object.keys(change).length > 0
      ? [PdfChange.changeMark(id, { ...change, modifiedAt: now })]
      : [];
  });
  if (changes.length > 0)
    doc.transact(() => {
      for (const change of changes) PdfChange.apply(doc, change, PDF_LOCAL_ORIGIN);
    }, PDF_LOCAL_ORIGIN);
  return changes.length;
}
