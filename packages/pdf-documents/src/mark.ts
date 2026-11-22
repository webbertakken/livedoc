// A mark (docs/specs/035-pdf-documents/marks.md): something placed on top of a PDF page that leaves its page content
// alone. A value object: made and checked here, held in the live changes one property a whole value, written into the
// file as one annotation by the bake. The kinds join as they are built; a highlight is the first.
import { PDF_MARK_MAX_QUADS, PDF_MARK_TEXT_MAX_CHARS, PDF_MAX_COORDINATE } from './limits';
import { PageName } from './page-name';

/** One quadrilateral in page space, as the standard's QuadPoints order them: upper left, upper right, lower left,
 *  lower right, each an x and a y. */
export type Quad = readonly [number, number, number, number, number, number, number, number];

export const MARK_KINDS = ['highlight'] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

export type Mark = {
  readonly id: string;
  readonly kind: MarkKind;
  readonly page: PageName;
  /** The glyphs covered, so the mark is drawn exactly over slanted lines and split columns. */
  readonly quads: readonly Quad[];
  /** The text covered. */
  readonly text: string;
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

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const COLOUR = /^#[0-9a-f]{6}$/;
/** A display name, cut as every name shown from a file is (security.md "Limits": PDF_NAME_MAX_CHARS). */
const AUTHOR_MAX_CHARS = 255;
const OPACITY_MIN = 0.1;
/** A JavaScript date's own range, so a mark's time always writes as a date. */
const TIME_MAX = 8.64e15;

const isQuad = (value: unknown): value is Quad =>
  Array.isArray(value) &&
  value.length === 8 &&
  value.every(
    (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= PDF_MAX_COORDINATE,
  );

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= TIME_MAX;

export type HighlightInput = Omit<Mark, 'kind' | 'modifiedAt'>;

export const Mark = {
  /** A highlight over the quads given, or null when what is given is no highlight. */
  highlight: (input: HighlightInput): Mark | null =>
    Mark.parse({ ...input, kind: 'highlight', modifiedAt: input.createdAt }),

  /**
   * The mark a value holds, or null: every property is checked and bounded, since a mark arrives from other people's
   * browsers and from files (security.md "Abuse cases": a mark with hostile geometry or text).
   */
  parse: (value: unknown): Mark | null => {
    if (typeof value !== 'object' || value === null) return null;
    const v = value as Record<string, unknown>;
    const page = PageName.parse(v.page);
    if (typeof v.id !== 'string' || !ID.test(v.id)) return null;
    if (!MARK_KINDS.includes(v.kind as MarkKind) || !page) return null;
    if (!Array.isArray(v.quads) || v.quads.length === 0 || v.quads.length > PDF_MARK_MAX_QUADS)
      return null;
    if (!v.quads.every(isQuad)) return null;
    if (typeof v.text !== 'string' || typeof v.author !== 'string') return null;
    if (typeof v.colour !== 'string' || !COLOUR.test(v.colour)) return null;
    if (typeof v.opacity !== 'number' || !(v.opacity >= OPACITY_MIN && v.opacity <= 1)) return null;
    if (!isTime(v.createdAt) || !isTime(v.modifiedAt)) return null;
    return {
      id: v.id,
      kind: v.kind as MarkKind,
      page,
      quads: v.quads.map((quad) => [...quad] as unknown as Quad),
      text: v.text.slice(0, PDF_MARK_TEXT_MAX_CHARS),
      colour: v.colour,
      opacity: v.opacity,
      author: v.author.slice(0, AUTHOR_MAX_CHARS),
      createdAt: v.createdAt,
      modifiedAt: v.modifiedAt,
    };
  },

  /** The smallest upright rectangle holding every quad: `[left, bottom, right, top]` in page space. */
  bounds: (mark: Mark): readonly [number, number, number, number] => {
    const xs = mark.quads.flatMap((q) => [q[0], q[2], q[4], q[6]]);
    const ys = mark.quads.flatMap((q) => [q[1], q[3], q[5], q[7]]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  },
} as const;
