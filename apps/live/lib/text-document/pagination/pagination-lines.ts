// A block's lines from its measured rectangles (docs/specs/034-text-documents/page-layout.md "A page fills"): the
// browser gives a rectangle for each piece of text on each line; the rectangles that overlap make one line, and the
// lines touch, each boundary halfway between one line's text and the next's. Pure; positions in any one unit.
import type { LineBox } from './pagination';

/** A vertical extent. */
export type Span = { readonly top: number; readonly bottom: number };

// Two rectangles on one line overlap by at least half the shorter one's height.
const SAME_LINE_OVERLAP = 0.5;

/** The lines the rectangles make, from the content box's top to its bottom; an empty block is one line. */
export function groupLines(rects: readonly Span[], top: number, bottom: number): LineBox[] {
  const sorted = rects.filter((r) => r.bottom > r.top).sort((a, b) => a.top - b.top);
  const lines: { top: number; bottom: number }[] = [];
  for (const r of sorted) {
    const line = lines[lines.length - 1];
    const overlap = line ? Math.min(line.bottom, r.bottom) - Math.max(line.top, r.top) : -1;
    const shorter = line ? Math.min(line.bottom - line.top, r.bottom - r.top) : 0;
    if (line && overlap >= shorter * SAME_LINE_OVERLAP) {
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
    } else lines.push({ top: r.top, bottom: r.bottom });
  }
  if (lines.length === 0) return [{ top, bottom }];
  return lines.map((line, k) => ({
    top: k === 0 ? top : (lines[k - 1]!.bottom + line.top) / 2,
    bottom: k === lines.length - 1 ? bottom : (line.bottom + lines[k + 1]!.top) / 2,
  }));
}

/** Where `y` would be without the spacers above it (a point inside a spacer is at its top). */
export function naturalOf(y: number, spacers: readonly Span[]): number {
  let above = 0;
  for (const s of spacers) {
    if (s.bottom <= y) above += s.bottom - s.top;
    else if (s.top < y) return s.top - above;
  }
  return y - above;
}

/** The rectangles with what lies inside a spacer left out and the spacers closed up. */
export function withoutSpacers(rects: readonly Span[], spacers: readonly Span[]): Span[] {
  const inside = (r: Span) =>
    spacers.some((s) => r.top >= s.top - 0.5 && r.bottom <= s.bottom + 0.5);
  return rects
    .filter((r) => !inside(r))
    .map((r) => ({ top: naturalOf(r.top, spacers), bottom: naturalOf(r.bottom, spacers) }));
}
