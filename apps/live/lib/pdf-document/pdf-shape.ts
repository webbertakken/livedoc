// Making a Line, an Arrow, a Rectangle or an Ellipse (docs/specs/035-pdf-documents/marks.md "Making a mark"): a drag's
// end held to the page, and square with ⇧ for a box; the two ends as the mark's geometry in page space, nothing for a
// press; the mark written in one change. The state names its stored file the first time anything is changed
// (live-editing-and-storage.md "The layout").
import type * as Y from 'yjs';
import type { BlobKey } from '@livedoc/document';
import {
  Mark,
  PDF_SHAPE_MIN_PT,
  PdfLiveChanges,
  type BoxShape,
  type LineShape,
  type PageName,
  type PagePoint,
  type PdfLimitRefusal,
} from '@livedoc/pdf-documents';
import { DRAWING_LOOK, DRAWING_WIDTH_PT } from './pdf-drawing';
import type { ShapeToolKind } from './pdf-shape-pick';
import type { TextMarkLook } from './pdf-text-mark';
import type { ToolLook } from './pdf-tool-look';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';

/** (default) A line's and a shape's first look: the Drawing's, strong Red for light paper, opaque. */
export const SHAPE_LOOK: TextMarkLook = DRAWING_LOOK;
/** (default) A line's and a shape's width, in points: the Drawing's. */
export const SHAPE_WIDTH_PT = DRAWING_WIDTH_PT;

/** Each kind's name in telemetry (marks.md "Telemetry and observability": `Mark.<Kind>`, `Tool.<Name>`). */
export const SHAPE_NAMES = {
  line: 'Line',
  arrow: 'Arrow',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
} as const satisfies Readonly<Record<ShapeToolKind, string>>;

/** The page's box on screen. */
export type ScreenBox = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

/** An element's box on screen; null before it is laid out. */
export function screenBoxOf(element: HTMLElement | null): ScreenBox | null {
  const rect = element?.getBoundingClientRect();
  return rect
    ? {
        left: rect.left,
        top: rect.top,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
      }
    : null;
}

/** The shapes a drag spans as a box, which ⇧ keeps square or round. */
const isBox = (kind: ShapeToolKind): boolean => kind === 'rectangle' || kind === 'ellipse';

const within = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n));

/**
 * Where a drag from `from` ends, on screen: the pointer held to the page's box, so a mark never leaves its page; with
 * `square`, a Rectangle's or an Ellipse's far corner as far both ways, the longer of the drag's two, as far as the page
 * leaves room.
 */
export function dragShape(
  kind: ShapeToolKind,
  from: { x: number; y: number },
  to: { x: number; y: number },
  box: ScreenBox,
  square: boolean,
): { x: number; y: number } {
  if (!square || !isBox(kind))
    return { x: within(to.x, box.left, box.right), y: within(to.y, box.top, box.bottom) };
  const right = to.x >= from.x;
  const down = to.y >= from.y;
  const side = Math.min(
    Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)),
    right ? box.right - from.x : from.x - box.left,
    down ? box.bottom - from.y : from.y - box.top,
  );
  return { x: from.x + (right ? side : -side), y: from.y + (down ? side : -side) };
}

/** What a drag from `from` to `to` in page space draws with a tool; null for a press, too small to be a mark. */
export function shapeOf(
  kind: ShapeToolKind,
  from: PagePoint,
  to: PagePoint,
  width: number,
): LineShape | BoxShape | null {
  const wide = Math.abs(to.x - from.x);
  const high = Math.abs(to.y - from.y);
  if (kind === 'line' || kind === 'arrow')
    return Math.hypot(wide, high) < PDF_SHAPE_MIN_PT
      ? null
      : { kind, line: [from.x, from.y, to.x, to.y], width };
  if (wide < PDF_SHAPE_MIN_PT && high < PDF_SHAPE_MIN_PT) return null;
  const rect = [
    Math.min(from.x, to.x),
    Math.min(from.y, to.y),
    Math.max(from.x, to.x),
    Math.max(from.y, to.y),
  ] as const;
  return { kind, rect, width };
}

export type ShapeMade =
  { ok: true; mark: Mark } | { ok: false; reason: PdfLimitRefusal | 'no_shape' };

/** A line or shape made on a page, in the look given, as one change. */
export function addShape(
  doc: Y.Doc,
  where: { page: PageName; stored: { blob: BlobKey; pages: number } },
  shape: LineShape | BoxShape | null,
  by: { author: string; now: number; id: string; look: ToolLook },
): ShapeMade {
  const base = { id: by.id, page: where.page, ...by.look, author: by.author, createdAt: by.now };
  const mark = !shape
    ? null
    : 'line' in shape
      ? Mark.line(shape.kind, { ...base, line: shape.line, width: shape.width })
      : Mark.shape(shape.kind, { ...base, rect: shape.rect, width: shape.width });
  if (!mark) return { ok: false, reason: 'no_shape' };
  let refusal: PdfLimitRefusal | null = null;
  doc.transact(() => {
    if (!PdfLiveChanges.stored(doc)) PdfLiveChanges.setStored(doc, where.stored, PDF_LOCAL_ORIGIN);
    refusal = PdfLiveChanges.addMark(doc, mark, PDF_LOCAL_ORIGIN);
  }, PDF_LOCAL_ORIGIN);
  return refusal ? { ok: false, reason: refusal } : { ok: true, mark };
}
