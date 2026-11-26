// Restyling the selected marks (docs/specs/035-pdf-documents/marks.md "Changing a mark"): their colour, from the
// toolbar's Colour, or each kind's first look on Reset (a stamp its own); their opacity, line width, line style, line
// ends and a Text's or a Callout's alignment, from the Format menu; a Rectangle's, an Ellipse's, a Polygon's and a
// Cloud's fill, from the
// toolbar's Fill; a Text's or a Callout's font and size, from its Font and Font size. A width and a style reach only a
// mark with a line, a fill only a shape, a font, a size and an alignment only a Text or a Callout, a new font or size
// carrying the box it makes. Each
// restyle is one change under the person's own origin, so it is one step of their undo, made from the marks as the live
// changes hold them now.
import type * as Y from 'yjs';
import {
  Mark as Marks,
  PdfChange,
  Stamps,
  type DrawingMark,
  type LineEnd,
  type LineMark,
  type LineStyle,
  type Box,
  type Mark,
  type MarkChange,
  type PolyMark,
  MarkReshape,
  type ShapeMark,
  type TextAlign,
  TypedLayout,
} from '@livedoc/pdf-documents';
import { adopting, changeAsOne, markIn, NO_FILE_MARKS } from './pdf-mark-change';
import { FIRST_LOOKS } from './pdf-mark-looks';
import { STAMP_COLOURS } from './pdf-stamp';

/** What a restyle sets, as `[pdf] marks-restyled look=<…>` names it. */
export type RestyledLook =
  'colour' | 'opacity' | 'width' | 'style' | 'fill' | 'end' | 'size' | 'align' | 'font';

/** The font a Text or a Callout is set in until one is chosen, as the Font menu names it (marks.md "Making a mark"). */
export const FIRST_FONT = 'Helvetica';

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

/** Format > Line ends' ends, by item id. */
export const END_ITEMS: Readonly<Record<string, LineEnd>> = {
  'line-ends-none': 'none',
  'line-ends-arrow': 'arrow',
  'line-ends-open-arrow': 'open-arrow',
  'line-ends-circle': 'circle',
  'line-ends-square': 'square',
  'line-ends-diamond': 'diamond',
  'line-ends-bar': 'bar',
};

/** Format > Align text's alignments, by item id. */
export const ALIGN_ITEMS: Readonly<Record<string, TextAlign>> = {
  'align-text-left': 'left',
  'align-text-centre': 'centre',
  'align-text-right': 'right',
  'align-text-justified': 'justified',
};

/** A mark drawn as a line: a Drawing, a Line, an Arrow, a Rectangle, an Ellipse, a Polygon, a Cloud or Connected lines. */
type LinedMark = DrawingMark | LineMark | ShapeMark | PolyMark;

const isLined = (mark: Mark): mark is LinedMark => 'width' in mark;

/** A mark's line width; undefined for a mark with no line. */
export const widthOf = (mark: Mark): number | undefined => (isLined(mark) ? mark.width : undefined);

/** A mark's line style, Solid where it holds none; undefined for a mark with no line. */
export const lineStyleOf = (mark: Mark): LineStyle | undefined =>
  isLined(mark) ? (mark.lineStyle ?? 'solid') : undefined;

/** A Line's or an Arrow's second end, its kind's own where it names none, or Connected lines' last, None where it
 *  names none; undefined for any other mark. */
export function lineEndOf(mark: Mark): LineEnd | undefined {
  if (mark.kind === 'line' || mark.kind === 'arrow')
    return mark.lineEnd ?? Marks.firstEnd(mark.kind);
  return mark.kind === 'polyline' ? (mark.lineEnd ?? 'none') : undefined;
}

/** A Rectangle's, an Ellipse's, a Polygon's or a Cloud's fill, null for none; undefined for a mark that takes none. */
export const fillOf = (mark: Mark): string | null | undefined =>
  mark.kind === 'rectangle' ||
  mark.kind === 'ellipse' ||
  mark.kind === 'polygon' ||
  mark.kind === 'cloud'
    ? (mark.fill ?? null)
    : undefined;

/** A Text's or a Callout's size; undefined for any other mark. */
export const sizeOf = (mark: Mark): number | undefined =>
  Marks.isTyped(mark) ? mark.size : undefined;

/** A Text's or a Callout's font, Helvetica until one is chosen; undefined for any other mark. */
export const fontOf = (mark: Mark): string | undefined =>
  Marks.isTyped(mark) ? (mark.font ?? FIRST_FONT) : undefined;

/** The alignment Align text checks for a Text or a Callout: the one chosen, or until then its words' one direction's
 *  side, null where its paragraphs read both ways; undefined for any other mark. */
export function alignOf(mark: Mark): TextAlign | null | undefined {
  if (!Marks.isTyped(mark)) return undefined;
  if (mark.align) return mark.align;
  const direction = TypedLayout.direction(mark.words);
  return direction === 'mixed' ? null : direction === 'rtl' ? 'right' : 'left';
}

/** The look a new size asks of a mark: the size, and the box and line it makes on `page`; nothing of any other mark. */
export const sizedLook =
  (size: number, page: Box) =>
  (mark: Mark): MarkChange =>
    Marks.isTyped(mark) ? { size, ...MarkReshape.sized(mark, size, page) } : {};

/**
 * The look a font taken asks of a mark: the font (none for Helvetica), and the box and line it makes on `page`, wrapped
 * again in it; nothing of any other mark.
 */
export const fontedLook =
  (font: string, page: Box) =>
  (mark: Mark): MarkChange => {
    if (!Marks.isTyped(mark)) return {};
    const chosen = font === FIRST_FONT ? undefined : font;
    const { font: _was, ...rest } = mark;
    const placed = MarkReshape.sized(chosen ? { ...rest, font: chosen } : rest, mark.size, page);
    return { font: chosen ?? null, ...placed };
  };

/** Whether a mark takes a colour: every mark but a custom stamp, which is its picture (custom-stamps.md "Placing one"). */
export const takesColour = (mark: Mark): boolean => !(mark.kind === 'stamp' && mark.picture);

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
 *  a font, a size and an alignment only where it is a Text or a Callout, nothing it holds already; a new font or size
 *  with the geometry it carries. */
function changeOf(mark: Mark, look: MarkChange): MarkChange {
  const fill = fillOf(mark);
  const end = lineEndOf(mark);
  const asked: MarkChange = {
    ...(look.colour === undefined ? {} : { colour: look.colour.toLowerCase() }),
    ...(look.opacity === undefined ? {} : { opacity: look.opacity }),
    ...(look.width === undefined || !isLined(mark) ? {} : { width: look.width }),
    ...(look.lineStyle === undefined || !isLined(mark) ? {} : { lineStyle: look.lineStyle }),
    ...(look.lineEnd === undefined || end === undefined ? {} : { lineEnd: look.lineEnd }),
    ...(look.fill === undefined || fill === undefined
      ? {}
      : { fill: look.fill?.toLowerCase() ?? null }),
    ...(look.size === undefined || !Marks.isTyped(mark) ? {} : { size: look.size }),
    ...(look.align === undefined || !Marks.isTyped(mark) ? {} : { align: look.align }),
    ...(look.font === undefined || !Marks.isTyped(mark) ? {} : { font: look.font }),
  };
  const held = {
    ...mark,
    ...(isLined(mark) ? { lineStyle: lineStyleOf(mark) } : {}),
    ...(fill === undefined ? {} : { fill }),
    ...(end === undefined ? {} : { lineEnd: end }),
    ...(Marks.isTyped(mark) ? { font: mark.font ?? null } : {}),
  } as Readonly<Record<string, unknown>>;
  const change = Object.fromEntries(
    Object.entries(asked).filter(([key, value]) => held[key] !== value),
  ) as MarkChange;
  if (change.size === undefined && change.font === undefined) return change;
  const placed = Object.entries(look).filter(([key]) => key === 'rect' || key === 'callout');
  return { ...change, ...Object.fromEntries(placed) };
}

/**
 * The marks of `ids` given the look `lookOf` asks of each, as one change, `now` their time of change; a mark of the
 * file's own (`fileOwn`) that the look changes is taken as LiveDoc's in the same change. Answers how many changed.
 */
export function restyleMarks(
  doc: Y.Doc,
  ids: readonly string[],
  lookOf: (mark: Mark) => MarkChange,
  now: number,
  fileOwn: ReadonlyMap<string, Mark> = NO_FILE_MARKS,
): number {
  let changed = 0;
  const changes = ids.flatMap((id) => {
    const mark = markIn(doc, id, fileOwn);
    const change = mark ? changeOf(mark, lookOf(mark)) : {};
    if (!mark || Object.keys(change).length === 0) return [];
    changed += 1;
    return [...adopting(doc, mark), PdfChange.changeMark(id, { ...change, modifiedAt: now })];
  });
  return changeAsOne(doc, changes) ? changed : 0;
}
