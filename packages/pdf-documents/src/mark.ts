// A mark (docs/specs/035-pdf-documents/marks.md): something placed on top of a PDF page that leaves its page content
// alone. A value object: made and checked here, held in the live changes one property a whole value, written into the
// file as one annotation by the bake. The kinds join as they are built: the four that mark text, named by the file's
// own word for each (`Highlight`, `Underline`, `StrikeOut`, `Squiggly`); the Drawing (`Ink`); the Line and the Arrow
// (`Line`); the Rectangle and the Ellipse (`Square`, `Circle`); the Text and the Callout (`FreeText`); the stamp
// (`Stamp`).
import {
  PDF_DRAWING_MAX_POINTS,
  PDF_MARK_MAX_QUADS,
  PDF_MARK_TEXT_MAX_CHARS,
  PDF_MARK_WIDTH_MAX_PT,
  PDF_MARK_WIDTH_MIN_PT,
  PDF_MAX_COORDINATE,
  PDF_STAMP_LINE_MAX_CHARS,
  PDF_TEXT_SIZE_MAX_PT,
  PDF_TEXT_SIZE_MIN_PT,
} from './limits';
import { PageName } from './page-name';
import { MarkFonts } from './mark-fonts';

/** One quadrilateral in page space, as the standard's QuadPoints order them: upper left, upper right, lower left,
 *  lower right, each an x and a y. */
export type Quad = readonly [number, number, number, number, number, number, number, number];

/** One stroke of a Drawing in page space: the points it passed, each an x and a y, flat as the file's InkList. */
export type Stroke = readonly number[];

/** A Line's or an Arrow's two ends, the file's `L`: `[x1, y1, x2, y2]`, an Arrow's head at the second. */
export type Segment = readonly [number, number, number, number];

/** An upright box in page space: `[left, bottom, right, top]`. */
export type Box = readonly [number, number, number, number];

/** A Callout's line, the file's `CL`: what is meant (the arrowhead's tip), the knee, and the end on the box's side. */
export type CalloutLine = readonly [number, number, number, number, number, number];

export const TEXT_MARK_KINDS = ['highlight', 'underline', 'strikeout', 'squiggly'] as const;
export const LINE_MARK_KINDS = ['line', 'arrow'] as const;
export const SHAPE_MARK_KINDS = ['rectangle', 'ellipse'] as const;
export const TYPED_MARK_KINDS = ['text', 'callout'] as const;
export const MARK_KINDS = [
  ...TEXT_MARK_KINDS,
  'drawing',
  ...LINE_MARK_KINDS,
  ...SHAPE_MARK_KINDS,
  ...TYPED_MARK_KINDS,
  'stamp',
] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

/** A line's style (marks.md "Changing a mark": Format > Line style); Solid is held as no style at all. */
export const LINE_STYLES = ['solid', 'dashed', 'dotted', 'dash-dot', 'long-dashes'] as const;
export type LineStyle = (typeof LINE_STYLES)[number];

/** A Line's or an Arrow's second end (marks.md "Changing a mark": Format > Line ends). */
export const LINE_ENDS = [
  'none',
  'arrow',
  'open-arrow',
  'circle',
  'square',
  'diamond',
  'bar',
] as const;
export type LineEnd = (typeof LINE_ENDS)[number];

/** A Text's or a Callout's alignment once chosen (marks.md "Changing a mark": Format > Align text). */
export const TEXT_ALIGNS = ['left', 'centre', 'right', 'justified'] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

/** Each line kind's end until changed: a Line's bare, an Arrow's an open head. */
const FIRST_ENDS = { line: 'none', arrow: 'open-arrow' } as const satisfies Record<string, LineEnd>;

/** The kinds made by selecting text (marks.md "Kinds"): each is the glyphs it covers. */
export type TextMarkKind = (typeof TEXT_MARK_KINDS)[number];
/** The kinds made by a drag from one end to the other. */
export type LineMarkKind = (typeof LINE_MARK_KINDS)[number];
/** The kinds made by a drag across a box. */
export type ShapeMarkKind = (typeof SHAPE_MARK_KINDS)[number];
/** The kinds whose words are typed straight onto the page. */
export type TypedMarkKind = (typeof TYPED_MARK_KINDS)[number];

/** What a mark drawn as a line holds of its line's look past its width. */
type Lined = {
  /** Its line's style; absent for Solid. */
  readonly lineStyle?: Exclude<LineStyle, 'solid'>;
};

type MarkBase = {
  readonly id: string;
  readonly page: PageName;
  /** `#rrggbb`, as the file will hold it. */
  readonly colour: string;
  /** 0.1 to 1. */
  readonly opacity: number;
  /** The display name of who made it: the file's `T`. */
  readonly author: string;
  /**
   * The adder key of who made it here, on this document (marks.md "Share roles"): what makes it a person's own. Kept in
   * the live changes alone, never in the file; absent on a file's own mark and on one made with no key.
   */
  readonly authorKey?: string;
  /** The group it is one of (marks.md "Changing a mark"): the marks of its page sharing it move and answer as one. */
  readonly group?: string;
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

export type DrawingMark = MarkBase &
  Lined & {
    readonly kind: 'drawing';
    readonly strokes: readonly Stroke[];
    /** The line's width in points. */
    readonly width: number;
  };

export type LineMark = MarkBase &
  Lined & {
    readonly kind: LineMarkKind;
    /** Its second end's look; absent for its kind's own (Mark.firstEnd). */
    readonly lineEnd?: LineEnd;
    readonly line: Segment;
    /** The line's width in points. */
    readonly width: number;
  };

export type ShapeMark = MarkBase &
  Lined & {
    readonly kind: ShapeMarkKind;
    /** What fills it inside its line, `#rrggbb`; absent for no fill. */
    readonly fill?: string;
    /** The box the line runs along: its middle, so half the line falls outside it. */
    readonly rect: Box;
    /** The line's width in points. */
    readonly width: number;
  };

type TypedBase = MarkBase & {
  /** The box the words are set in. */
  readonly rect: Box;
  /** What was typed: never only spaces. */
  readonly words: string;
  /** The words' size in points. */
  readonly size: number;
  /** How its lines sit in the box; absent until chosen, each paragraph then set from its own side. */
  readonly align?: TextAlign;
  /** The font its words are set in, a family of the Font menu (`MARK_FONTS`); absent, Helvetica. */
  readonly font?: string;
};

export type TextBoxMark = TypedBase & { readonly kind: 'text' };

export type CalloutMark = TypedBase & { readonly kind: 'callout'; readonly callout: CalloutLine };

/** A Text or a Callout: words typed straight onto the page. */
export type TypedMark = TextBoxMark | CalloutMark;

/** A stamp: ready-made words in a box, placed by a press (marks.md "Stamps"). */
export type StampMark = MarkBase & {
  readonly kind: 'stamp';
  /** The box it is drawn in. */
  readonly rect: Box;
  /** Which stamp it is: a LiveDoc id (stamps.ts), any such id, so a stamp of a person's own fits too. */
  readonly stamp: string;
  /** Its words as drawn, fixed when placed: its name in capitals, and a dynamic stamp's who and when. */
  readonly lines: readonly string[];
};

export type Mark = TextMark | DrawingMark | LineMark | ShapeMark | TypedMark | StampMark;

// A LiveDoc id, or a file mark's own: its `NM` as files name marks (a GUID in braces, dotted names) or `o:<object>`.
const ID = /^[A-Za-z0-9_.:{}-]{1,64}$/;
const STAMP_ID = /^[a-z0-9-]{1,64}$/;
/** A stamp's lines: its name, and a dynamic stamp's second. */
const STAMP_MAX_LINES = 2;
const COLOUR = /^#[0-9a-f]{6}$/;
/** A display name, cut as every name shown from a file is (security.md "Limits": PDF_NAME_MAX_CHARS). */
const AUTHOR_MAX_CHARS = 255;
/** An adder key: 32 hex characters from the room, or a participant key in This Browser. */
const AUTHOR_KEY = /^[A-Za-z0-9_-]{1,64}$/;
const OPACITY_MIN = 0.1;
/** A JavaScript date's own range, so a mark's time always writes as a date. */
const TIME_MAX = 8.64e15;

const isCoordinate = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= PDF_MAX_COORDINATE;

const isQuad = (value: unknown): value is Quad =>
  Array.isArray(value) && value.length === 8 && value.every(isCoordinate);

const isStroke = (value: unknown): value is Stroke =>
  Array.isArray(value) && value.length >= 2 && value.length % 2 === 0 && value.every(isCoordinate);

const isFour = (value: unknown): value is Segment =>
  Array.isArray(value) && value.length === 4 && value.every(isCoordinate);

const isSix = (value: unknown): value is CalloutLine =>
  Array.isArray(value) && value.length === 6 && value.every(isCoordinate);

/** Words typed: a string with more than spaces in it. */
const isWords = (value: unknown): value is string => typeof value === 'string' && /\S/.test(value);

const isSize = (value: unknown): value is number =>
  typeof value === 'number' && value >= PDF_TEXT_SIZE_MIN_PT && value <= PDF_TEXT_SIZE_MAX_PT;

const isWidth = (value: unknown): value is number =>
  typeof value === 'number' && value >= PDF_MARK_WIDTH_MIN_PT && value <= PDF_MARK_WIDTH_MAX_PT;

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= TIME_MAX;

/** A line's style as a mark holds it: Solid (or none) as nothing; undefined where it is no style. */
function lineStyleOf(v: Record<string, unknown>): Lined | undefined {
  if (v.lineStyle === undefined || v.lineStyle === null || v.lineStyle === 'solid') return {};
  if (!LINE_STYLES.includes(v.lineStyle as LineStyle)) return undefined;
  return { lineStyle: v.lineStyle as Exclude<LineStyle, 'solid'> };
}

/** The points of a Drawing's strokes, all told. */
const pointsOf = (strokes: readonly Stroke[]): number =>
  strokes.reduce((sum, stroke) => sum + stroke.length / 2, 0);

export type HighlightInput = Omit<TextMark, 'kind' | 'modifiedAt'>;
export type DrawingInput = Omit<DrawingMark, 'kind' | 'modifiedAt'>;
export type LineInput = Omit<LineMark, 'kind' | 'modifiedAt'>;
export type ShapeInput = Omit<ShapeMark, 'kind' | 'modifiedAt'>;
export type TextBoxInput = Omit<TextBoxMark, 'kind' | 'modifiedAt'>;
export type CalloutInput = Omit<CalloutMark, 'kind' | 'modifiedAt'>;
export type StampInput = Omit<StampMark, 'kind' | 'modifiedAt'>;

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
    ...Mark.keyed(
      typeof v.authorKey === 'string' && AUTHOR_KEY.test(v.authorKey) ? v.authorKey : null,
    ),
    ...(typeof v.group === 'string' && ID.test(v.group) ? { group: v.group } : {}),
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
  const lined = lineStyleOf(v);
  if (!isWidth(v.width) || !lined) return null;
  return {
    ...base,
    kind: 'drawing',
    strokes: v.strokes.map((stroke) => [...stroke]),
    width: v.width,
    ...lined,
  };
}

function lineOf(base: MarkBase, v: Record<string, unknown>): LineMark | null {
  const lined = lineStyleOf(v);
  if (!isFour(v.line) || !isWidth(v.width) || !lined) return null;
  const kind = v.kind as LineMarkKind;
  const { lineEnd } = v;
  const named = lineEnd !== undefined && lineEnd !== null && lineEnd !== FIRST_ENDS[kind];
  if (named && !LINE_ENDS.includes(lineEnd as LineEnd)) return null;
  const [x1, y1, x2, y2] = v.line;
  return {
    ...base,
    kind,
    line: [x1, y1, x2, y2],
    width: v.width,
    ...lined,
    ...(named ? { lineEnd: lineEnd as LineEnd } : {}),
  };
}

function shapeOf(base: MarkBase, v: Record<string, unknown>): ShapeMark | null {
  const lined = lineStyleOf(v);
  if (!isFour(v.rect) || !isWidth(v.width) || !lined) return null;
  const [left, bottom, right, top] = v.rect;
  if (left > right || bottom > top) return null;
  const { fill } = v;
  if (fill !== undefined && fill !== null && (typeof fill !== 'string' || !COLOUR.test(fill)))
    return null;
  return {
    ...base,
    kind: v.kind as ShapeMarkKind,
    rect: [left, bottom, right, top],
    width: v.width,
    ...lined,
    ...(typeof fill === 'string' ? { fill } : {}),
  };
}

/** A Text's or a Callout's font: a family of the Font menu in its own spelling; anything else is none. */
function fontOf(font: unknown): { font?: string } {
  const known = MarkFonts.of(font);
  return known ? { font: known } : {};
}

function typedOf(base: MarkBase, v: Record<string, unknown>): TypedMark | null {
  if (!isFour(v.rect) || !isWords(v.words) || !isSize(v.size)) return null;
  const [left, bottom, right, top] = v.rect;
  if (left > right || bottom > top) return null;
  const { align } = v;
  const aligned = align !== undefined && align !== null;
  if (aligned && !TEXT_ALIGNS.includes(align as TextAlign)) return null;
  const typed = {
    ...base,
    rect: [left, bottom, right, top] as const,
    words: v.words.slice(0, PDF_MARK_TEXT_MAX_CHARS),
    size: v.size,
    ...(aligned ? { align: align as TextAlign } : {}),
    ...fontOf(v.font),
  };
  if (v.kind === 'text') return { ...typed, kind: 'text' };
  if (!isSix(v.callout)) return null;
  const [x1, y1, x2, y2, x3, y3] = v.callout;
  return { ...typed, kind: 'callout', callout: [x1, y1, x2, y2, x3, y3] };
}

function stampOf(base: MarkBase, v: Record<string, unknown>): StampMark | null {
  if (!isFour(v.rect) || typeof v.stamp !== 'string' || !STAMP_ID.test(v.stamp)) return null;
  const [left, bottom, right, top] = v.rect;
  if (left >= right || bottom >= top) return null;
  const { lines } = v;
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > STAMP_MAX_LINES) return null;
  if (!lines.every((line) => isWords(line) && line.length <= PDF_STAMP_LINE_MAX_CHARS)) return null;
  return {
    ...base,
    kind: 'stamp',
    rect: [left, bottom, right, top],
    stamp: v.stamp,
    lines: [...(lines as string[])],
  };
}

/** How each kind past the base is checked. */
const KIND_OF: Readonly<
  Record<MarkKind, (base: MarkBase, v: Record<string, unknown>) => Mark | null>
> = {
  highlight: textMarkOf,
  underline: textMarkOf,
  strikeout: textMarkOf,
  squiggly: textMarkOf,
  drawing: drawingOf,
  line: lineOf,
  arrow: lineOf,
  rectangle: shapeOf,
  ellipse: shapeOf,
  text: typedOf,
  callout: typedOf,
  stamp: stampOf,
};

/** Every x, y of a mark's geometry, flat. */
function pointsAll(mark: Mark): readonly number[] {
  if (Mark.isText(mark)) return mark.quads.flat();
  if (mark.kind === 'drawing') return mark.strokes.flat();
  if ('line' in mark) return mark.line;
  return mark.kind === 'callout' ? [...mark.rect, ...mark.callout] : mark.rect;
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

  /** A Line or an Arrow from end to end, or null when what is given is no such mark. */
  line: (kind: LineMarkKind, input: LineInput): LineMark | null =>
    Mark.parse({ ...input, kind, modifiedAt: input.createdAt }) as LineMark | null,

  /** A Rectangle or an Ellipse along a box, or null when what is given is no such mark. */
  shape: (kind: ShapeMarkKind, input: ShapeInput): ShapeMark | null =>
    Mark.parse({ ...input, kind, modifiedAt: input.createdAt }) as ShapeMark | null,

  /** A Text in a box, or null when what is given is no Text. */
  text: (input: TextBoxInput): TextBoxMark | null =>
    Mark.parse({ ...input, kind: 'text', modifiedAt: input.createdAt }) as TextBoxMark | null,

  /** A Callout in a box, its line to what is meant, or null when what is given is no Callout. */
  callout: (input: CalloutInput): CalloutMark | null =>
    Mark.parse({ ...input, kind: 'callout', modifiedAt: input.createdAt }) as CalloutMark | null,

  /** A stamp in a box, or null when what is given is no stamp. */
  stamp: (input: StampInput): StampMark | null =>
    Mark.parse({ ...input, kind: 'stamp', modifiedAt: input.createdAt }) as StampMark | null,

  /** A Line's or an Arrow's second end until changed. */
  firstEnd: (kind: LineMarkKind): LineEnd => FIRST_ENDS[kind],

  /** Whether a mark is a Text or a Callout. */
  isTyped: (mark: Mark): mark is TypedMark =>
    (TYPED_MARK_KINDS as readonly MarkKind[]).includes(mark.kind),

  /** Whether a mark is one of the kinds made by selecting text. */
  isText: (mark: Mark): mark is TextMark =>
    (TEXT_MARK_KINDS as readonly MarkKind[]).includes(mark.kind),

  /** A mark's author key as its properties: `{ authorKey }`, or none for no key. */
  keyed: (key: string | null | undefined): { readonly authorKey?: string } =>
    key ? { authorKey: key } : {},

  /** Whether `mark` is the own of the person holding `key` (marks.md "Share roles"): no key owns nothing. */
  isOwn: (mark: Mark, key: string | null): boolean => key !== null && mark.authorKey === key,

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
    return KIND_OF[v.kind as MarkKind](base, v);
  },

  /** The smallest upright rectangle holding all of the mark: `[left, bottom, right, top]` in page space. */
  bounds: (mark: Mark): readonly [number, number, number, number] => {
    const flat = pointsAll(mark);
    const xs = flat.filter((_, at) => at % 2 === 0);
    const ys = flat.filter((_, at) => at % 2 === 1);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  },
} as const;
