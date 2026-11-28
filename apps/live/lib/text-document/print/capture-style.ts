// What the capture of a text document's pages reads of computed style (docs/specs/034-text-documents/files-and-print.md
// "Downloading", PDF): colours as `#rrggbb` with their alpha, text as drawn (its transform applied), and the lines a
// decoration draws. Pure.

/** A colour as the writer takes it, and how opaque it is. */
export type CapturedColour = { readonly hex: string; readonly alpha: number };

const hex2 = (n: number) =>
  Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, '0');

/**
 * A computed colour (`rgb()`, `rgba()`, the space-separated forms, `transparent`, `#rrggbb`); null where it is not
 * one of them or draws nothing.
 */
export function parseColour(value: string): CapturedColour | null {
  const text = value.trim().toLowerCase();
  if (text === '' || text === 'transparent' || text === 'none') return null;
  const hex = /^#([0-9a-f]{6})$/.exec(text);
  if (hex) return { hex: `#${hex[1]}`, alpha: 1 };
  const rgb = /^rgba?\(([^)]+)\)$/.exec(text);
  if (!rgb) return null;
  const parts = rgb[1]!
    .split(/[\s,/]+/)
    .filter((part) => part !== '')
    .map((part) => (part.endsWith('%') ? (Number(part.slice(0, -1)) / 100) * 255 : Number(part)));
  const [r, g, b] = parts;
  if (r === undefined || g === undefined || b === undefined || parts.some(Number.isNaN))
    return null;
  const alphaPart = rgb[1]!.split(/[\s,/]+/).filter((part) => part !== '')[3];
  const alpha =
    alphaPart === undefined
      ? 1
      : alphaPart.endsWith('%')
        ? Number(alphaPart.slice(0, -1)) / 100
        : Number(alphaPart);
  if (alpha <= 0) return null;
  return { hex: `#${hex2(r)}${hex2(g)}${hex2(b)}`, alpha: Math.min(1, alpha) };
}

/** A colour laid over white at its alpha: how see-through ink reads on paper. */
export function overWhite({ hex, alpha }: CapturedColour): string {
  if (alpha >= 1) return hex;
  const channel = (at: number) => 255 - (255 - parseInt(hex.slice(at, at + 2), 16)) * alpha;
  return `#${hex2(channel(1))}${hex2(channel(3))}${hex2(channel(5))}`;
}

/** Text as it is drawn under `text-transform`. */
export function transformed(text: string, transform: string): string {
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'capitalize':
      return text.replace(
        /(^|[\s\p{P}])(\p{Ll})/gu,
        (_, before: string, letter: string) => before + letter.toUpperCase(),
      );
    default:
      return text;
  }
}

/** Below the baseline, in em, where an underline is drawn (default). */
export const CAPTURE_UNDERLINE_EM = 0.1;
/** Above the baseline, in em, where a strike is drawn (default). */
export const CAPTURE_STRIKE_EM = 0.3;
/** How thick either is, in em (default). */
export const CAPTURE_DECORATION_EM = 0.05;

/** Which decorations a `text-decoration-line` draws. */
export const decorationsOf = (line: string): { underline: boolean; strike: boolean } => ({
  underline: line.includes('underline'),
  strike: line.includes('line-through'),
});

/** A CSS `font` shorthand that draws as the computed style does: what a canvas measures with. */
export const fontOf = (
  style: Pick<CSSStyleDeclaration, 'fontStyle' | 'fontWeight' | 'fontSize' | 'fontFamily'>,
) => `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

/** The turn a computed `transform` gives, in radians: 0 for none. */
export function rotationOf(transform: string): number {
  const matrix = /^matrix\(([^)]+)\)$/.exec(transform.trim());
  if (!matrix) return 0;
  const [a, b] = matrix[1]!.split(',').map(Number);
  return a === undefined || b === undefined || Number.isNaN(a) || Number.isNaN(b)
    ? 0
    : Math.atan2(b, a);
}
