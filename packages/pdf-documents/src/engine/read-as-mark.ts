// A file's mark as LiveDoc reads it (docs/specs/035-pdf-documents/marks.md "Changing a mark"): a mark of a kind
// LiveDoc makes, read from the standard's own entries, so it is selected, moved, restyled and deleted as a mark made
// here is. A mark saved here reads back as the mark it was; another program's is read as near as the entries say,
// every value held within a mark's own bounds; one LiveDoc cannot read so is none, and is drawn as the file says.
import type { FileMark } from '../engine-contract';
import {
  LINE_STYLES,
  MARK_KIND_LABELS,
  Mark,
  STAMP_MAX_LINES,
  STAMP_TURNS,
  type StampTurnDegrees,
  type Box,
  type LineEnd,
  type LineStyle,
  type Quad,
  type TextAlign,
} from '../mark';
import { MarkDrawing } from '../mark-drawing';
import type { PageName } from '../page-name';
import { PdfDate } from '../pdf-date';
import {
  PDF_DRAWING_MAX_POINTS,
  PDF_POLYGON_MAX_CORNERS,
  PDF_MARK_TEXT_MAX_CHARS,
  PDF_MARK_WIDTH_MAX_PT,
  PDF_MARK_WIDTH_MIN_PT,
  PDF_TEXT_SIZE_MAX_PT,
  PDF_TEXT_SIZE_MIN_PT,
} from '../limits';
import { Stamps } from '../stamps';
import { StampTurn } from '../stamp-turn';
import { appearanceBox } from './appearance';
import type { ReaderFile } from './reader-file';
import { MarkFonts } from '../mark-fonts';

/** The colour a mark takes where the file names none (default). */
const NO_COLOUR = '#000000';
/** EPDFAnnot_GetColor's interior colour: a shape's `IC`. */
const COLOUR_INSIDE = 1;
/** EPDFAnnot_GetBorderStyle's answer for a dashed line. */
const BORDER_DASHED = 2;
/** A line end as the reader numbers it; numbers it has past these (reversed arrows, a slash) read as none. */
const ENDS: Readonly<Record<number, LineEnd>> = {
  0: 'none',
  1: 'square',
  2: 'circle',
  3: 'diamond',
  4: 'open-arrow',
  5: 'arrow',
  6: 'bar',
};
/** `Q` as the file holds it; Justified rides `DS` beside a 0. */
const ALIGNS: Readonly<Record<number, TextAlign>> = { 0: 'left', 1: 'centre', 2: 'right' };
/** A typed mark's size where its `DA` says none: a reader's own (default). */
const TEXT_SIZE_UNSAID_PT = 12;
/** A point as the reader writes one: two single-precision numbers. */
const POINT_BYTES = 8;

const within = (n: number, least: number, most: number): number =>
  Math.min(Math.max(n, least), most);
// The reader answers single precision: a thousandth of a point is as fine as a page tells apart.
const thousandth = (n: number): number => Math.round(n * 1000) / 1000;
const channel = (n: number): string => within(Math.round(n), 0, 255).toString(16).padStart(2, '0');

/** Reads `count` points the reader writes into a buffer it is handed; flat, as the mark holds them. */
function pointsRead(
  file: ReaderFile,
  count: number,
  ask: (out: number, size: number) => number,
): number[] {
  if (count <= 0) return [];
  const out = file.alloc(count * POINT_BYTES);
  const got = Math.min(ask(out, count), count);
  const flat: number[] = [];
  for (let n = 0; n < got * 2; n += 1)
    flat.push(thousandth(file.held(file.runtime.getValue(out + n * 4, 'float'))));
  file.free(out);
  return flat;
}

/** The floats the reader writes, one an out-parameter each; null where it answers that there are none. */
function floatsRead(
  file: ReaderFile,
  count: number,
  ask: (...outs: number[]) => boolean,
): number[] | null {
  const out = file.alloc(count * 4);
  const outs = Array.from({ length: count }, (_, n) => out + n * 4);
  const read = ask(...outs) ? outs.map((at) => file.runtime.getValue(at, 'float')) : null;
  file.free(out);
  return read;
}

function insideColour(file: ReaderFile, annotation: number): string | null {
  const { p } = file;
  if (!p.FPDFAnnot_HasKey(annotation, 'IC')) return null;
  const out = file.alloc(12);
  const named = p.EPDFAnnot_GetColor(annotation, COLOUR_INSIDE, out, out + 4, out + 8);
  const colour = named
    ? `#${[0, 4, 8].map((at) => channel(file.runtime.getValue(out + at, 'i32'))).join('')}`
    : null;
  file.free(out);
  return colour;
}

/** A line's width and style: the width held within a mark's, a dashed line's style the one whose pattern it is. */
function lineOf(file: ReaderFile, annotation: number): { width: number; lineStyle?: LineStyle } {
  const { p } = file;
  const out = file.alloc(4);
  const style = p.EPDFAnnot_GetBorderStyle(annotation, out);
  const read = file.runtime.getValue(out, 'float');
  file.free(out);
  const width = thousandth(
    within(Number.isFinite(read) ? read : 1, PDF_MARK_WIDTH_MIN_PT, PDF_MARK_WIDTH_MAX_PT),
  );
  if (style !== BORDER_DASHED) return { width };
  const count = p.EPDFAnnot_GetBorderDashPatternCount(annotation);
  const pattern = count > 0 ? dashRead(file, annotation, count) : [];
  const named = LINE_STYLES.find((each) => {
    const own = MarkDrawing.pattern(each, width);
    return (
      own.length > 0 &&
      own.length === pattern.length &&
      own.every((n, at) => Math.abs(n - pattern[at]!) < 0.01)
    );
  });
  // A dashed line of a pattern LiveDoc does not draw is read as Dashed.
  return { width, lineStyle: named ?? 'dashed' };
}

function dashRead(file: ReaderFile, annotation: number, count: number): number[] {
  const out = file.alloc(count * 4);
  const read = file.p.EPDFAnnot_GetBorderDashPattern(annotation, out, count)
    ? Array.from({ length: count }, (_, n) => file.runtime.getValue(out + n * 4, 'float'))
    : [];
  file.free(out);
  return read;
}

/** The text under a text mark's quads, as the page holds it. */
function textUnder(file: ReaderFile, page: number, quads: readonly Quad[]): string {
  const { p } = file;
  const text = p.FPDFText_LoadPage(page);
  if (!text) return '';
  try {
    return quads
      .map(([x1, y1, x2, y2, x3, y3, x4, y4]) => {
        const xs = [x1, x2, x3, x4];
        const ys = [y1, y2, y3, y4];
        const bounds = [
          Math.min(...xs),
          Math.max(...ys),
          Math.max(...xs),
          Math.min(...ys),
        ] as const;
        const size = p.FPDFText_GetBoundedText(text, ...bounds, 0, 0);
        if (size <= 0) return '';
        const out = file.alloc((size + 1) * 2);
        p.FPDFText_GetBoundedText(text, ...bounds, out, size + 1);
        const read = file.runtime.UTF16ToString(out);
        file.free(out);
        return read.trim();
      })
      .filter((piece) => piece !== '')
      .join(' ')
      .slice(0, PDF_MARK_TEXT_MAX_CHARS);
  } finally {
    p.FPDFText_ClosePage(text);
  }
}

/** A colour channel of the file, 0 to 1, as a byte: the bin it falls in, as the bake writes each mid-bin. */
const byte = (n: number): string => channel(Math.floor(within(n, 0, 1) * 255));

/**
 * A typed mark's font size and colour, as its `DA` says (`/Helv 12 Tf 1 0 0 rg`, or a grey as `0.5 g`); null where it
 * says neither.
 */
function typedLook(
  file: ReaderFile,
  annotation: number,
): { size: number | null; colour: string | null } {
  const said = file.written(PDF_MARK_TEXT_MAX_CHARS, (buffer, size) =>
    file.p.FPDFAnnot_GetStringValue(annotation, 'DA', buffer, size),
  );
  const sized = /(\d*\.?\d+)\s+Tf\b/.exec(said);
  const rgb = /(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s+rg\b/.exec(said);
  const grey = /(\d*\.?\d+)\s+g\b/.exec(said);
  const read = sized ? Number(sized[1]) : Number.NaN;
  return {
    size:
      Number.isFinite(read) && read > 0
        ? thousandth(within(read, PDF_TEXT_SIZE_MIN_PT, PDF_TEXT_SIZE_MAX_PT))
        : null,
    colour: rgb
      ? `#${[rgb[1], rgb[2], rgb[3]].map((n) => byte(Number(n))).join('')}`
      : grey
        ? `#${byte(Number(grey[1])).repeat(3)}`
        : null,
  };
}

/** A typed mark's default style, `DS`, as the file writes it; '' where it has none. */
const defaultStyleOf = (file: ReaderFile, annotation: number): string =>
  file.written(PDF_MARK_TEXT_MAX_CHARS, (buffer, size) =>
    file.p.FPDFAnnot_GetStringValue(annotation, 'DS', buffer, size),
  );

/** A typed mark's font: its default style's `font-family` where that names a family of the Font menu, else none. */
function fontOf(style: string): { font?: string } {
  const family = /font-family\s*:\s*(?:'([^']*)'|"([^"]*)"|([^;,]*))/i.exec(style);
  const font = family ? MarkFonts.of(family[1] ?? family[2] ?? family[3]) : null;
  return font ? { font } : {};
}

/** A typed mark's alignment: none until the file names one, Justified where its default style says so. */
function alignOf(file: ReaderFile, annotation: number, style: string): { align?: TextAlign } {
  const { p } = file;
  if (!p.FPDFAnnot_HasKey(annotation, 'Q')) return {};
  if (/text-align\s*:\s*justify/i.test(style)) return { align: 'justified' };
  const align = ALIGNS[p.EPDFAnnot_GetTextAlignment(annotation)];
  return align ? { align } : {};
}

const intentOf = (file: ReaderFile, annotation: number): string => {
  const { p } = file;
  const units = p.EPDFAnnot_GetIntent(annotation, 0, 0);
  if (units <= 0) return '';
  const bytes = (units + 1) * 2;
  const out = file.alloc(bytes);
  p.EPDFAnnot_GetIntent(annotation, out, bytes);
  const read = file.runtime.UTF16ToString(out);
  file.free(out);
  return read;
};

/** `Rect` less the box differences `RD` names, where it names them. */
function innerBox(file: ReaderFile, annotation: number, rect: Box): Box {
  const sides = floatsRead(file, 4, (left, bottom, right, top) =>
    file.p.EPDFAnnot_GetRectangleDifferences(annotation, left, bottom, right, top),
  );
  if (!sides || !sides.every((n) => Number.isFinite(n) && n >= 0)) return rect;
  const [left, bottom, right, top] = sides as [number, number, number, number];
  return [rect[0] + left, rect[1] + bottom, rect[2] - right, rect[3] - top].map(
    thousandth,
  ) as unknown as Box;
}

/** A box made smaller by `by` on each side, or as it is where that would leave nothing. */
const shrunk = ([left, bottom, right, top]: Box, by: Box): Box => {
  const box = [left + by[0], bottom + by[1], right - by[2], top - by[3]] as const;
  return box[0] < box[2] && box[1] < box[3]
    ? (box.map(thousandth) as unknown as Box)
    : [left, bottom, right, top];
};

/** How many times the box a stamp was drawn for is reckoned again from the `Rect` it reached. */
const DRAWN_WITHIN_STEPS = 6;

/**
 * The box LiveDoc's appearance was drawn for, found from the `Rect` it reached: each step moves the box by how far
 * the appearance drawn for it misses the `Rect`. A stamp's border keeps its proportions within its box, so how far it
 * reaches past the box changes little with the box, and a few steps find it to well within a thousandth.
 */
function drawnWithin(rect: Box, drawing: (rect: Box) => ReturnType<typeof MarkDrawing.of>): Box {
  let box: Box = rect;
  for (let step = 0; step < DRAWN_WITHIN_STEPS; step += 1) {
    const reached = appearanceBox(drawing(box), box);
    const next = box.map((n, at) => n + rect[at]! - reached[at]!) as unknown as Box;
    if (!(next[0] < next[2] && next[1] < next[3])) return rect;
    box = next;
  }
  return box.map(thousandth) as unknown as Box;
}

/** A file's `Subj` as the mark's subject; none where it is the kind's own name, as LiveDoc reads its kind. */
function subjectRead(mark: Omit<FileMark, 'mark'>): { subject?: string } {
  const subject = mark.subject.trim();
  const own = Object.values(MARK_KIND_LABELS).some(
    (label) => label.toLowerCase() === subject.toLowerCase(),
  );
  return subject && !own ? { subject } : {};
}

/** A stamp's `Rotate` where it is a quarter turn (marks.md "In the file"); any other reads as none. */
function turnOf(file: ReaderFile, annotation: number): StampTurnDegrees | undefined {
  const out = file.alloc(4);
  const named = file.p.FPDFAnnot_GetNumberValue(annotation, 'Rotate', out);
  const read = file.runtime.getValue(out, 'float');
  file.free(out);
  const degrees = named && Number.isFinite(read) ? ((Math.round(read) % 360) + 360) % 360 : 0;
  return STAMP_TURNS.includes(degrees as StampTurnDegrees)
    ? (degrees as StampTurnDegrees)
    : undefined;
}

/** What every kind holds: its id, page, colour, opacity, author, subject and dates. */
function baseOf(mark: Omit<FileMark, 'mark'>, page: PageName, colour: string | null) {
  const created = PdfDate.read(mark.created);
  const modified = PdfDate.read(mark.modified);
  return {
    id: mark.id,
    page,
    colour: colour ?? NO_COLOUR,
    opacity: within(mark.opacity, 0.1, 1),
    author: mark.author,
    ...subjectRead(mark),
    createdAt: Math.max(created ?? modified ?? 0, 0),
    modifiedAt: Math.max(modified ?? created ?? 0, 0),
  };
}

/** The mark of each kind LiveDoc makes, as the annotation's entries say it; undefined for a kind it does not make. */
function valueOf(
  file: ReaderFile,
  page: number,
  annotation: number,
  mark: Omit<FileMark, 'mark'>,
  name: PageName,
): Record<string, unknown> | undefined {
  const { p } = file;
  const { subtype } = mark;
  const rect = mark.rect;
  if (
    subtype === 'highlight' ||
    subtype === 'underline' ||
    subtype === 'strikeout' ||
    subtype === 'squiggly'
  )
    return {
      ...baseOf(mark, name, mark.colour),
      kind: subtype,
      quads: mark.quads,
      text: textUnder(file, page, mark.quads),
    };
  if (subtype === 'ink') {
    const strokes = Array.from(
      { length: Math.max(p.FPDFAnnot_GetInkListCount(annotation), 0) },
      (_, n) =>
        pointsRead(file, p.FPDFAnnot_GetInkListPath(annotation, n, 0, 0), (out, size) =>
          p.FPDFAnnot_GetInkListPath(annotation, n, out, size),
        ),
    ).filter((stroke) => stroke.length >= 2);
    if (strokes.reduce((sum, stroke) => sum + stroke.length / 2, 0) > PDF_DRAWING_MAX_POINTS)
      return {};
    return {
      ...baseOf(mark, name, mark.colour),
      kind: 'drawing',
      strokes,
      ...lineOf(file, annotation),
    };
  }
  if (subtype === 'line') {
    const line = floatsRead(file, 4, (start, _y, end) =>
      p.FPDFAnnot_GetLine(annotation, start, end),
    );
    if (!line) return {};
    const out = file.alloc(8);
    const ended = p.EPDFAnnot_GetLineEndings(annotation, out, out + 4);
    const end = ended ? (ENDS[file.runtime.getValue(out + 4, 'i32')] ?? 'none') : 'none';
    file.free(out);
    return {
      ...baseOf(mark, name, mark.colour),
      kind: intentOf(file, annotation) === 'LineArrow' ? 'arrow' : 'line',
      line: line.map((n) => thousandth(file.held(n))),
      lineEnd: end,
      ...lineOf(file, annotation),
    };
  }
  if (subtype === 'polygon' || subtype === 'polyline') {
    const count = p.FPDFAnnot_GetVertices(annotation, 0, 0);
    if (count > PDF_POLYGON_MAX_CORNERS) return {};
    const corners = pointsRead(file, count, (out, size) =>
      p.FPDFAnnot_GetVertices(annotation, out, size),
    );
    const base = { ...baseOf(mark, name, mark.colour), corners, ...lineOf(file, annotation) };
    if (subtype === 'polyline') {
      const out = file.alloc(8);
      const ended = p.EPDFAnnot_GetLineEndings(annotation, out, out + 4);
      const end = ended ? (ENDS[file.runtime.getValue(out + 4, 'i32')] ?? 'none') : 'none';
      file.free(out);
      return { ...base, kind: 'polyline', lineEnd: end };
    }
    // A cloudy border (`BE` `S` `C`) is a Cloud.
    const intensity = file.alloc(4);
    const cloudy = p.EPDFAnnot_GetBorderEffect(annotation, intensity);
    file.free(intensity);
    const fill = insideColour(file, annotation);
    return { ...base, kind: cloudy ? 'cloud' : 'polygon', ...(fill ? { fill } : {}) };
  }
  if (subtype === 'square' || subtype === 'circle') {
    const lined = lineOf(file, annotation);
    const half = lined.width / 2;
    const fill = insideColour(file, annotation);
    return {
      ...baseOf(mark, name, mark.colour),
      kind: subtype === 'square' ? 'rectangle' : 'ellipse',
      rect: shrunk(innerBox(file, annotation, rect), [half, half, half, half]),
      ...lined,
      ...(fill ? { fill } : {}),
    };
  }
  if (subtype === 'freetext') {
    const look = typedLook(file, annotation);
    const callout = pointsRead(file, p.EPDFAnnot_GetCalloutLineCount(annotation), (out, size) =>
      p.EPDFAnnot_GetCalloutLine(annotation, out, size),
    );
    const style = defaultStyleOf(file, annotation);
    const typed = {
      ...baseOf(mark, name, look.colour ?? mark.colour),
      words: mark.words,
      size: look.size ?? TEXT_SIZE_UNSAID_PT,
      ...alignOf(file, annotation, style),
      ...fontOf(style),
    };
    if (callout.length < 4)
      return { ...typed, kind: 'text', rect: innerBox(file, annotation, rect) };
    // A line of two points has no knee: it bends at what it points to.
    const [x1, y1, ...rest] = callout;
    const line = callout.length >= 6 ? callout.slice(0, 6) : [x1, y1, x1, y1, ...rest.slice(0, 2)];
    return { ...typed, kind: 'callout', rect: innerBox(file, annotation, rect), callout: line };
  }
  if (subtype === 'stamp') {
    const fileName = file.written(64, (buffer, size) =>
      p.FPDFAnnot_GetStringValue(annotation, 'Name', buffer, size),
    );
    // marks.md "Stamps": a stamp's lines are its Contents' lines, at most three; a file's of more keeps its first.
    const lines = mark.words
      .split('\n')
      .filter((line) => /\S/.test(line))
      .slice(0, STAMP_MAX_LINES);
    const stamp = (lines.length > 1 ? Stamps.dynamic : Stamps.standard).find(
      (each) => each.fileName === fileName.replace(/^\//, ''),
    );
    if (!stamp) return {};
    const turn = turnOf(file, annotation);
    const value = {
      ...baseOf(mark, name, mark.colour),
      kind: 'stamp' as const,
      stamp: stamp.id,
      lines: lines.length > 0 ? lines : [stamp.name.toUpperCase()],
      ...(turn ? { turn } : {}),
    };
    // A turned stamp's `Rect` is its box as it shows: its upright drawing's box is that, its sides swapped back.
    return {
      ...value,
      rect: drawnWithin(StampTurn.upright(rect, turn), (box) =>
        MarkDrawing.of({ ...value, rect: box }),
      ),
    };
  }
  return undefined;
}

/** The file's mark as LiveDoc's own, or null where LiveDoc cannot read it as one (marks.md "Changing a mark"). */
export function readAsMark(
  file: ReaderFile,
  page: number,
  annotation: number,
  mark: Omit<FileMark, 'mark'>,
  name: PageName,
): Mark | null {
  const value = valueOf(file, page, annotation, mark, name);
  return value ? Mark.parse(value) : null;
}
