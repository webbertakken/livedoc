// Turned text (docs/specs/029-sheets/formatting.md "Alignment, wrapping, rotation"): a cell's rotation is a whole angle
// from −90° to 90°, counterclockwise, or stacked ('v'); the box turned text takes, which places it in its cell and
// sizes its automatic row (sheet.md "Row height"). Pure.

export const ROTATION_MIN = -90;
export const ROTATION_MAX = 90;

/** A cell's rotation: a whole, non-zero angle in degrees, counterclockwise; or 'v', stacked. */
export type Rotation = number | 'v';

export function isRotation(v: unknown): v is Rotation {
  return (
    v === 'v' ||
    (Number.isInteger(v) &&
      v !== 0 &&
      (v as number) >= ROTATION_MIN &&
      (v as number) <= ROTATION_MAX)
  );
}

/**
 * The lines turned text is drawn on: stacked, one upright character each (its line breaks dropped); turned, one per line
 * break typed into it, a formula's text on one line, as an unwrapped cell draws it (D210).
 */
export function turnedLines(text: string, ro: Rotation, typed: boolean): string[] {
  if (ro === 'v') return [...text.replace(/\r?\n/g, '')];
  return typed ? text.split(/\r?\n/) : [text.replace(/\r?\n/g, ' ')];
}

/** The box `lines` lines of text `widest` px wide, `lineH` px apart, take turned by `deg` degrees. */
export function turnedBox(
  widest: number,
  lines: number,
  lineH: number,
  deg: number,
): { w: number; h: number } {
  const tall = lines * lineH;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  // Cosines of ±90° come out a hair above 0: rounded to a hundredth of a px, so a turned box is exact where it can be.
  const round = (n: number) => Math.round(n * 100) / 100;
  return { w: round(widest * cos + tall * sin), h: round(widest * sin + tall * cos) };
}
