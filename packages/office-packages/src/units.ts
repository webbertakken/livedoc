// Lengths (docs/specs/020-import-export/office-packages.md "Common pieces"): the model holds points, rounded to three
// decimals so a length read and written comes back equal; ODF lengths are written in points, OOXML's in its own units.

/** A number rounded to three decimals, without a negative zero. */
export const round3 = (n: number): number => Math.round(n * 1000) / 1000 + 0;

const POINTS_PER: Record<string, number> = {
  pt: 1,
  in: 72,
  cm: 72 / 2.54,
  mm: 72 / 25.4,
  pc: 12,
  px: 0.75,
};

/** An ODF length (`2cm`, `0.5in`, `12pt`, ...) in points, or undefined when it is not one. */
export function odfLengthToPt(value: string | undefined): number | undefined {
  const match = value?.trim().match(/^([-+]?(?:\d+\.?\d*|\.\d+))(cm|mm|in|pt|pc|px)$/);
  if (!match) return undefined;
  return round3(Number(match[1]) * POINTS_PER[match[2]!]!);
}

/** Points as an ODF length. */
export const ptToOdf = (pt: number): string => `${round3(pt)}pt`;

/** An ODF percentage (`115%`) as a fraction, or undefined. */
export function odfPercent(value: string | undefined): number | undefined {
  const match = value?.trim().match(/^([-+]?(?:\d+\.?\d*|\.\d+))%$/);
  return match ? round3(Number(match[1]) / 100) : undefined;
}

export const fractionToOdfPercent = (fraction: number): string => `${round3(fraction * 100)}%`;

const integerOf = (value: string | undefined): number | undefined => {
  if (value === undefined || !/^[-+]?\d+(\.\d+)?$/.test(value.trim())) return undefined;
  return Number(value);
};

/** OOXML twentieths of a point (twips), as points. */
export const twipsToPt = (value: string | undefined): number | undefined => {
  const n = integerOf(value);
  return n === undefined ? undefined : round3(n / 20);
};
export const ptToTwips = (pt: number): string => String(Math.round(pt * 20));

/** OOXML half-points (font sizes), as points. */
export const halfPointsToPt = (value: string | undefined): number | undefined => {
  const n = integerOf(value);
  return n === undefined ? undefined : round3(n / 2);
};
export const ptToHalfPoints = (pt: number): string => String(Math.round(pt * 2));

/** OOXML English Metric Units (drawings), as points. */
export const emuToPt = (value: string | undefined): number | undefined => {
  const n = integerOf(value);
  return n === undefined ? undefined : round3(n / 12700);
};
export const ptToEmu = (pt: number): string => String(Math.round(pt * 12700));
