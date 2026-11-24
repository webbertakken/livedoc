// A mark's appearance stream (docs/specs/035-pdf-documents/marks.md "In the file"): what the page shows of it, as
// MarkDrawing says, in the operators of a PDF's content, so every reader draws exactly what was made. Pure: the bake
// wraps it in a stream with its box and, where the opacity is under 1, a graphics state of that name.
import type { Box } from '../mark';
import type { MarkDrawing } from '../mark-drawing';

/** The graphics state an appearance draws through where its opacity is under 1. */
export const APPEARANCE_STATE = 'LDa';

export type Appearance = {
  /** The content stream's operators. */
  readonly content: string;
  /** What the content covers in page space, every line whole: the stream's `BBox` and the mark's `Rect`. */
  readonly box: Box;
  /** The opacity the graphics state carries; null where the mark is opaque. */
  readonly opacity: number | null;
};

/**
 * A colour channel as the file holds it, a fraction: the middle of its byte's step, so a reader that cuts the fraction
 * back to a byte (PDFium does) reads the byte it was, and the colour comes back as it was made.
 */
export const channelOf = (colour: string, at: number): number =>
  Math.min(1, (parseInt(colour.slice(at, at + 2), 16) + 0.5) / 255);

// A number as the content writes it: a few places, no exponent (a PDF number has none), no trailing zeros.
const num = (n: number, places = 2): string => String(+n.toFixed(places));

const rgbOf = (colour: string): string =>
  [1, 3, 5].map((at) => num(channelOf(colour, at), 3)).join(' ');

const path = (points: MarkDrawing['fills'][number]): string =>
  points.map(({ x, y }, at) => `${num(x)} ${num(y)} ${at === 0 ? 'm' : 'l'}`).join(' ');

export function appearanceOf(
  { fills, strokes }: MarkDrawing,
  look: { readonly colour: string; readonly opacity: number },
): Appearance {
  const colour = rgbOf(look.colour);
  const opacity = look.opacity < 1 ? look.opacity : null;
  const lines = ['q'];
  if (opacity !== null) lines.push(`/${APPEARANCE_STATE} gs`);
  if (fills.length > 0) lines.push(`${colour} rg`, ...fills.map((points) => `${path(points)} h f`));
  if (strokes.length > 0) lines.push(`${colour} RG`);
  for (const stroke of strokes) {
    const ends = stroke.round ? 1 : 0;
    lines.push(`${num(stroke.width)} w ${ends} J ${ends} j`);
    lines.push(`${path(stroke.points)}${stroke.closed ? ' h' : ''} S`);
  }
  lines.push('Q');
  const all = [...fills.flat(), ...strokes.flatMap((stroke) => stroke.points)];
  const grow = Math.max(0, ...strokes.map((stroke) => stroke.width));
  const xs = all.map((point) => point.x);
  const ys = all.map((point) => point.y);
  return {
    content: lines.join('\n'),
    box: [
      Math.min(...xs) - grow,
      Math.min(...ys) - grow,
      Math.max(...xs) + grow,
      Math.max(...ys) + grow,
    ],
    opacity,
  };
}
