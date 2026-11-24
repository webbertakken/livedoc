// Placing a picture from Image options (docs/specs/034-text-documents/objects.md "In the editor", Text wrapping and
// Position): the wrap chosen, its margin, whether it moves with its text or stays on the page, and its offsets. Each
// gives the placement to write, keeping the picture where it is drawn; null where what keeps it there is not known.
// Pure; lengths in points.
import {
  PICTURE_MARGIN_MAX,
  PICTURE_OFFSET_MAX,
  PICTURE_WRAP_MARGIN,
  PicturePlacements,
  type PictureMoves,
  type PicturePlacement,
  type PictureWrap,
} from '@livedoc/text-documents';

/** A Text wrapping choice: in line, or one of the placed wraps. */
export type PictureWrapChoice = 'inline' | PictureWrap;

/** The Text wrapping choices, in Google's order. */
export const PICTURE_WRAP_CHOICES: readonly { id: PictureWrapChoice; label: string }[] = [
  { id: 'inline', label: 'In line' },
  { id: 'wrap', label: 'Wrap text' },
  { id: 'break', label: 'Break text' },
  { id: 'behind', label: 'Behind text' },
  { id: 'front', label: 'In front of text' },
];

/** A point from a picture's paragraph (or a paragraph's from its page): x across, y down. */
export type PlacingPoint = { readonly x: number; readonly y: number };

const round3 = (n: number) => Math.round(n * 1000) / 1000 + 0;
const clamp = (n: number, low: number, high: number) => round3(Math.min(high, Math.max(low, n)));
const within = (n: number) => clamp(n, -PICTURE_OFFSET_MAX, PICTURE_OFFSET_MAX);
const holdsText = (wrap: PictureWrap) => wrap === 'wrap' || wrap === 'break';

export const wrapChoiceOf = (placement: PicturePlacement | undefined): PictureWrapChoice =>
  placement?.wrap ?? 'inline';

/**
 * The placement a wrap choice writes: none for in line; from in line, its spot in its paragraph (null where not
 * measured), moving with text; Wrap and Break set ⅛ in coming from in line, behind or in front, and keep it between
 * them; Behind and In front keep the margin it had (none from in line).
 */
export function wrapped(
  current: PicturePlacement | undefined,
  choice: PictureWrapChoice,
  spot: PlacingPoint | null,
): PicturePlacement | undefined | null {
  if (choice === 'inline') return undefined;
  const margin = (had: number) =>
    PicturePlacements.margin(holdsText(choice) ? PICTURE_WRAP_MARGIN : had);
  if (!current) {
    if (!spot) return null;
    return {
      wrap: choice,
      margin: margin(0),
      moves: 'with-text',
      x: within(spot.x),
      y: within(spot.y),
    };
  }
  const keeps = !holdsText(choice) || holdsText(current.wrap);
  return { ...current, wrap: choice, margin: keeps ? current.margin : margin(0) };
}

/** One margin on every side, within an inch. */
export const withMargin = (current: PicturePlacement, pt: number): PicturePlacement => ({
  ...current,
  margin: PicturePlacements.margin(clamp(pt, 0, PICTURE_MARGIN_MAX)),
});

/** Its one margin, or null where its sides differ (a file's). */
export function evenMargin(placement: PicturePlacement): number | null {
  const { top, right, bottom, left } = placement.margin;
  return top === right && right === bottom && bottom === left ? top : null;
}

/**
 * Moving with text or fixed on the page, standing where it is drawn: its paragraph's top left from its page's, which
 * a switch needs (null where not measured).
 */
export function moved(
  current: PicturePlacement,
  moves: PictureMoves,
  paragraph: PlacingPoint | null,
): PicturePlacement | null {
  if (moves === current.moves) return current;
  if (!paragraph) return null;
  const sign = moves === 'page' ? 1 : -1;
  return {
    ...current,
    moves,
    x: within(current.x + sign * paragraph.x),
    y: within(current.y + sign * paragraph.y),
  };
}

/** An offset typed, within 22 inches either way. */
export const offset = (
  current: PicturePlacement,
  axis: 'x' | 'y',
  pt: number,
): PicturePlacement => ({
  ...current,
  [axis]: within(pt),
});

/**
 * Where a dragged picture's left edge snaps (objects.md "Guides"): its left edge, centre or right edge to its column's
 * left edge, centre or right edge, the nearest within `tolerance`, and the column's line it snapped to; as it is, and
 * no line, where none is near. Points across its column.
 */
export function snapAcross(
  left: number,
  width: number,
  columnWidth: number,
  tolerance: number,
): { left: number; guide: number | null } {
  let best: { shift: number; guide: number } | null = null;
  for (const edge of [0, width / 2, width])
    for (const line of [0, columnWidth / 2, columnWidth]) {
      const shift = line - (left + edge);
      if (Math.abs(shift) <= tolerance && (!best || Math.abs(shift) < Math.abs(best.shift)))
        best = { shift, guide: line };
    }
  return best ? { left: round3(left + best.shift), guide: best.guide } : { left, guide: null };
}

/** Moved by a drag, across and down, within 22 inches either way. */
export const shifted = (
  current: PicturePlacement,
  by: { readonly dx: number; readonly dy: number },
): PicturePlacement => ({
  ...current,
  x: within(current.x + by.dx),
  y: within(current.y + by.dy),
});
