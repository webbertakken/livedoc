// Making a Text or a Callout (docs/specs/035-pdf-documents/marks.md "Making a mark"): where the box a press or a drag
// opens lies, how it narrows and grows with what is typed and stays on its page, and the mark written in one change.
// The state names its stored file the first time anything is changed (live-editing-and-storage.md "The layout").
import type * as Y from 'yjs';
import type { BlobKey } from '@livedoc/document';
import {
  Mark,
  PDF_TEXT_BOX_WIDTH_PT,
  PDF_TEXT_PADDING_PT,
  PageView,
  PdfLiveChanges,
  TypedLayout,
  type Box,
  type CalloutLine,
  type PageMatrix,
  type PageName,
  type PagePoint,
  type PdfLimitRefusal,
  type TypedMarkKind,
} from '@livedoc/pdf-documents';
import { DRAWING_LOOK } from './pdf-drawing';
import type { TextMarkLook } from './pdf-text-mark';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';

/** (default) A Text's and a Callout's first look: the Drawing's, strong Red for light paper, opaque. */
export const TYPED_LOOK: TextMarkLook = DRAWING_LOOK;
/** (default) The size a Text's and a Callout's words are set at, in points. */
export const TYPED_SIZE_PT = 12;

/** The faces a Text's words are shown in on screen: Helvetica, or a face drawn to its widths. */
export const TYPED_FACES = 'Helvetica, Arial, "Liberation Sans", sans-serif';

/** Each kind's name in telemetry (marks.md "Telemetry and observability": `Mark.<Kind>`, `Tool.<Name>`). */
export const TYPED_NAMES = {
  text: 'Text',
  callout: 'Callout',
} as const satisfies Readonly<Record<TypedMarkKind, string>>;

/**
 * A box opened for typing, in page space: the corner it hangs from (its top left, or its top right where `fromRight`),
 * how wide it is while typed in, how high at the least, whether it narrows to its words once typed (a press's), and a
 * Callout's point of what is meant.
 */
export type TypedOpening = {
  readonly kind: TypedMarkKind;
  readonly at: PagePoint;
  readonly fromRight: boolean;
  readonly width: number;
  readonly height: number;
  readonly narrows: boolean;
  readonly tip: PagePoint | null;
};

/** The page as the file has it, in page space: the box its view's four corners span, however the view turns it. */
export function pageBoxOf(toView: PageMatrix, shown: { width: number; height: number }): Box {
  const corners = [
    { x: 0, y: 0 },
    { x: shown.width, y: 0 },
    { x: 0, y: shown.height },
    { x: shown.width, y: shown.height },
  ].flatMap((corner) => PageView.toPage(toView, corner) ?? []);
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  // `+ 0`: a corner on an axis may come back as -0.
  return [Math.min(...xs) + 0, Math.min(...ys) + 0, Math.max(...xs) + 0, Math.max(...ys) + 0];
}

/** The narrowest a box is: room for one character at the size and the room inside it. */
const narrowest = (size: number): number => size + 2 * PDF_TEXT_PADDING_PT;

/** The box a press opens: its top left at the press, or its top right where what is meant lies to its right. */
export function openByPress(
  kind: TypedMarkKind,
  at: PagePoint,
  page: Box,
  tip: PagePoint | null = null,
): TypedOpening {
  const [left, , right] = page;
  return {
    kind,
    at,
    fromRight: tip !== null && tip.x > at.x,
    width: Math.min(PDF_TEXT_BOX_WIDTH_PT, right - left),
    height: 0,
    narrows: true,
    tip,
  };
}

/** The box a drag opens: as wide as the drag and at least as high, from its top left. */
export function openByDrag(from: PagePoint, to: PagePoint, size: number): TypedOpening {
  return {
    kind: 'text',
    at: { x: Math.min(from.x, to.x), y: Math.max(from.y, to.y) },
    fromRight: false,
    width: Math.max(narrowest(size), Math.abs(to.x - from.x)),
    height: Math.abs(to.y - from.y),
    narrows: false,
    tip: null,
  };
}

/**
 * The box words are set in: as wide as opened while typed in, or, `typed`, narrowed to its widest line where the box
 * narrows; as high as its lines need and at least as opened; moved onto the page where it would leave it.
 */
export function typedBox(
  opening: TypedOpening,
  words: string,
  size: number,
  page: Box,
  typed: boolean,
): Box {
  const [pageLeft, pageBottom, pageRight, pageTop] = page;
  const lines = TypedLayout.lines(words, size, opening.width);
  const width =
    typed && opening.narrows
      ? Math.max(narrowest(size), Math.min(opening.width, Math.ceil(TypedLayout.width(lines))))
      : opening.width;
  const height = Math.max(opening.height, TypedLayout.height(lines.length, size));
  const fromLeft = opening.fromRight ? opening.at.x - width : opening.at.x;
  const left = Math.max(pageLeft, Math.min(fromLeft, pageRight - width));
  const top = Math.min(pageTop, Math.max(opening.at.y, pageBottom + height));
  return [left, top - height, left + width, top];
}

/** What a typed box makes: its kind, box and words, and a Callout's line from what is meant. */
export type Typed = {
  readonly kind: TypedMarkKind;
  readonly rect: Box;
  readonly words: string;
  readonly size: number;
  readonly callout: CalloutLine | null;
};

/** What an opened box makes once typed in: null where nothing but spaces was typed. */
export function typedOf(
  opening: TypedOpening,
  words: string,
  size: number,
  page: Box,
): Typed | null {
  if (!/\S/.test(words)) return null;
  const rect = typedBox(opening, words, size, page, true);
  const callout =
    opening.kind === 'callout' && opening.tip ? TypedLayout.calloutLine(opening.tip, rect) : null;
  return { kind: opening.kind, rect, words, size, callout };
}

export type TypedMade =
  { ok: true; mark: Mark } | { ok: false; reason: PdfLimitRefusal | 'no_words' };

/** A Text or a Callout made on a page, in the look given, as one change. */
export function addTyped(
  doc: Y.Doc,
  where: { page: PageName; stored: { blob: BlobKey; pages: number } },
  typed: Typed,
  by: { author: string; authorKey?: string | null; now: number; id: string; look: TextMarkLook },
): TypedMade {
  const base = {
    id: by.id,
    page: where.page,
    ...by.look,
    author: by.author,
    ...Mark.keyed(by.authorKey),
    createdAt: by.now,
    rect: typed.rect,
    words: typed.words,
    size: typed.size,
  };
  const mark =
    typed.kind === 'callout' && typed.callout
      ? Mark.callout({ ...base, callout: typed.callout })
      : typed.kind === 'text'
        ? Mark.text(base)
        : null;
  if (!mark) return { ok: false, reason: 'no_words' };
  let refusal: PdfLimitRefusal | null = null;
  doc.transact(() => {
    if (!PdfLiveChanges.stored(doc)) PdfLiveChanges.setStored(doc, where.stored, PDF_LOCAL_ORIGIN);
    refusal = PdfLiveChanges.addMark(doc, mark, PDF_LOCAL_ORIGIN);
  }, PDF_LOCAL_ORIGIN);
  return refusal ? { ok: false, reason: refusal } : { ok: true, mark };
}
