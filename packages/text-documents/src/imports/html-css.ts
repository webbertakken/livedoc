// What an imported HTML element's own `style` says (docs/specs/034-text-documents/files-and-print.md "Opening"): its
// declarations read as the model's text and paragraph formatting. Only the values the model holds are read; anything
// else, and any value that does not parse, is left out. Stylesheets are never read.
import type { ParagraphProps, TextProps } from '../model/props';

/** The basic sixteen CSS colours, as `#rrggbb`. */
const NAMED_COLOURS: Readonly<Record<string, string>> = {
  black: '#000000',
  silver: '#c0c0c0',
  gray: '#808080',
  grey: '#808080',
  white: '#ffffff',
  maroon: '#800000',
  red: '#ff0000',
  purple: '#800080',
  fuchsia: '#ff00ff',
  green: '#008000',
  lime: '#00ff00',
  olive: '#808000',
  yellow: '#ffff00',
  navy: '#000080',
  blue: '#0000ff',
  teal: '#008080',
  aqua: '#00ffff',
};

/** A `style` attribute's declarations, by lower-case property name; the last of a name wins. */
export function styleDeclarations(style: string | undefined): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const declaration of (style ?? '').split(';')) {
    const at = declaration.indexOf(':');
    if (at <= 0) continue;
    const name = declaration.slice(0, at).trim().toLowerCase();
    const value = declaration
      .slice(at + 1)
      .replace(/!important/i, '')
      .trim();
    if (name && value) out.set(name, value);
  }
  return out;
}

const hex2 = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');

/** A CSS colour as `#rrggbb`: hex of three or six digits, `rgb()`/`rgba()`, or one of the basic sixteen names. */
export function cssColour(value: string | undefined): string | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  if (NAMED_COLOURS[v]) return NAMED_COLOURS[v];
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/.exec(v);
  return rgb ? `#${hex2(Number(rgb[1]))}${hex2(Number(rgb[2]))}${hex2(Number(rgb[3]))}` : undefined;
}

/** A CSS length in points: `pt`, `px` (three quarters of a point), or `em`/`rem` of 12 pt (default). */
export function cssPoints(value: string | undefined): number | undefined {
  const match = /^(-?\d+(?:\.\d+)?)(pt|px|em|rem)?$/.exec(value?.trim().toLowerCase() ?? '');
  if (!match) return undefined;
  const n = Number(match[1]);
  const unit = match[2] ?? 'px';
  const points = unit === 'pt' ? n : unit === 'px' ? n * 0.75 : n * 12;
  return Math.round(points * 100) / 100;
}

/** The text formatting an element's declarations give. */
export function textPropsOfStyle(css: ReadonlyMap<string, string>): TextProps {
  const props: { -readonly [K in keyof TextProps]: TextProps[K] } = {};
  const colour = cssColour(css.get('color'));
  if (colour) props.color = colour;
  const highlight = cssColour(css.get('background-color') ?? css.get('background'));
  if (highlight) props.highlight = highlight;
  const weight = css.get('font-weight')?.toLowerCase();
  if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) props.bold = true;
  else if (weight === 'normal' || weight === 'lighter' || Number(weight) <= 500) props.bold = false;
  const style = css.get('font-style')?.toLowerCase();
  if (style === 'italic' || style === 'oblique') props.italic = true;
  else if (style === 'normal') props.italic = false;
  const decoration = css.get('text-decoration') ?? css.get('text-decoration-line') ?? '';
  if (/underline/i.test(decoration)) props.underline = true;
  if (/line-through/i.test(decoration)) props.strike = true;
  const vertical = css.get('vertical-align')?.toLowerCase();
  if (vertical === 'super' || vertical === 'sub') props.vertical = vertical;
  const size = cssPoints(css.get('font-size'));
  if (size !== undefined && size > 0) props.size = size;
  const family = css.get('font-family')?.split(',')[0]?.replace(/["']/g, '').trim();
  if (family) props.font = family;
  return props;
}

const ALIGN: Readonly<Record<string, ParagraphProps['align']>> = {
  left: 'start',
  start: 'start',
  center: 'center',
  right: 'end',
  end: 'end',
  justify: 'justify',
};

/** The paragraph formatting an element's declarations give: alignment, the start indent, the first line. */
export function paragraphPropsOfStyle(css: ReadonlyMap<string, string>): ParagraphProps {
  const props: { -readonly [K in keyof ParagraphProps]: ParagraphProps[K] } = {};
  const align = ALIGN[css.get('text-align')?.toLowerCase() ?? ''];
  if (align) props.align = align;
  const indent = cssPoints(css.get('margin-left') ?? css.get('padding-left'));
  if (indent !== undefined && indent > 0) props.indentStart = indent;
  const first = cssPoints(css.get('text-indent'));
  if (first !== undefined && first !== 0) props.indentFirst = first;
  return props;
}
