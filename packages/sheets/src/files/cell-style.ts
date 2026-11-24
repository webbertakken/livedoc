// A cell's style beyond its number format, as a file's cell style carries it (docs/specs/029-sheets/standard-mapping.md
// "Cell styles in the file"): the format keys every cell style maps, without what both formats draw by default, and
// one key per distinct style, so each is written once. Pure.
import type { Border, CellFormat } from '../sheet';

export const CELL_STYLE_KEYS = [
  'b',
  'i',
  'u',
  'st',
  'fc',
  'bg',
  'ff',
  'fs',
  'ha',
  'va',
  'wr',
  'bt',
  'br',
  'bb',
  'bl',
] as const;
export type CellStyleKey = (typeof CELL_STYLE_KEYS)[number];
export type CellStyle = Pick<CellFormat, CellStyleKey>;

/** The family a file names for LiveDoc's own default font (formatting.md "Font", D201). */
export const FILE_DEFAULT_FONT = 'Arial';

/**
 * A format's style as a file carries it, or none: the grid's middle (D204) and Overflow are what a file draws with no
 * word, and Clip has no form in either format (D205).
 */
export function cellStyleOf(f: CellFormat | undefined): CellStyle | undefined {
  if (!f) return undefined;
  const out: CellStyle = {};
  for (const key of CELL_STYLE_KEYS)
    if (f[key] !== undefined) Object.assign(out, { [key]: f[key] });
  if (out.va === 'm') delete out.va;
  if (out.wr === 'o' || out.wr === 'c') delete out.wr;
  return Object.keys(out).length > 0 ? out : undefined;
}

const borderKey = (b: Border) => `${b.w} ${b.s} ${b.c}`;

/** One key per distinct style, whatever order its keys came in; '' for none. */
export function cellStyleKey(style: CellStyle | undefined): string {
  if (!style) return '';
  return CELL_STYLE_KEYS.filter((key) => style[key] !== undefined)
    .map((key) => {
      const v = style[key]!;
      return `${key}=${typeof v === 'object' ? borderKey(v) : String(v)}`;
    })
    .join(';');
}
