// Making a Drawing (docs/specs/035-pdf-documents/marks.md "Making a mark": A Drawing): a stroke's points as the pointer
// passes, the close ones let go; a stroke ended, written as a new Drawing or joined to the last one made on its page
// within PDF_DRAWING_JOIN_MS, as one change. The state names its stored file the first time anything is changed
// (live-editing-and-storage.md "The layout").
import type * as Y from 'yjs';
import { standardColours, type BlobKey } from '@livedoc/document';
import {
  Mark,
  PDF_DRAWING_JOIN_MS,
  PDF_DRAWING_MAX_POINTS,
  PDF_DRAWING_STEP_PT,
  PdfChange,
  PdfLiveChanges,
  type DrawingMark,
  type PagePoint,
  type PageName,
  type PdfLimitRefusal,
  type Stroke,
} from '@livedoc/pdf-documents';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';
import type { TextMarkLook } from './pdf-text-mark';
import type { ToolLook } from './pdf-tool-look';

/** (default) A Drawing's first look: the colour picker's strong Red for light paper, at full opacity. */
export const DRAWING_LOOK: TextMarkLook = {
  colour: standardColours('strong', 'light').find((colour) => colour.name === 'red')!.hex,
  opacity: 1,
};
/** (default) A Drawing's line, in points. */
export const DRAWING_WIDTH_PT = 2;

/** A stroke with the point added, or the stroke as it was where the point is within a step of its last. */
export function extendStroke(stroke: Stroke, { x, y }: PagePoint): Stroke {
  const at = stroke.length;
  if (at >= 2 && Math.hypot(x - stroke[at - 2]!, y - stroke[at - 1]!) < PDF_DRAWING_STEP_PT)
    return stroke;
  return [...stroke, x, y];
}

/** The Drawing a stroke may join: the last made here, on its page, its stroke ended when. */
export type LastDrawing = {
  readonly id: string;
  readonly page: PageName;
  readonly endedAt: number;
};

export type DrawingMade =
  | { ok: true; mark: DrawingMark; joined: boolean }
  | { ok: false; reason: PdfLimitRefusal | 'no_stroke' };

/** The Drawing a stroke joins, where it may: the same page, soon enough, still there, with room for its points. */
function joinable(
  doc: Y.Doc,
  page: PageName,
  stroke: Stroke,
  last: LastDrawing | null,
  begunAt: number,
): DrawingMark | null {
  if (!last || last.page !== page || begunAt - last.endedAt > PDF_DRAWING_JOIN_MS) return null;
  const mark = PdfLiveChanges.marks(doc).find((made) => made.id === last.id);
  if (!mark || mark.kind !== 'drawing') return null;
  return Mark.points(mark) + stroke.length / 2 <= PDF_DRAWING_MAX_POINTS ? mark : null;
}

export function addStroke(
  doc: Y.Doc,
  where: { page: PageName; stored: { blob: BlobKey; pages: number } },
  stroke: Stroke,
  by: {
    author: string;
    now: number;
    // When the stroke began: within PDF_DRAWING_JOIN_MS of the last one's end, it joins it.
    begunAt: number;
    id: string;
    look: ToolLook;
    last: LastDrawing | null;
  },
): DrawingMade {
  if (stroke.length < 2) return { ok: false, reason: 'no_stroke' };
  const onto = joinable(doc, where.page, stroke, by.last, by.begunAt);
  const mark = onto
    ? Mark.parse({ ...onto, strokes: [...onto.strokes, stroke], modifiedAt: by.now })
    : Mark.drawing({
        id: by.id,
        page: where.page,
        strokes: [stroke],
        width: DRAWING_WIDTH_PT,
        ...by.look,
        author: by.author,
        createdAt: by.now,
      });
  if (!mark || mark.kind !== 'drawing') return { ok: false, reason: 'no_stroke' };
  let refusal: PdfLimitRefusal | null = null;
  doc.transact(() => {
    if (!PdfLiveChanges.stored(doc)) PdfLiveChanges.setStored(doc, where.stored, PDF_LOCAL_ORIGIN);
    if (onto) {
      const change = PdfChange.changeMark(mark.id, {
        strokes: mark.strokes,
        modifiedAt: mark.modifiedAt,
      });
      PdfChange.apply(doc, change, PDF_LOCAL_ORIGIN);
    } else refusal = PdfLiveChanges.addMark(doc, mark, PDF_LOCAL_ORIGIN);
  }, PDF_LOCAL_ORIGIN);
  return refusal ? { ok: false, reason: refusal } : { ok: true, mark, joined: onto !== null };
}
