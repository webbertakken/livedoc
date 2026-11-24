// A workbook's theme in XLSX (docs/specs/029-sheets/standard-mapping.md "The theme in the file", D218): the theme part
// written from the theme (its colours, its font as major and minor, LibreOffice's plain format scheme), read back as a
// theme (a catalogue theme it matches, else the file's own by its name), and a cell's theme colour as a `theme`
// index in Excel's order, read back as that theme colour when it has no tint.
import {
  attributeOf,
  childElement,
  escapeXmlAttribute,
  parseXml,
  type XmlElement,
} from '@livedoc/office-packages';
import {
  isThemeColourRef,
  readTheme,
  SPREADSHEET_THEMES,
  themeColourRef,
  type SpreadsheetTheme,
  type ThemeColourKey,
} from '../themes/spreadsheet-theme';
import { readThemeColours } from './xlsx-colours';

const DRAWINGML_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

/** Each theme colour's index in SpreadsheetML's order (0 lt1, 1 dk1, 2 lt2, 3 dk2, 4 to 9 accents, 10 hlink). */
export const XLSX_THEME_INDEX: Readonly<Record<ThemeColourKey, number>> = {
  background: 0,
  text: 1,
  accent1: 4,
  accent2: 5,
  accent3: 6,
  accent4: 7,
  accent5: 8,
  accent6: 9,
  link: 10,
};
const KEY_AT = new Map(Object.entries(XLSX_THEME_INDEX).map(([k, i]) => [i, k as ThemeColourKey]));

const rgb = (hex: string) => hex.slice(1).toUpperCase();
const slot = (name: string, hex: string) => `<a:${name}><a:srgbClr val="${rgb(hex)}"/></a:${name}>`;
const fonts = (font: string) => {
  const face = escapeXmlAttribute(font);
  return `<a:latin typeface="${face}"/><a:ea typeface=""/><a:cs typeface=""/>`;
};
const FILL = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
const LINE =
  '<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:prstDash val="solid"/><a:miter/></a:ln>';
const EFFECT = '<a:effectStyle><a:effectLst/></a:effectStyle>';

/** The theme part a workbook's theme is written as. */
export function xlsxThemeXml(theme: SpreadsheetTheme): string {
  const c = theme.colours;
  return (
    `<a:theme xmlns:a="${DRAWINGML_NS}" name="${escapeXmlAttribute(theme.name)}"><a:themeElements>` +
    `<a:clrScheme name="${escapeXmlAttribute(theme.name)}">` +
    slot('dk1', c.text) +
    slot('lt1', c.background) +
    slot('dk2', c.text) +
    slot('lt2', c.background) +
    (['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'] as const)
      .map((k) => slot(k, c[k]))
      .join('') +
    slot('hlink', c.link) +
    slot('folHlink', c.link) +
    '</a:clrScheme>' +
    `<a:fontScheme name="${escapeXmlAttribute(theme.name)}"><a:majorFont>${fonts(theme.font)}</a:majorFont>` +
    `<a:minorFont>${fonts(theme.font)}</a:minorFont></a:fontScheme>` +
    `<a:fmtScheme name="${escapeXmlAttribute(theme.name)}">` +
    `<a:fillStyleLst>${FILL.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${LINE.repeat(3)}</a:lnStyleLst>` +
    `<a:effectStyleLst>${EFFECT.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${FILL.repeat(3)}</a:bgFillStyleLst>` +
    '</a:fmtScheme></a:themeElements></a:theme>'
  );
}

/**
 * The theme a file's theme part says, with `font` (the file's default font) as its font: the catalogue's when it is
 * one of them exactly, else the file's by its name; null without a readable theme part.
 */
export function readXlsxTheme(
  themeXml: string | undefined,
  font: string | undefined,
): SpreadsheetTheme | null {
  const parsed = themeXml === undefined ? undefined : parseXml(themeXml, 'xl/theme/theme1.xml');
  const colours = readThemeColours(themeXml);
  if (!parsed?.ok || !colours.length || !font) return null;
  const name = attributeOf(parsed.root, '', 'name') ?? '';
  const at = (k: ThemeColourKey) => colours[XLSX_THEME_INDEX[k]]!;
  const read = readTheme({
    id: 'custom',
    name: name.trim().slice(0, 100) || 'Custom',
    font,
    colours: Object.fromEntries(
      Object.keys(XLSX_THEME_INDEX).map((k) => [k, at(k as ThemeColourKey)]),
    ),
  });
  if (!read) return null;
  const same = (t: SpreadsheetTheme) =>
    t.font === read.font &&
    Object.keys(XLSX_THEME_INDEX).every(
      (k) => t.colours[k as ThemeColourKey] === read.colours[k as ThemeColourKey],
    );
  return SPREADSHEET_THEMES.find(same) ?? read;
}

/** A cell's colour element as a theme colour: by `theme` without a `tint`; null for any other. */
export function themeColourRefOf(element: XmlElement | undefined): string | null {
  const index = element && attributeOf(element, '', 'theme');
  if (index === undefined || Number(attributeOf(element!, '', 'tint') ?? 0) !== 0) return null;
  const key = KEY_AT.get(Number(index));
  return key ? themeColourRef(key) : null;
}

/** A colour element: a theme colour by its index, any other by its opaque `rgb`. */
export function xlsxColourOrThemeXml(local: string, colour: string): string {
  if (isThemeColourRef(colour))
    return `<${local} theme="${XLSX_THEME_INDEX[colour.slice('theme:'.length) as ThemeColourKey]}"/>`;
  return `<${local} rgb="FF${rgb(colour)}"/>`;
}

/** The default font a styles part names (its first `font`'s), or undefined. */
export function xlsxDefaultFont(stylesRoot: XmlElement, ns: string): string | undefined {
  const list = childElement(stylesRoot, ns, 'fonts');
  const first = list && childElement(list, ns, 'font');
  const name = first && childElement(first, ns, 'name');
  return name && attributeOf(name, '', 'val');
}
