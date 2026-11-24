// An XLSX cell style's look beyond its number format (docs/specs/029-sheets/standard-mapping.md "Cell styles in the
// file"): a `cellXfs` entry's font, fill, border and alignment read as a cell's style against LiveDoc's defaults
// (D203, D204, D206), and written as the `fonts`, `fills` and `borders` entries and the alignment a style needs.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
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
import { FILE_DEFAULT_FONT, cellStyleKey, type CellStyle } from './cell-style';
import { xlsxColourOf, xlsxColourXml } from './xlsx-colours';

/** The parts of a styles part a cell style names, and the theme its colours may come from. */
export type XlsxStylesheet = {
  fonts: readonly XmlElement[];
  fills: readonly XmlElement[];
  borders: readonly XmlElement[];
  theme: readonly string[];
  // The default font's colour (font 0's), which reads as none (D203).
  ink: string | null;
};

/** A styles part's fonts, fills and borders. */
export function readXlsxStylesheet(
  root: XmlElement,
  ns: string,
  theme: readonly string[],
): XlsxStylesheet {
  const listed = (list: string) => {
    const holder = childElement(root, ns, list);
    return holder ? childElements(holder) : [];
  };
  const fonts = listed('fonts');
  const font0 = fonts[0];
  const ink = font0
    ? xlsxColourOf(
        childElements(font0).find((e) => e.local === 'color'),
        theme,
      )
    : null;
  return { fonts, fills: listed('fills'), borders: listed('borders'), theme, ink };
}

const on = (e: XmlElement | undefined) =>
  e !== undefined && !['0', 'false'].includes(attributeOf(e, '', 'val') ?? '1');

const READ_BORDERS: Readonly<Record<string, Omit<Border, 'c'>>> = {
  thin: { w: 1, s: 'solid' },
  medium: { w: 2, s: 'solid' },
  thick: { w: 3, s: 'solid' },
  double: { w: 3, s: 'solid' },
  hair: { w: 1, s: 'dotted' },
  dotted: { w: 1, s: 'dotted' },
  dashed: { w: 1, s: 'dashed' },
  dashDot: { w: 1, s: 'dashed' },
  dashDotDot: { w: 1, s: 'dashed' },
  mediumDashed: { w: 2, s: 'dashed' },
  mediumDashDot: { w: 2, s: 'dashed' },
  mediumDashDotDot: { w: 2, s: 'dashed' },
  slantDashDot: { w: 2, s: 'dashed' },
};

const HORIZONTAL: Readonly<Record<string, CellStyle['ha'] | null>> = {
  general: null,
  left: 'l',
  center: 'c',
  right: 'r',
};
const VERTICAL: Readonly<Record<string, CellStyle['va'] | null>> = {
  top: 't',
  center: null,
  bottom: 'b',
};
// An alignment's attributes the model has no form for, and the value that says nothing.
const ALIGNMENT_DEFAULTS: Readonly<Record<string, readonly string[]>> = {
  textRotation: ['0'],
  indent: ['0'],
  relativeIndent: ['0'],
  shrinkToFit: ['0', 'false'],
  justifyLastLine: ['0', 'false'],
  readingOrder: ['0'],
};
// The alignment's attributes the model reads.
const READ_ALIGNMENT = new Set(['horizontal', 'vertical', 'wrapText']);
const PROTECTION_DEFAULTS: Readonly<Record<string, readonly string[]>> = {
  locked: ['1', 'true'],
  hidden: ['0', 'false'],
};

type Read = { style: CellStyle; lost: boolean };

function readFont(font: XmlElement | undefined, sheet: XlsxStylesheet, read: Read) {
  const parts = new Map((font ? childElements(font) : []).map((e) => [e.local, e]));
  if (on(parts.get('b'))) read.style.b = true;
  if (on(parts.get('i'))) read.style.i = true;
  if (on(parts.get('strike'))) read.style.st = true;
  const u = parts.get('u');
  if (u && (attributeOf(u, '', 'val') ?? 'single') !== 'none') read.style.u = true;
  const colour = xlsxColourOf(parts.get('color'), sheet.theme);
  if (colour && colour !== sheet.ink) read.style.fc = colour;
  const name = parts.get('name') && attributeOf(parts.get('name')!, '', 'val');
  if (name && name.toLowerCase() !== FILE_DEFAULT_FONT.toLowerCase()) {
    if (validFormatValue('ff', name)) read.style.ff = name;
    else read.lost = true;
  }
  const size = Number(parts.get('sz') && attributeOf(parts.get('sz')!, '', 'val'));
  const fs = Number.isFinite(size) && size > 0 ? Math.round(size) : FONT_SIZE_DEFAULT;
  if (fs !== FONT_SIZE_DEFAULT)
    read.style.fs = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, fs));
}

function readFill(fill: XmlElement | undefined, sheet: XlsxStylesheet, read: Read) {
  const pattern = fill ? childElements(fill)[0] : undefined;
  if (!pattern) return;
  const type =
    pattern.local === 'patternFill' ? (attributeOf(pattern, '', 'patternType') ?? 'none') : '';
  if (type === 'none') return;
  if (type !== 'solid') {
    read.lost = true;
    return;
  }
  const colour = xlsxColourOf(
    childElements(pattern).find((e) => e.local === 'fgColor'),
    sheet.theme,
  );
  if (colour) read.style.bg = colour;
}

const SIDES = [
  ['left', 'bl'],
  ['right', 'br'],
  ['top', 'bt'],
  ['bottom', 'bb'],
] as const;

function readBorder(border: XmlElement | undefined, sheet: XlsxStylesheet, read: Read) {
  const parts = new Map((border ? childElements(border) : []).map((e) => [e.local, e]));
  for (const [local, key] of SIDES) {
    const side = parts.get(local);
    const kind = side && attributeOf(side, '', 'style');
    if (!kind || kind === 'none') continue;
    const line = READ_BORDERS[kind];
    if (!line) {
      read.lost = true;
      continue;
    }
    const colour = xlsxColourOf(
      childElements(side).find((e) => e.local === 'color'),
      sheet.theme,
    );
    read.style[key] = { ...line, c: colour ?? '#000000' };
  }
  const diagonal = parts.get('diagonal');
  if (diagonal && (attributeOf(diagonal, '', 'style') ?? 'none') !== 'none') read.lost = true;
}

function readAlignment(alignment: XmlElement | undefined, read: Read) {
  const get = (name: string) => (alignment ? attributeOf(alignment, '', name) : undefined);
  const ha = HORIZONTAL[get('horizontal') ?? 'general'];
  if (ha) read.style.ha = ha;
  if (ha === undefined) read.lost = true;
  const va = VERTICAL[get('vertical') ?? 'bottom'];
  if (va) read.style.va = va;
  if (va === undefined) read.lost = true;
  if (['1', 'true'].includes(get('wrapText') ?? '')) read.style.wr = 'w';
  for (const { uri, local, value } of alignment?.attributes ?? []) {
    const plain = ALIGNMENT_DEFAULTS[local];
    const mapped = uri === '' && (READ_ALIGNMENT.has(local) || plain?.includes(value));
    if (!mapped) read.lost = true;
  }
}

function readProtection(protection: XmlElement | undefined, read: Read) {
  for (const [name, plain] of Object.entries(PROTECTION_DEFAULTS)) {
    const value = protection && attributeOf(protection, '', name);
    if (value !== undefined && !plain.includes(value)) read.lost = true;
  }
}

/**
 * A `cellXfs` entry's style against LiveDoc's defaults (D203): what differs is the cell's own; `lost` when it says
 * something the model does not hold (`styles_unread`, D104).
 */
export function xlsxCellStyleOf(
  xf: XmlElement,
  sheet: XlsxStylesheet,
): { style?: CellStyle; lost: boolean } {
  const read: Read = { style: {}, lost: false };
  const index = (name: string) => Number(attributeOf(xf, '', name) ?? 0);
  readFont(sheet.fonts[index('fontId')], sheet, read);
  readFill(sheet.fills[index('fillId')], sheet, read);
  readBorder(sheet.borders[index('borderId')], sheet, read);
  const parts = new Map(childElements(xf).map((e) => [e.local, e]));
  readAlignment(parts.get('alignment'), read);
  readProtection(parts.get('protection'), read);
  // Anything else an entry holds (an extension list) is more than the model reads.
  if ([...parts.keys()].some((local) => local !== 'alignment' && local !== 'protection'))
    read.lost = true;
  return Object.keys(read.style).length > 0
    ? { style: read.style, lost: read.lost }
    : { lost: read.lost };
}

const WRITE_BORDERS: Readonly<Record<BorderStyle, readonly string[]>> = {
  solid: ['thin', 'medium', 'thick'],
  dashed: ['dashed', 'mediumDashed', 'mediumDashed'],
  dotted: ['dotted', 'dotted', 'dotted'],
};

const WRITE_HORIZONTAL = { l: 'left', c: 'center', r: 'right' } as const;
const WRITE_VERTICAL = { t: 'top', m: 'center' } as const;

/** The fonts, fills and borders a written styles part lists, each distinct one once, LiveDoc's defaults first. */
export class XlsxStyleParts {
  private readonly fonts = new Map<string, number>([['', 0]]);
  private readonly fontXml = [
    `<font><sz val="${FONT_SIZE_DEFAULT}"/><name val="${FILE_DEFAULT_FONT}"/></font>`,
  ];
  private readonly fills = new Map<string, number>([['', 0]]);
  private readonly fillXml = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
  ];
  private readonly borders = new Map<string, number>([['', 0]]);
  private readonly borderXml = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];

  /** The font (`fontId`) a style draws its text in: 0, Arial 10, for none of its own. */
  font(style: CellStyle | undefined): number {
    const own: CellStyle = {};
    for (const key of ['b', 'i', 'st', 'u', 'fs', 'fc', 'ff'] as const)
      if (style?.[key] !== undefined) Object.assign(own, { [key]: style[key] });
    return this.listed(this.fonts, this.fontXml, cellStyleKey(own), () => {
      const family = own.ff ? fontFamilyName(own.ff) : FILE_DEFAULT_FONT;
      return (
        '<font>' +
        (own.b ? '<b/>' : '') +
        (own.i ? '<i/>' : '') +
        (own.st ? '<strike/>' : '') +
        (own.u ? '<u/>' : '') +
        `<sz val="${own.fs ?? FONT_SIZE_DEFAULT}"/>` +
        (own.fc ? xlsxColourXml('color', own.fc) : '') +
        `<name val="${escapeXmlAttribute(family)}"/></font>`
      );
    });
  }

  /** The fill (`fillId`) of a style's fill colour: 0 for none. */
  fill(style: CellStyle | undefined): number {
    const bg = style?.bg;
    if (!bg) return 0;
    return (
      this.listed(
        this.fills,
        this.fillXml,
        bg,
        () =>
          `<fill><patternFill patternType="solid">${xlsxColourXml('fgColor', bg)}<bgColor indexed="64"/></patternFill></fill>`,
      ) + 1
    );
  }

  /** The border (`borderId`) of a style's four sides: 0 for none. */
  border(style: CellStyle | undefined): number {
    const own: CellStyle = {};
    for (const [, key] of SIDES) if (style?.[key]) Object.assign(own, { [key]: style[key] });
    return this.listed(this.borders, this.borderXml, cellStyleKey(own), () => {
      const sides = SIDES.map(([local, key]) => {
        const b = own[key];
        return b
          ? `<${local} style="${WRITE_BORDERS[b.s][b.w - 1]}">${xlsxColourXml('color', b.c)}</${local}>`
          : `<${local}/>`;
      });
      return `<border>${sides.join('')}<diagonal/></border>`;
    });
  }

  /** A style's alignment: the grid's middle for none (D204), Bottom as the file's default, Clip as Overflow (D205). */
  alignment(style: CellStyle | undefined): string {
    const attrs: string[] = [];
    if (style?.ha) attrs.push(`horizontal="${WRITE_HORIZONTAL[style.ha]}"`);
    const va = style?.va ?? 'm';
    if (va !== 'b') attrs.push(`vertical="${WRITE_VERTICAL[va]}"`);
    if (style?.wr === 'w') attrs.push('wrapText="1"');
    return `<alignment ${attrs.join(' ')}/>`;
  }

  /** The three lists, each with its count. */
  xml(): { fonts: string; fills: string; borders: string } {
    const list = (name: string, items: readonly string[]) =>
      `<${name} count="${items.length}">${items.join('')}</${name}>`;
    return {
      fonts: list('fonts', this.fontXml),
      fills: list('fills', this.fillXml),
      borders: list('borders', this.borderXml),
    };
  }

  // Each entry's index in its list, made the first time its key is asked for.
  private listed(
    index: Map<string, number>,
    xml: string[],
    key: string,
    make: () => string,
  ): number {
    const known = index.get(key);
    if (known !== undefined) return known;
    index.set(key, index.size);
    xml.push(make());
    return index.size - 1;
  }
}
