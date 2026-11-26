// A Drawing's stroke as it is drawn, on the wire (docs/specs/035-pdf-documents/live-editing-and-storage.md "A mark as
// it is made"): the page, the stroke's own id, its look, how many of its points came before and the new ones since;
// or its end. Presence: relayed unordered, never logged, stored or replayed. A peer's op is checked field by field
// before anyone draws it. The look's ranges are a Drawing's own (marks.md); the app's guard holds the line styles and
// the coordinate bound to `@livedoc/pdf-documents`, which this package does not import.

/** (default) Points in one op: about 15 s of a stroke at the cursor's rate, if the relay stalled. */
export const PDF_DRAFT_MAX_POINTS = 512;
/** (default) One op as it was sent: 512 points at 30 characters each, with the op's names. */
export const PDF_DRAFT_MAX_CHARS = 16_384;

/** A Drawing's dashed line styles; a solid line names none. */
export const PDF_DRAFT_LINE_STYLES = ['dashed', 'dotted', 'dash-dot', 'long-dashes'] as const;
/** How far from the page's origin a point may be, in points: a page's own bound (PDF_MAX_COORDINATE). */
export const PDF_DRAFT_COORDINATE_BOUND = 28_800;

export type PdfDraftLook = {
  colour: string;
  opacity: number;
  width: number;
  lineStyle?: (typeof PDF_DRAFT_LINE_STYLES)[number];
};

export type PdfDraft =
  | {
      tabId: string;
      page: string;
      stroke: string;
      look: PdfDraftLook;
      from: number;
      points: number[];
    }
  | { tabId: string; stroke: string; points: null };

const PAGE = /^[A-Za-z0-9.:{}_-]{1,80}$/;
const STROKE = /^[A-Za-z0-9_-]{1,64}$/;
const COLOUR = /^#[0-9a-f]{6}$/;
const OPACITY_MIN = 0.1;
const WIDTH_MAX = 72;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseLook(o: Record<string, unknown>): PdfDraftLook | null {
  const { colour, opacity, width, lineStyle } = o;
  if (typeof colour !== 'string' || !COLOUR.test(colour)) return null;
  if (!finite(opacity) || opacity < OPACITY_MIN || opacity > 1) return null;
  if (!finite(width) || width <= 0 || width > WIDTH_MAX) return null;
  if (lineStyle === undefined) return { colour, opacity, width };
  const style = PDF_DRAFT_LINE_STYLES.find((known) => known === lineStyle);
  return style ? { colour, opacity, width, lineStyle: style } : null;
}

function parsePoints(points: unknown): number[] | null {
  if (!Array.isArray(points) || points.length === 0 || points.length % 2 !== 0) return null;
  if (points.length > PDF_DRAFT_MAX_POINTS * 2) return null;
  return points.every((n) => finite(n) && Math.abs(n) <= PDF_DRAFT_COORDINATE_BOUND)
    ? (points as number[])
    : null;
}

/** The stroke a `pdf-draft` op carries, or null when it is malformed or passes PDF_DRAFT_MAX_CHARS. */
export function parsePdfDraft(op: unknown): PdfDraft | null {
  if (typeof op !== 'object' || op === null) return null;
  const o = op as Record<string, unknown>;
  if (typeof o.tabId !== 'string' || o.tabId.length === 0) return null;
  if (typeof o.stroke !== 'string' || !STROKE.test(o.stroke)) return null;
  if (JSON.stringify(op).length > PDF_DRAFT_MAX_CHARS) return null;
  if (o.points === null) return { tabId: o.tabId, stroke: o.stroke, points: null };
  if (typeof o.page !== 'string' || !PAGE.test(o.page)) return null;
  if (!Number.isSafeInteger(o.from) || (o.from as number) < 0) return null;
  const look = parseLook(o);
  const points = parsePoints(o.points);
  if (!look || !points) return null;
  return { tabId: o.tabId, page: o.page, stroke: o.stroke, look, from: o.from as number, points };
}
