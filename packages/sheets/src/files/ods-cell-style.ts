// An ODF cell style's look beyond its number format (docs/specs/029-sheets/standard-mapping.md "Cell styles in the
// file"): a `table-cell` style read through its parents to the default style, property by property, as a cell's style
// against LiveDoc's defaults (D203, D204, D206); and the properties an automatic cell style is written with, over the
// default cell style LiveDoc writes (Arial 10 pt, middle).
import { cellProtectFrees } from './ods-protection';
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  ODF_NS,
  type XmlElement,
} from '@livedoc/office-packages';
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  fontFamilyName,
  validFormatValue,
} from '../format';
import type { Border, BorderStyle } from '../sheet';
import { ROTATION_MAX, ROTATION_MIN, type Rotation } from '../text/rotation';
import { FILE_DEFAULT_FONT, cellStyleKey, type CellStyle } from './cell-style';
import { pxFromOdfLength } from './line-units';

const { office: OFFICE, style: STYLE, fo: FO, svg: SVG } = ODF_NS;

const defaultProperties = (font: string) =>
  '<style:table-cell-properties style:vertical-align="middle"/>' +
  `<style:text-properties fo:font-family="${escapeXmlAttribute(font)}" fo:font-size="${FONT_SIZE_DEFAULT}pt"/>`;

/**
 * LiveDoc's default cell style, written in `styles.xml` (D204, D207): the theme's font (Arial) 10 pt, in the middle, as the default style
 * and as the "Default" style every written cell style is a child of, which LibreOffice draws its cells by.
 */
export const odsDefaultCellStyles = (font: string = FILE_DEFAULT_FONT): string[] => [
  `<style:default-style style:family="table-cell">${defaultProperties(font)}</style:default-style>`,
  `<style:style style:name="Default" style:family="table-cell">${defaultProperties(font)}</style:style>`,
];
export const ODS_DEFAULT_CELL_STYLES = odsDefaultCellStyles();

/** A cell style's look: the cell's style (none for LiveDoc's defaults) and whether it says more than the model holds. */
// `frees`: its cells are free of their sheet's protection (standard-mapping.md "Protection in the file").
export type OdsLook = { style?: CellStyle; lost: boolean; frees?: true };

/** The look of each cell style by name; none names the file's default (its "Default" style, else its default style). */
export type OdsCellLooks = {
  of: (name: string | undefined) => OdsLook;
  // A named style's own look (by its name or display name), without its parents': what a format rule's style sets over a cell's; null for none.
  own: (name: string) => OdsLook | null;
};

// A style's properties, merged over its parents': `<properties element>|<namespace>|<attribute>` to its value.
type Properties = Map<string, string>;

const PROPERTY_ELEMENTS = ['table-cell-properties', 'paragraph-properties', 'text-properties'];
const key = (element: string, uri: string, local: string) => `${element}|${uri}|${local}`;
const TEXT = (uri: string, local: string) => key('text-properties', uri, local);
const CELL = (uri: string, local: string) => key('table-cell-properties', uri, local);
const PARAGRAPH = (uri: string, local: string) => key('paragraph-properties', uri, local);
const FAMILY_KEYS = [TEXT(STYLE, 'font-name'), TEXT(FO, 'font-family')];

function ownProperties(style: XmlElement): Properties {
  const out: Properties = new Map();
  for (const element of childElements(style)) {
    if (element.uri !== STYLE || !PROPERTY_ELEMENTS.includes(element.local)) continue;
    for (const { uri, local, value } of element.attributes)
      out.set(key(element.local, uri, local), value);
  }
  return out;
}

// A merge of a style's own properties over its parent's; a family named either way replaces the other (§20.205).
function merged(parent: Properties, own: Properties): Properties {
  const out = new Map(parent);
  if (FAMILY_KEYS.some((k) => own.has(k))) for (const k of FAMILY_KEYS) out.delete(k);
  for (const [k, v] of own) out.set(k, v);
  return out;
}

const BORDER_STYLES: Readonly<Record<string, BorderStyle | null>> = {
  none: null,
  hidden: null,
  solid: 'solid',
  double: 'double',
  'double-thin': 'double',
  groove: 'solid',
  ridge: 'solid',
  inset: 'solid',
  outset: 'solid',
  dotted: 'dotted',
  dashed: 'dashed',
  dash: 'dashed',
  'fine-dashed': 'dashed',
  'dash-dot': 'dashed',
  'dot-dash': 'dashed',
  'dash-dot-dot': 'dashed',
  'dot-dot-dash': 'dashed',
  wave: 'dashed',
};
const COLOUR_RE = /^#[0-9a-f]{6}$/i;
const PX_PER_POINT = 4 / 3;

// A border (`0.74pt solid #000000`, its parts in any order): width 1 up to 1 pt, 2 up to 2 pt, else 3 (D206).
function borderOf(text: string): Border | null | undefined {
  let width = 1;
  let style: BorderStyle | null | undefined;
  let colour = '#000000';
  for (const part of text.trim().split(/\s+/)) {
    const px = pxFromOdfLength(part);
    if (px !== null) width = px / PX_PER_POINT <= 1 ? 1 : px / PX_PER_POINT <= 2 ? 2 : 3;
    else if (COLOUR_RE.test(part)) colour = part.toLowerCase();
    else if (Object.hasOwn(BORDER_STYLES, part)) style = BORDER_STYLES[part];
    else return undefined;
  }
  if (!style) return style === null ? null : undefined;
  // A double is three pixels drawn as two lines, whatever width a file gives it.
  return { w: style === 'double' ? 3 : (width as Border['w']), s: style, c: colour };
}

// The first family of a font family list, its quotes taken off.
const firstFamily = (list: string) =>
  list
    .split(',')[0]!
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2');

type Read = { style: CellStyle; lost: boolean; frees?: true };

function readText(
  p: Properties,
  faces: ReadonlyMap<string, string>,
  ink: string | undefined,
  read: Read,
) {
  const weight = p.get(TEXT(FO, 'font-weight'));
  if (weight === 'bold' || Number(weight) >= 600) read.style.b = true;
  const slant = p.get(TEXT(FO, 'font-style'));
  if (slant === 'italic' || slant === 'oblique') read.style.i = true;
  if ((p.get(TEXT(STYLE, 'text-underline-style')) ?? 'none') !== 'none') read.style.u = true;
  if ((p.get(TEXT(STYLE, 'text-line-through-style')) ?? 'none') !== 'none') read.style.st = true;
  const colour = p.get(TEXT(FO, 'color'));
  if (colour && COLOUR_RE.test(colour) && colour.toLowerCase() !== ink)
    read.style.fc = colour.toLowerCase();
  const faceName = p.get(TEXT(STYLE, 'font-name'));
  const listed = p.get(TEXT(FO, 'font-family'));
  const family =
    faceName !== undefined ? (faces.get(faceName) ?? faceName) : listed && firstFamily(listed);
  if (family && family.toLowerCase() !== FILE_DEFAULT_FONT.toLowerCase()) {
    if (validFormatValue('ff', family)) read.style.ff = family;
    else read.lost = true;
  }
  const size = p.get(TEXT(FO, 'font-size'));
  const px = size === undefined ? null : pxFromOdfLength(size);
  if (size !== undefined && px === null) read.lost = true;
  const points = px === null ? FONT_SIZE_DEFAULT : Math.round(px / PX_PER_POINT);
  if (points !== FONT_SIZE_DEFAULT)
    read.style.fs = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, points));
}

const HORIZONTAL: Readonly<Record<string, CellStyle['ha']>> = {
  start: 'l',
  left: 'l',
  center: 'c',
  end: 'r',
  right: 'r',
};
const VERTICAL: Readonly<Record<string, CellStyle['va'] | null>> = {
  top: 't',
  middle: null,
  bottom: 'b',
  automatic: 'b',
};
const SIDES = [
  ['top', 'bt'],
  ['right', 'br'],
  ['bottom', 'bb'],
  ['left', 'bl'],
] as const;

function readParagraph(p: Properties, read: Read) {
  const align = p.get(PARAGRAPH(FO, 'text-align'));
  const automatic = p.get(PARAGRAPH(STYLE, 'text-align-source')) === 'value-type';
  if (align !== undefined && !automatic) {
    const ha = HORIZONTAL[align];
    if (ha) read.style.ha = ha;
    else read.lost = true;
  }
  const margin = p.get(PARAGRAPH(FO, 'margin-left'));
  if (margin !== undefined && pxFromOdfLength(margin) !== 0) read.lost = true;
}

// An angle's units in degrees (ODF 1.2 §18.3: a bare angle is in degrees).
const ANGLE_UNITS: Readonly<Record<string, number>> = {
  '': 1,
  deg: 1,
  rad: 180 / Math.PI,
  grad: 0.9,
};

/** An ODF angle as a rotation, to the whole degree: none at 0, undefined upside down (90° to 270°, D212) or unread. */
function rotationOf(value: string): Rotation | null | undefined {
  const m = /^(-?\d+(?:\.\d+)?)(deg|rad|grad)?$/.exec(value);
  if (!m) return undefined;
  const turned = Math.round(Number(m[1]) * ANGLE_UNITS[m[2] ?? '']!);
  const deg = ((turned % 360) + 360) % 360;
  if (deg === 0) return null;
  if (deg <= ROTATION_MAX) return deg;
  if (deg >= 360 + ROTATION_MIN) return deg - 360;
  return undefined;
}

// `automatic`, the absent vertical alignment, is the maker's bottom where a file has a default style (D204).
function readCell(p: Properties, read: Read, absent: string) {
  const fill = p.get(CELL(FO, 'background-color'));
  if (fill && COLOUR_RE.test(fill)) read.style.bg = fill.toLowerCase();
  const all = p.get(CELL(FO, 'border'));
  for (const [side, k] of SIDES) {
    const text = p.get(CELL(FO, `border-${side}`)) ?? all;
    const border = text === undefined ? null : borderOf(text);
    if (border === undefined) read.lost = true;
    else if (border) read.style[k] = border;
  }
  const va = VERTICAL[p.get(CELL(STYLE, 'vertical-align')) ?? absent];
  if (va) read.style.va = va;
  if (va === undefined) read.lost = true;
  if (p.get(CELL(FO, 'wrap-option')) === 'wrap') read.style.wr = 'w';
  const ro =
    p.get(CELL(STYLE, 'direction')) === 'ttb'
      ? 'v'
      : rotationOf(p.get(CELL(STYLE, 'rotation-angle')) ?? '0');
  if (ro) read.style.ro = ro;
  if (ro === undefined) read.lost = true;
  const said = (local: string, plain: readonly string[]) => {
    const value = p.get(CELL(STYLE, local));
    return value !== undefined && !plain.includes(value);
  };
  if (
    said('shrink-to-fit', ['false']) ||
    said('diagonal-bl-tr', ['none']) ||
    said('diagonal-tl-br', ['none'])
  )
    read.lost = true;
  // Unprotected cells are free of their sheet's protection; a hidden formula is more than the model holds.
  const protect = p.get(CELL(STYLE, 'cell-protect'));
  if (cellProtectFrees(protect)) read.frees = true;
  if (/formula-hidden|hidden-and-protected/.test(protect ?? '')) read.lost = true;
}

// What reading a look needs of the file: its font faces, its default ink, and what an absent vertical alignment is.
type FileLook = { faces: ReadonlyMap<string, string>; ink: string | undefined; absent: string };

function lookOf(p: Properties, file: FileLook): OdsLook {
  const read: Read = { style: {}, lost: false };
  readText(p, file.faces, file.ink, read);
  readParagraph(p, read);
  readCell(p, read, file.absent);
  const frees = read.frees ? { frees: true as const } : {};
  return Object.keys(read.style).length > 0
    ? { style: read.style, lost: read.lost, ...frees }
    : { lost: read.lost, ...frees };
}

/** Every cell style's look among a file's style containers (content and styles), through its parents. */
export function odsCellLooks(roots: readonly XmlElement[]): OdsCellLooks {
  const faces = new Map<string, string>();
  const styles = new Map<string, XmlElement>();
  const shownNames = new Map<string, XmlElement>();
  let defaults: Properties = new Map();
  let declared = false;
  for (const root of roots) {
    const decls = childElement(root, OFFICE, 'font-face-decls');
    for (const face of decls ? childElements(decls) : []) {
      const name = attributeOf(face, STYLE, 'name');
      const family = attributeOf(face, SVG, 'font-family');
      if (name !== undefined && family !== undefined) faces.set(name, firstFamily(family));
    }
    for (const local of ['styles', 'automatic-styles']) {
      const container = childElement(root, OFFICE, local);
      for (const element of container ? childElements(container) : []) {
        if (attributeOf(element, STYLE, 'family') !== 'table-cell') continue;
        // The default style's text alone: LibreOffice writes cell properties there that it never draws (D207).
        if (element.local === 'default-style') {
          defaults = new Map(
            [...ownProperties(element)].filter(([k]) => k.startsWith('text-properties|')),
          );
          declared = true;
        }
        const name = attributeOf(element, STYLE, 'name');
        if (element.local === 'style' && name !== undefined) styles.set(name, element);
        // LibreOffice names a format rule's style by its display name.
        const shown = attributeOf(element, STYLE, 'display-name');
        if (element.local === 'style' && shown !== undefined) shownNames.set(shown, element);
      }
    }
  }
  const resolved = new Map<string, Properties>();
  const propertiesOf = (name: string, seen: ReadonlySet<string>): Properties => {
    const known = resolved.get(name);
    if (known) return known;
    const style = styles.get(name);
    if (!style || seen.has(name)) return defaults;
    const parent = attributeOf(style, STYLE, 'parent-style-name');
    const base = parent === undefined ? defaults : propertiesOf(parent, new Set([...seen, name]));
    const out = merged(base, ownProperties(style));
    resolved.set(name, out);
    return out;
  };
  const baseName = styles.has('Default') ? 'Default' : undefined;
  const ink = (baseName ? propertiesOf(baseName, new Set()) : defaults)
    .get(TEXT(FO, 'color'))
    ?.toLowerCase();
  // A file with no default style says nothing of its cells' look (D203).
  const file: FileLook = { faces, ink, absent: declared || baseName ? 'automatic' : 'middle' };
  // Looks that read the same share one, as each name is read once.
  const looks = new Map<string, OdsLook>();
  const shared = new Map<string, OdsLook>();
  const of = (name: string | undefined): OdsLook => {
    const at = name !== undefined && styles.has(name) ? name : baseName;
    const memo = at ?? '';
    const known = looks.get(memo);
    if (known) return known;
    const look = lookOf(at === undefined ? defaults : propertiesOf(at, new Set()), file);
    const sameKey = `${cellStyleKey(look.style)}#${look.lost}#${look.frees === true}`;
    const one = shared.get(sameKey) ?? look;
    shared.set(sameKey, one);
    looks.set(memo, one);
    return one;
  };
  const own = (name: string): OdsLook | null => {
    const style = shownNames.get(name) ?? styles.get(name);
    return style
      ? lookOf(ownProperties(style), { ...file, ink: undefined, absent: 'middle' })
      : null;
  };
  return { of, own };
}

const WRITE_WIDTHS = ['0.74pt', '1.76pt', '2.49pt'];
// A double as LibreOffice draws one, and carries into Excel's `double`: 1.76 pt, its two lines and their gap (D206).
const DOUBLE_WIDTH = '1.76pt';
const DOUBLE_LINES = '0.0071in 0.0102in 0.0071in';
const WRITE_HORIZONTAL = { l: 'start', c: 'center', r: 'end' } as const;
const WRITE_VERTICAL = { t: 'top', m: 'middle', b: 'bottom' } as const;

/** The properties an automatic cell style says of a look, over LiveDoc's default cell style; nothing for none. */
export function odsStyleProperties(style: CellStyle | undefined): string {
  if (!style) return '';
  const cell: string[] = [];
  if (style.bg) cell.push(`fo:background-color="${style.bg}"`);
  for (const [side, k] of SIDES) {
    const b = style[k];
    if (b?.s === 'double')
      cell.push(
        `fo:border-${side}="${DOUBLE_WIDTH} double ${b.c}" style:border-line-width-${side}="${DOUBLE_LINES}"`,
      );
    else if (b) cell.push(`fo:border-${side}="${WRITE_WIDTHS[b.w - 1]} ${b.s} ${b.c}"`);
  }
  if (style.va) cell.push(`style:vertical-align="${WRITE_VERTICAL[style.va]}"`);
  if (style.wr === 'w') cell.push('fo:wrap-option="wrap"');
  // Counterclockwise, from 0 to 359, as LibreOffice writes it (315 is −45°); stacked text runs top to bottom.
  if (style.ro === 'v') cell.push('style:direction="ttb"');
  else if (style.ro)
    cell.push(
      `style:rotation-angle="${style.ro < 0 ? 360 + style.ro : style.ro}" style:rotation-align="none"`,
    );
  const text: string[] = [];
  if (style.b) text.push('fo:font-weight="bold"');
  if (style.i) text.push('fo:font-style="italic"');
  if (style.u)
    text.push(
      'style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"',
    );
  if (style.st) text.push('style:text-line-through-style="solid"');
  if (style.fc) text.push(`fo:color="${style.fc}"`);
  if (style.ff)
    text.push(`fo:font-family="${escapeXmlAttribute(`'${fontFamilyName(style.ff)}'`)}"`);
  if (style.fs) text.push(`fo:font-size="${style.fs}pt"`);
  return (
    (cell.length > 0 ? `<style:table-cell-properties ${cell.join(' ')}/>` : '') +
    (style.ha
      ? `<style:paragraph-properties fo:text-align="${WRITE_HORIZONTAL[style.ha]}" style:text-align-source="fix"/>`
      : '') +
    (text.length > 0 ? `<style:text-properties ${text.join(' ')}/>` : '')
  );
}
