// An XLSX file's colours (docs/specs/029-sheets/standard-mapping.md "Cell styles in the file", Colours): an `rgb`, an
// `indexed` colour of ECMA-376's palette (Part 1 §18.8.27) or a `theme` colour of the file's theme with its `tint`
// (§18.3.1.15), as `#rrggbb`; none for `auto` and the system colours. Written as an opaque `rgb`. Pure.
import {
  attributeOf,
  childElement,
  childElements,
  parseXml,
  type XmlElement,
} from '@livedoc/office-packages';

const DRAWINGML_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

/** ECMA-376's indexed colours 0 to 63; 64 and 65 are the system's foreground and background. */
const INDEXED = (
  '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF ' +
  '800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF ' +
  '000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 ' +
  '3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333'
).split(' ');

/** SpreadsheetML's theme slots in order: light 1 and dark 1 come first, swapped from the theme's own order. */
const THEME_SLOTS = [
  'lt1',
  'dk1',
  'lt2',
  'dk2',
  'accent1',
  'accent2',
  'accent3',
  'accent4',
  'accent5',
  'accent6',
  'hlink',
  'folHlink',
];

const RGB_RE = /^[0-9a-f]{6}$/i;

/** The theme's twelve colours in SpreadsheetML's order, `#rrggbb`; none when the part is absent or unread. */
export function readThemeColours(themeXml: string | undefined): string[] {
  if (themeXml === undefined) return [];
  const parsed = parseXml(themeXml, 'xl/theme/theme1.xml');
  if (!parsed.ok) return [];
  const elements = childElement(parsed.root, DRAWINGML_NS, 'themeElements');
  const scheme = elements && childElement(elements, DRAWINGML_NS, 'clrScheme');
  if (!scheme) return [];
  return THEME_SLOTS.map((slot) => {
    const holder = childElement(scheme, DRAWINGML_NS, slot);
    const value = holder ? childElements(holder)[0] : undefined;
    const rgb = value && attributeOf(value, '', value.local === 'sysClr' ? 'lastClr' : 'val');
    return rgb && RGB_RE.test(rgb) ? `#${rgb.toLowerCase()}` : '';
  });
}

// A colour lightened (tint above 0) or darkened (below) in HLS, as Excel draws a theme colour's tint (§18.8.19).
function tinted(hex: string, tint: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor((h + 6) % 6);
  const [r1, g1, b1] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector]!;
  return `#${[r1, g1, b1]
    .map((v) =>
      Math.round((v! + m) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** A `color`, `fgColor` or `bgColor` element's colour as `#rrggbb`, or null for none. */
export function xlsxColourOf(
  element: XmlElement | undefined,
  theme: readonly string[],
): string | null {
  if (!element) return null;
  const rgb = attributeOf(element, '', 'rgb');
  if (rgb !== undefined) {
    const six = rgb.length === 8 ? rgb.slice(2) : rgb;
    return RGB_RE.test(six) ? `#${six.toLowerCase()}` : null;
  }
  const indexed = attributeOf(element, '', 'indexed');
  if (indexed !== undefined) {
    const hex = INDEXED[Number(indexed)];
    return hex ? `#${hex.toLowerCase()}` : null;
  }
  const slot = attributeOf(element, '', 'theme');
  if (slot === undefined) return null;
  const base = theme[Number(slot)];
  if (!base) return null;
  const tint = Number(attributeOf(element, '', 'tint') ?? 0);
  return tint && Number.isFinite(tint) ? tinted(base, Math.max(-1, Math.min(1, tint))) : base;
}

/** A colour element with an opaque `rgb` (`FFrrggbb`). */
export const xlsxColourXml = (local: string, hex: string): string =>
  `<${local} rgb="FF${hex.slice(1).toUpperCase()}"/>`;
