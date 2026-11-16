// Convert to Text (docs/specs/023-draw-mode/ink-to-text.md): the pure parts. Which selected strokes are ink, the box
// they fill, the picture the reader is shown, the text element they become and the one edit that swaps them. Pure.
import {
  freehandCanvasPoints,
  type Element,
  type FreehandElement,
  type TextElement,
} from '@livedoc/document';

type Box = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

/** The picture's polylines, in its own pixels, and how it is drawn. */
export type InkPicture = {
  width: number;
  height: number;
  margin: number;
  lineWidth: number;
  lines: Point[][];
};

const PICTURE_MAX_EDGE = 1024;
const PICTURE_MIN_HEIGHT = 64;
const PICTURE_MARGIN = 16;
const TEXT_SIZE_MIN = 12;
const TEXT_SIZE_MAX = 160;
// Writing's height is its ascenders and descenders; a font's px size is a little under that.
const TEXT_SIZE_OF_LINE = 0.75;

/** The selected pen strokes, in the tab's order; null unless the selection is only unlocked pen strokes. */
export function inkSelection(
  elements: readonly Element[],
  ids: ReadonlySet<string>,
  layerLockedIds: ReadonlySet<string>,
): FreehandElement[] | null {
  if (ids.size === 0) return null;
  const picked = elements.filter((el) => ids.has(el.id));
  if (picked.length !== ids.size) return null;
  const ink = picked.filter(
    (el): el is FreehandElement =>
      el.type === 'freehand' &&
      el.pen !== 'highlighter' &&
      el.locked !== true &&
      !layerLockedIds.has(el.id),
  );
  return ink.length === picked.length ? ink : null;
}

/** The box every stroke of the ink sits in. */
export function inkBox(ink: readonly FreehandElement[]): Box {
  const left = Math.min(...ink.map((s) => s.x));
  const top = Math.min(...ink.map((s) => s.y));
  const right = Math.max(...ink.map((s) => s.x + s.width));
  const bottom = Math.max(...ink.map((s) => s.y + s.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The ink scaled into the reader's picture: longer edge at most 1024 px, height at least 64 px, a margin round it. */
export function inkPolylines(ink: readonly FreehandElement[]): InkPicture {
  const box = inkBox(ink);
  const room = PICTURE_MAX_EDGE - 2 * PICTURE_MARGIN;
  const scale = Math.min(
    room / Math.max(box.width, box.height, 1),
    Math.max(1, (PICTURE_MIN_HEIGHT - 2 * PICTURE_MARGIN) / Math.max(box.height, 1)),
  );
  const width = Math.round(box.width * scale) + 2 * PICTURE_MARGIN;
  const height = Math.max(PICTURE_MIN_HEIGHT, Math.round(box.height * scale) + 2 * PICTURE_MARGIN);
  const lines = ink.map((s) =>
    freehandCanvasPoints(s).map((p) => ({
      x: PICTURE_MARGIN + (p.x - box.x) * scale,
      y: PICTURE_MARGIN + (p.y - box.y) * scale,
    })),
  );
  return {
    width: Math.min(width, PICTURE_MAX_EDGE),
    height,
    margin: PICTURE_MARGIN,
    lineWidth: Math.max(2, 3 * Math.min(scale, 2)),
    lines,
  };
}

/** The text's px size for writing this tall over this many lines. */
export function inkTextSize(inkHeight: number, lineCount: number): number {
  const size = Math.round((inkHeight / Math.max(1, lineCount)) * TEXT_SIZE_OF_LINE);
  return Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, size));
}

/** The text element the ink becomes: its words in the ink's box, in Caveat, at the writing's size and colour. */
export function inkTextElement(
  ink: readonly FreehandElement[],
  words: string,
  id: string,
): TextElement {
  const box = inkBox(ink);
  const first = ink[0]!;
  return {
    id,
    type: 'text',
    ...box,
    label: words,
    font: 'caveat',
    textAlignX: 'left',
    textSize: inkTextSize(box.height, words.split('\n').length),
    ...(first.layerId ? { layerId: first.layerId } : {}),
    ...(first.strokeColor
      ? { textColor: first.strokeColor }
      : first.penColour
        ? { penTextColour: first.penColour }
        : {}),
  };
}

/** The one edit: the strokes out, the text at the first stroke's place in the stacking order. */
export function replaceInk(
  elements: readonly Element[],
  strokeIds: ReadonlySet<string>,
  text: TextElement,
): Element[] {
  const at = elements.findIndex((el) => strokeIds.has(el.id));
  const out = elements.filter((el) => !strokeIds.has(el.id));
  out.splice(at, 0, text);
  return out;
}
