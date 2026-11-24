// Selecting a page's text (docs/specs/035-pdf-documents/reading-surface.md "The pages": Selecting text, Copy): caret
// places between the characters of a page's text, the spans a press, a word, a line, a page or a column select, the
// rectangles a selection is drawn with, and the text it copies. Pure: it reads a `PageText`, never the file.
//
// The reader writes its own characters into the text: a space between words and a `\r\n` at a line's end, each with
// a box of no size, and `\u0002` for a word it saw broken by a hyphen at a line's end, with no break after it.
import type { PagePoint } from './engine-contract';
import type { Quad } from './mark';
import { PDF_TREE_MAX_NODES_A_PAGE } from './limits';
import { PageText, type TextBox } from './page-text';

/** A run of the text, `[start, end)` in units of `PageText.text`. */
export type TextSpan = readonly [start: number, end: number];

/** The reader's mark of a word broken by a hyphen at a line's end. */
const BROKEN_WORD = '\u0002';
const isBreak = (unit: string | undefined): boolean => unit === '\r' || unit === '\n';
// A word's units: letters, marks, digits, either half of a character past the first plane, and the broken-word mark.
const LETTER_OR_DIGIT = /[\p{L}\p{M}\p{N}\uD800-\uDFFF]/u;
const inWord = (unit: string): boolean => unit === BROKEN_WORD || LETTER_OR_DIGIT.test(unit);

// How far a point beside a line weighs against one along it: a line is picked before a character on it.
const ACROSS_WEIGHT = 1_000;
// A break to the next line is a space when that line starts within this many line heights below (reading-surface.md).
const PARAGRAPH_LINE_HEIGHTS = 2;
// A line runs on in a column within this many line heights of its left and of a line of it.
const COLUMN_LINE_HEIGHTS = 2;
// A full line ends within this many line heights of the furthest right of it and the lines either side of it.
const FULL_LINE_HEIGHTS = 2;

/** Whether a character's box has a size: the reader's own characters have none. */
const drawn = (box: TextBox): boolean => box.right > box.left || box.top > box.bottom;

const boxOf = (page: PageText, index: number): TextBox | null => {
  const box = PageText.boxAt(page, index);
  return box && drawn(box) ? box : null;
};

const outside = (value: number, low: number, high: number): number =>
  value < low ? low - value : value > high ? value - high : 0;

const union = (a: TextBox | null, b: TextBox): TextBox =>
  a
    ? {
        left: Math.min(a.left, b.left),
        bottom: Math.min(a.bottom, b.bottom),
        right: Math.max(a.right, b.right),
        top: Math.max(a.top, b.top),
      }
    : b;

const overlapsVertically = (a: TextBox, b: TextBox): boolean =>
  a.bottom < b.top && b.bottom < a.top;

const quadOf = ({ left, bottom, right, top }: TextBox): Quad => [
  left,
  top,
  right,
  top,
  left,
  bottom,
  right,
  bottom,
];

/** One line of a span: where it starts, its text and the box of its drawn characters (null where it has none). */
type SpanLine = { start: number; text: string; box: TextBox | null };

function linesOf(page: PageText, [start, end]: TextSpan): SpanLine[] {
  const lines: SpanLine[] = [{ start, text: '', box: null }];
  for (let at = start; at < end; at += 1) {
    const unit = page.text[at]!;
    const line = lines[lines.length - 1]!;
    if (isBreak(unit)) {
      // A `\r\n` is one break: a new line starts once, at its first unit.
      if (!(unit === '\n' && page.text[at - 1] === '\r' && at > start))
        lines.push({ start: at + 1, text: '', box: null });
      continue;
    }
    line.text += unit;
    const box = boxOf(page, at);
    if (box) line.box = union(line.box, box);
  }
  return lines;
}

// What joins a line to the next in copied text: nothing inside one line, a space inside a paragraph, else a break.
function joint(before: SpanLine, after: SpanLine, rightEnd: number): string {
  const [a, b] = [before.box, after.box];
  if (!a || !b) return '\n';
  if (overlapsVertically(a, b)) return '';
  const height = Math.max(a.top - a.bottom, b.top - b.bottom);
  const drop = a.bottom - b.bottom;
  const near = drop > 0 && drop <= PARAGRAPH_LINE_HEIGHTS * height;
  const full = a.right >= rightEnd - FULL_LINE_HEIGHTS * height;
  return near && full ? ' ' : '\n';
}

const heightOf = (box: TextBox): number => box.top - box.bottom;

// How far apart two lines are down the page: nothing where they overlap.
const gapBetween = (a: TextBox, b: TextBox): number =>
  Math.max(0, a.bottom - b.top, b.bottom - a.top);

// The column around a line (reading-surface.md "Phone and tablet"): the lines that start within two line heights of
// its left and lie within two line heights of a line of it; its left the least, its right the larger middle right.
function columnFrom(seed: TextBox, lines: readonly TextBox[]): TextBox {
  const joined = [seed];
  let edge = seed.left;
  let waiting = lines.filter((line) => line !== seed);
  for (let grew = true; grew;) {
    grew = false;
    for (const line of waiting) {
      const reach = COLUMN_LINE_HEIGHTS * Math.max(heightOf(line), heightOf(seed));
      const starts = Math.abs(line.left - edge) <= reach;
      if (!starts || !joined.some((near) => gapBetween(near, line) <= reach)) continue;
      joined.push(line);
      edge = Math.min(edge, line.left);
      grew = true;
    }
    waiting = waiting.filter((line) => !joined.includes(line));
  }
  const rights = joined.map((line) => line.right).sort((a, b) => a - b);
  return {
    left: edge,
    right: rights[Math.floor(rights.length / 2)]!,
    bottom: Math.min(...joined.map((line) => line.bottom)),
    top: Math.max(...joined.map((line) => line.top)),
  };
}

function copiedSpan(page: PageText, span: TextSpan): string {
  const lines = linesOf(page, span);
  const rightOf = (at: number) => lines[at]?.box?.right ?? -Infinity;
  return lines
    .map(
      (line, at) =>
        line.text.replaceAll(BROKEN_WORD, '') +
        (at < lines.length - 1
          ? joint(line, lines[at + 1]!, Math.max(rightOf(at - 1), rightOf(at), rightOf(at + 1)))
          : ''),
    )
    .join('');
}

export const TextRange = {
  /**
   * The caret place nearest a point of the page: before or after the nearest drawn character by its middle, a
   * character on a line beside the point picked before any other. Null where the page has no drawn character.
   */
  caretAt: (page: PageText, point: PagePoint): number | null => {
    const nearest = TextRange.nearest(page, point);
    if (nearest === null) return null;
    const box = boxOf(page, nearest)!;
    return point.x < (box.left + box.right) / 2 ? nearest : nearest + 1;
  },
  /** The drawn character nearest a point, one on a line beside the point first; null where the page has none. */
  nearest: (page: PageText, { x, y }: PagePoint): number | null => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    let best = -1;
    let bestScore = Infinity;
    for (let at = 0; at < page.text.length; at += 1) {
      const box = boxOf(page, at);
      if (!box) continue;
      const score =
        outside(y, box.bottom, box.top) * ACROSS_WEIGHT + outside(x, box.left, box.right);
      if (score < bestScore) [best, bestScore] = [at, score];
    }
    return best < 0 ? null : best;
  },
  /** The span between two caret places, whichever way they were dragged. */
  between: (a: number, b: number): TextSpan => [Math.min(a, b), Math.max(a, b)],
  /** The word around the unit at `index`: a run of word units, or the unit alone where it is none. */
  word: (page: PageText, index: number): TextSpan => {
    const { text } = page;
    if (index < 0 || index >= text.length) return [index, index];
    if (!inWord(text[index]!)) return [index, index + 1];
    let [start, end] = [index, index + 1];
    while (start > 0 && inWord(text[start - 1]!)) start -= 1;
    while (end < text.length && inWord(text[end]!)) end += 1;
    return [start, end];
  },
  /** The file's line around the unit at `index`: between two of its breaks. */
  line: (page: PageText, index: number): TextSpan => {
    const { text } = page;
    let [start, end] = [index, index];
    while (start > 0 && !isBreak(text[start - 1])) start -= 1;
    while (end < text.length && !isBreak(text[end])) end += 1;
    return [start, end];
  },
  /** Every unit of the page's text. */
  all: (page: PageText): TextSpan => [0, page.text.length],
  /** The drawn characters whose middles lie in the rectangle of two points, a span for each run of them. */
  column: (page: PageText, from: PagePoint, to: PagePoint): readonly TextSpan[] => {
    const [left, right] = [Math.min(from.x, to.x), Math.max(from.x, to.x)];
    const [bottom, top] = [Math.min(from.y, to.y), Math.max(from.y, to.y)];
    const spans: [number, number][] = [];
    for (let at = 0; at < page.text.length; at += 1) {
      const box = PageText.boxAt(page, at)!;
      const [x, y] = [(box.left + box.right) / 2, (box.bottom + box.top) / 2];
      const inside = x >= left && x <= right && y >= bottom && y <= top;
      if (!inside || isBreak(page.text[at])) continue;
      const last = spans[spans.length - 1];
      if (last && last[1] === at) last[1] = at + 1;
      else spans.push([at, at + 1]);
    }
    return spans;
  },
  /**
   * The box of the column under a point (reading-surface.md "Phone and tablet"): the line holding the drawn character
   * nearest it, the point within a line height of that line, and the lines that run on from it. Null where none is.
   */
  columnAt: (page: PageText, point: PagePoint): TextBox | null => {
    const nearest = TextRange.nearest(page, point);
    if (nearest === null) return null;
    const lines = linesOf(page, TextRange.all(page));
    const seed = lines.findLast((line) => line.start <= nearest)!.box!;
    const height = heightOf(seed);
    const off = Math.max(
      outside(point.x, seed.left, seed.right),
      outside(point.y, seed.bottom, seed.top),
    );
    if (off > height) return null;
    const boxes = lines.flatMap((line) => (line.box ? [line.box] : []));
    return columnFrom(seed, boxes);
  },
  /** The rectangles the spans are drawn with: one a line, a new one where a character leaves the line's height. */
  quads: (page: PageText, spans: readonly TextSpan[]): Quad[] => {
    const quads: Quad[] = [];
    for (const [start, end] of spans) {
      let rect: TextBox | null = null;
      for (let at = start; at < end; at += 1) {
        const box = boxOf(page, at);
        if (isBreak(page.text[at]) || (box && rect && !overlapsVertically(rect, box))) {
          if (rect) quads.push(quadOf(rect));
          rect = null;
        }
        if (box) rect = union(rect, box);
      }
      if (rect) quads.push(quadOf(rect));
    }
    return quads;
  },
  /** The plain text the spans copy, lines joined where the file broke them inside a paragraph, spans by a break. */
  /**
   * The page's text as paragraphs, joined exactly as Copy joins the whole page, none empty; past `most` the rest joins
   * the last (accessibility.md "The accessible tree").
   */
  paragraphs: (page: PageText, most = PDF_TREE_MAX_NODES_A_PAGE): string[] => {
    const parts = TextRange.copied(page, [TextRange.all(page)])
      .split('\n')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    return parts.length <= most
      ? parts
      : [...parts.slice(0, most - 1), parts.slice(most - 1).join(' ')];
  },
  copied: (page: PageText, spans: readonly TextSpan[]): string =>
    spans.map((span) => copiedSpan(page, span)).join('\n'),
} as const;
