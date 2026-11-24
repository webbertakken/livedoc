// A mark's appearance stream (docs/specs/035-pdf-documents/marks.md "In the file"): what the page shows of it, as
// MarkDrawing says, and a Text's or a Callout's words set as TypedLayout places them, in the operators of a PDF's
// content, so every reader draws exactly what was made. Pure: the bake wraps it in a stream with its box, the font of
// that name where words are set, and, where the opacity is under 1, a graphics state of that name.
import { Helvetica } from '../helvetica';
import type { Box } from '../mark';
import type { MarkDrawing } from '../mark-drawing';
import type { PlacedLine } from '../typed-layout';

/** The graphics state an appearance draws through where its opacity is under 1. */
export const APPEARANCE_STATE = 'LDa';
/** The font an appearance sets words in: Helvetica, written in WinAnsi. */
export const APPEARANCE_FONT = 'Helv';

/** A Text's or a Callout's words: its lines placed on the page, their size, and the box they are set in. */
export type AppearanceWords = {
  readonly lines: readonly PlacedLine[];
  readonly size: number;
  readonly box: Box;
};

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

/** A line of words as a PDF string in WinAnsi: its brackets and backslashes escaped, every byte past ASCII in octal. */
export function winAnsiString(text: string): string {
  const bytes = Array.from(text, (character) => Helvetica.code(character.codePointAt(0)!));
  const escaped = bytes.map((code) => {
    const character = String.fromCharCode(code);
    if (character === '(' || character === ')' || character === '\\') return `\\${character}`;
    return code >= 0x20 && code < 0x7f ? character : `\\${code.toString(8).padStart(3, '0')}`;
  });
  return `(${escaped.join('')})`;
}

/** The words' font, size and colour as the file's `DA` says them. */
export const defaultAppearanceOf = (size: number, colour: string): string =>
  `/${APPEARANCE_FONT} ${num(size)} Tf ${rgbOf(colour)} rg`;

const path = (points: MarkDrawing['fills'][number]): string =>
  points.map(({ x, y }, at) => `${num(x)} ${num(y)} ${at === 0 ? 'm' : 'l'}`).join(' ');

export function appearanceOf(
  { fills, strokes }: MarkDrawing,
  look: { readonly colour: string; readonly opacity: number },
  words: AppearanceWords | null = null,
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
  const set = words?.lines.filter((line) => line.text !== '') ?? [];
  if (words && set.length > 0) {
    lines.push('BT', defaultAppearanceOf(words.size, look.colour));
    for (const line of set)
      lines.push(`1 0 0 1 ${num(line.x)} ${num(line.y)} Tm ${winAnsiString(line.text)} Tj`);
    lines.push('ET');
  }
  lines.push('Q');
  const box = words
    ? [
        { x: words.box[0], y: words.box[1] },
        { x: words.box[2], y: words.box[3] },
      ]
    : [];
  const all = [...fills.flat(), ...strokes.flatMap((stroke) => stroke.points), ...box];
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
