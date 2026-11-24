// A mark (docs/specs/035-pdf-documents/marks.md): something placed on top of a PDF page that leaves its page content
// alone. A value object: made and checked here, held in the live changes one property a whole value, written into the
// file as one annotation by the bake. The kinds join as they are built: the four that mark text, named by the file's
// own word for each (`Highlight`, `Underline`, `StrikeOut`, `Squiggly`), and the Drawing (`Ink`).
import {
  PDF_DRAWING_MAX_POINTS,
  PDF_MARK_MAX_QUADS,
  PDF_MARK_TEXT_MAX_CHARS,
  PDF_MARK_WIDTH_MAX_PT,
  PDF_MARK_WIDTH_MIN_PT,
  PDF_MAX_COORDINATE,
} from './limits';
import { PageName } from './page-name';

/** One quadrilateral in page space, as the standard's QuadPoints order them: upper left, upper right, lower left,
 *  lower right, each an x and a y. */
export type Quad = readonly [number, number, number, number, number, number, number, number];

/** One stroke of a Drawing in page space: the points it passed, each an x and a y, flat as the file's InkList. */
export type Stroke = readonly number[];

export const TEXT_MARK_KINDS = ['highlight', 'underline', 'strikeout', 'squiggly'] as const;
export const MARK_KINDS = [...TEXT_MARK_KINDS, 'drawing'] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

/** The kinds made by selecting text (marks.md "Kinds"): each is the glyphs it covers. */
export type TextMarkKind = (typeof TEXT_MARK_KINDS)[number];

type MarkBase = {
  readonly id: string;
  readonly page: PageName;
  /** `#rrggbb`, as the file will hold it. */
  readonly colour: string;
  /** 0.1 to 1. */
  readonly opacity: number;
  /** The display name of who made it: the file's `T`. */
  readonly author: string;
  /** Milliseconds since the epoch: the file's `CreationDate` and `M`. */
  readonly createdAt: number;
  readonly modifiedAt: number;
};

export type TextMark = MarkBase & {
  readonly kind: TextMarkKind;
  /** The glyphs covered, so the mark is drawn exactly over slanted lines and split columns. */
  readonly quads: readonly Quad[];
  /** The text covered. */
  readonly text: string;
};

export type DrawingMark = MarkBase & {
  readonly kind: 'drawing';
  readonly strokes: readonly Stroke[];
  /** The line's width in points. */
  readonly width: number;
};

export type Mark = TextMark | DrawingMark;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const COLOUR = /^#[0-9a-f]{6}$/;
/** A display name, cut as every name shown from a file is (security.md "Limits": PDF_NAME_MAX_CHARS). */
const AUTHOR_MAX_CHARS = 255;
const OPACITY_MIN = 0.1;
/** A JavaScript date's own range, so a mark's time always writes as a date. */
const TIME_MAX = 8.64e15;

const isCoordinate = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= PDF_MAX_COORDINATE;

const isQuad = (value: unknown): value is Quad =>
  Array.isArray(value) && value.length === 8 && value.every(isCoordinate);

const isStroke = (value: unknown): value is Stroke =>
  Array.isArray(value) && value.length >= 2 && value.length % 2 === 0 && value.every(isCoordinate);

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= TIME_MAX;

/** The points of a Drawing's strokes, all told. */
const pointsOf = (strokes: readonly Stroke[]): number =>
  strokes.reduce((sum, stroke) => sum + stroke.length / 2, 0);

export type HighlightInput = Omit<TextMark, 'kind' | 'modifiedAt'>;
export type DrawingInput = Omit<DrawingMark, 'kind' | 'modifiedAt'>;

/** What every kind holds, checked and bounded; null where any of it is not what a mark holds. */
function baseOf(v: Record<string, unknown>): MarkBase | null {
  const page = PageName.parse(v.page);
  if (typeof v.id !== 'string' || !ID.test(v.id) || !page) return null;
  if (typeof v.author !== 'string') return null;
  if (typeof v.colour !== 'string' || !COLOUR.test(v.colour)) return null;
  if (typeof v.opacity !== 'number' || !(v.opacity >= OPACITY_MIN && v.opacity <= 1)) return null;
  if (!isTime(v.createdAt) || !isTime(v.modifiedAt)) return null;
  return {
    id: v.id,
    page,
    colour: v.colour,
    opacity: v.opacity,
    author: v.author.slice(0, AUTHOR_MAX_CHARS),
    createdAt: v.createdAt,
    modifiedAt: v.modifiedAt,
  };
}

function textMarkOf(base: MarkBase, v: Record<string, unknown>): TextMark | null {
  if (!Array.isArray(v.quads) || v.quads.length === 0 || v.quads.length > PDF_MARK_MAX_QUADS)
    return null;
  if (!v.quads.every(isQuad) || typeof v.text !== 'string') return null;
  return {
    ...base,
    kind: v.kind as TextMarkKind,
    quads: v.quads.map((quad) => [...quad] as unknown as Quad),
    text: v.text.slice(0, PDF_MARK_TEXT_MAX_CHARS),
  };
}

function drawingOf(base: MarkBase, v: Record<string, unknown>): DrawingMark | null {
  if (!Array.isArray(v.strokes) || v.strokes.length === 0 || !v.strokes.every(isStroke))
    return null;
  if (pointsOf(v.strokes) > PDF_DRAWING_MAX_POINTS) return null;
  const width = v.width;
  if (
    typeof width !== 'number' ||
    !(width >= PDF_MARK_WIDTH_MIN_PT && width <= PDF_MARK_WIDTH_MAX_PT)
  )
    return null;
  return { ...base, kind: 'drawing', strokes: v.strokes.map((stroke) => [...stroke]), width };
}

export const Mark = {
  /** A mark of text of the kind given, over the quads given, or null when what is given is no such mark. */
  ofText: (kind: TextMarkKind, input: HighlightInput): TextMark | null =>
    Mark.parse({ ...input, kind, modifiedAt: input.createdAt }) as TextMark | null,

  /** A highlight over the quads given, or null when what is given is no highlight. */
  highlight: (input: HighlightInput): TextMark | null => Mark.ofText('highlight', input),

  /** A Drawing of the strokes given, or null when what is given is no Drawing. */
  drawing: (input: DrawingInput): DrawingMark | null =>
    Mark.parse({ ...input, kind: 'drawing', modifiedAt: input.createdAt }) as DrawingMark | null,

  /** Whether a mark is one of the kinds made by selecting text. */
  isText: (mark: Mark): mark is TextMark => mark.kind !== 'drawing',

  /** How many points a Drawing's strokes hold, all told. */
  points: (mark: DrawingMark): number => pointsOf(mark.strokes),

  /**
   * The mark a value holds, or null: every property is checked and bounded, since a mark arrives from other people's
   * browsers and from files (security.md "Abuse cases": a mark with hostile geometry or text).
   */
  parse: (value: unknown): Mark | null => {
    if (typeof value !== 'object' || value === null) return null;
    const v = value as Record<string, unknown>;
    if (!MARK_KINDS.includes(v.kind as MarkKind)) return null;
    const base = baseOf(v);
    if (!base) return null;
    return v.kind === 'drawing' ? drawingOf(base, v) : textMarkOf(base, v);
  },

  /** The smallest upright rectangle holding all of the mark: `[left, bottom, right, top]` in page space. */
  bounds: (mark: Mark): readonly [number, number, number, number] => {
    const flat = Mark.isText(mark) ? mark.quads.flat() : mark.strokes.flat();
    const xs = flat.filter((_, at) => at % 2 === 0);
    const ys = flat.filter((_, at) => at % 2 === 1);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  },
} as const;
