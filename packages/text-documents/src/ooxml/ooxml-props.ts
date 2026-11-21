// WordprocessingML properties (standard-mapping.md "What the model holds"): `w:rPr`, `w:pPr`, `w:sectPr` and list
// levels read into the model's values and written from them, kept children merged back in the schema's order.
import {
  attributeOf,
  childElement,
  childElements,
  colourToOoxml,
  escapeXmlAttribute,
  halfPointsToPt,
  OOXML_HIGHLIGHTS,
  ooxmlColour,
  ooxmlHighlightName,
  ptToHalfPoints,
  ptToTwips,
  round3,
  twipsToPt,
  type KeptXml,
  type XmlElement,
} from '@livedoc/office-packages';
import { CHECK_MARKS, LIST_LEVELS, type ListLevel, type NumberFormat } from '../model/lists';
import { compact, type ParagraphProps, type TextProps } from '../model/props';
import type { PageSetup, SectionStart } from '../model/sections';
import { HEADER_FOOTER_MARGIN_PT } from '../model/headers';
import { LIVEDOC_NS } from '../odf/odf-names';
import { SECTPR_ORDER, W_NS } from './ooxml-names';
import { bordersXml, readBorders, readShading, shadingXml } from './ooxml-borders';
import { ownTabStops, readTabEntries, tabsXml } from './ooxml-tabs';
import type { TabStop } from '../model/tab-stops';

const val = (e: XmlElement | undefined) => (e ? attributeOf(e, W_NS, 'val') : undefined);
const child = (e: XmlElement | undefined, local: string) =>
  e ? childElement(e, W_NS, local) : undefined;
// An ST_OnOff attribute: absent is `absent`; "0", "false" and "off" are off.
const onOffOf = (value: string | undefined, absent: boolean): boolean =>
  value === undefined ? absent : !['0', 'false', 'off'].includes(value);
const ownMargin = (pt: number | undefined) => (pt === HEADER_FOOTER_MARGIN_PT ? undefined : pt);
const wAttr = (e: XmlElement | undefined, local: string) =>
  e ? attributeOf(e, W_NS, local) : undefined;

/** An `ST_OnOff` toggle: present is on, unless its value says off. */
export function toggle(e: XmlElement | undefined): boolean | undefined {
  if (!e) return undefined;
  const v = val(e);
  return !(v === '0' || v === 'false' || v === 'off');
}

export const MAPPED_RPR = new Set([
  'rStyle',
  'rFonts',
  'b',
  'i',
  'caps',
  'smallCaps',
  'strike',
  'color',
  'sz',
  'highlight',
  'u',
  'shd',
  'vertAlign',
]);

/** Text properties and the character style of a `w:rPr`. */
export function readRunProps(rPr: XmlElement | undefined): { style?: string; props: TextProps } {
  if (!rPr) return { props: {} };
  const fonts = child(rPr, 'rFonts');
  const underline = val(child(rPr, 'u'));
  const vertical = val(child(rPr, 'vertAlign'));
  const highlight = val(child(rPr, 'highlight'));
  const shade = wAttr(child(rPr, 'shd'), 'fill');
  return compact({
    style: val(child(rPr, 'rStyle')),
    props: compact({
      font: wAttr(fonts, 'ascii') ?? wAttr(fonts, 'hAnsi'),
      size: halfPointsToPt(val(child(rPr, 'sz'))),
      bold: toggle(child(rPr, 'b')),
      italic: toggle(child(rPr, 'i')),
      underline: underline === undefined ? undefined : underline !== 'none',
      strike: toggle(child(rPr, 'strike')),
      vertical:
        vertical === 'superscript'
          ? 'super'
          : vertical === 'subscript'
            ? 'sub'
            : vertical === 'baseline'
              ? 'baseline'
              : undefined,
      color: ooxmlColour(val(child(rPr, 'color'))),
      highlight: highlight !== undefined ? OOXML_HIGHLIGHTS[highlight] : ooxmlColour(shade),
      smallCaps: toggle(child(rPr, 'smallCaps')),
      transform:
        toggle(child(rPr, 'caps')) === undefined
          ? undefined
          : toggle(child(rPr, 'caps'))
            ? 'uppercase'
            : 'none',
    } satisfies TextProps),
  });
}

const tag = (local: string, attrs: Record<string, string | undefined> = {}) =>
  `<w:${local}${Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${escapeXmlAttribute(v!)}"`)
    .join('')}/>`;

const on = (local: string, b: boolean | undefined) =>
  b === undefined ? undefined : b ? tag(local) : tag(local, { 'w:val': '0' });

/** The local name a kept property element starts with. */
export const localOf = (kept: KeptXml): string =>
  kept.xml.match(/^<(?:[\w.-]+:)?([\w.-]+)/)?.[1] ?? '';

/** Mapped children and kept ones, merged in the schema's order. */
export function ordered(
  order: readonly string[],
  mapped: Record<string, string | undefined>,
  kept: readonly string[],
): string {
  const items = [
    ...Object.entries(mapped)
      .filter(([, xml]) => xml !== undefined)
      .map(([local, xml]) => ({ local, xml: xml! })),
    ...kept.map((xml) => ({ local: xml.match(/^<(?:[\w.-]+:)?([\w.-]+)/)?.[1] ?? '', xml })),
  ];
  const at = (local: string) => {
    const i = order.indexOf(local);
    return i === -1 ? order.length : i;
  };
  return items
    .map((item, i) => ({ ...item, i }))
    .sort((a, b) => at(a.local) - at(b.local) || a.i - b.i)
    .map((item) => item.xml)
    .join('');
}

/** The mapped `w:rPr` children for these values. */
export function runPropsChildren(
  style: string | undefined,
  t: TextProps,
): Record<string, string | undefined> {
  const highlightName = t.highlight === undefined ? undefined : ooxmlHighlightName(t.highlight);
  return {
    rStyle: style === undefined ? undefined : tag('rStyle', { 'w:val': style }),
    rFonts:
      t.font === undefined
        ? undefined
        : tag('rFonts', { 'w:ascii': t.font, 'w:hAnsi': t.font, 'w:cs': t.font }),
    b: on('b', t.bold),
    i: on('i', t.italic),
    caps: t.transform === undefined ? undefined : on('caps', t.transform === 'uppercase'),
    smallCaps: on('smallCaps', t.smallCaps),
    strike: on('strike', t.strike),
    color: t.color === undefined ? undefined : tag('color', { 'w:val': colourToOoxml(t.color) }),
    sz: t.size === undefined ? undefined : tag('sz', { 'w:val': ptToHalfPoints(t.size) }),
    highlight:
      highlightName === undefined ? undefined : tag('highlight', { 'w:val': highlightName }),
    u:
      t.underline === undefined
        ? undefined
        : tag('u', { 'w:val': t.underline ? 'single' : 'none' }),
    shd:
      t.highlight !== undefined && highlightName === undefined
        ? tag('shd', { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': colourToOoxml(t.highlight) })
        : undefined,
    vertAlign:
      t.vertical === undefined
        ? undefined
        : tag('vertAlign', {
            'w:val':
              t.vertical === 'super'
                ? 'superscript'
                : t.vertical === 'sub'
                  ? 'subscript'
                  : 'baseline',
          }),
  };
}

export const MAPPED_PPR = new Set([
  'pStyle',
  'keepNext',
  'keepLines',
  'pageBreakBefore',
  'widowControl',
  'numPr',
  'pBdr',
  'shd',
  'tabs',
  'spacing',
  'ind',
  'jc',
  'outlineLvl',
  'sectPr',
]);

const JC_IN: Record<string, ParagraphProps['align']> = {
  left: 'start',
  start: 'start',
  center: 'center',
  right: 'end',
  end: 'end',
  both: 'justify',
  distribute: 'justify',
};
const JC_OUT: Record<NonNullable<ParagraphProps['align']>, string> = {
  start: 'left',
  center: 'center',
  end: 'right',
  justify: 'both',
};

/**
 * Paragraph properties of a `w:pPr` (lists and sections are read apart); its tab stops over those it inherits, with
 * `dropped` naming what reads as no stop.
 */
export function readParagraphProps(
  pPr: XmlElement | undefined,
  inheritedTabs: readonly TabStop[] = [],
  dropped: (name: string) => void = () => {},
): ParagraphProps {
  if (!pPr) return {};
  const spacing = child(pPr, 'spacing');
  const ind = child(pPr, 'ind');
  const line = Number(wAttr(spacing, 'line'));
  const rule = wAttr(spacing, 'lineRule') ?? 'auto';
  const hanging = twipsToPt(wAttr(ind, 'hanging'));
  const outline = Number(val(child(pPr, 'outlineLvl')));
  return compact({
    align: JC_IN[val(child(pPr, 'jc')) ?? ''],
    indentStart: twipsToPt(wAttr(ind, 'left') ?? wAttr(ind, 'start')),
    indentEnd: twipsToPt(wAttr(ind, 'right') ?? wAttr(ind, 'end')),
    indentFirst: hanging !== undefined ? 0 - hanging : twipsToPt(wAttr(ind, 'firstLine')),
    spaceBefore: twipsToPt(wAttr(spacing, 'before')),
    spaceAfter: twipsToPt(wAttr(spacing, 'after')),
    lineHeight:
      Number.isFinite(line) && line > 0
        ? rule === 'auto'
          ? { rule: 'multiple' as const, value: round3(line / 240) }
          : {
              rule: rule === 'exact' ? ('exact' as const) : ('atLeast' as const),
              pt: round3(line / 20),
            }
        : undefined,
    keepWithNext: toggle(child(pPr, 'keepNext')),
    keepTogether: toggle(child(pPr, 'keepLines')),
    widowControl: toggle(child(pPr, 'widowControl')),
    pageBreakBefore: toggle(child(pPr, 'pageBreakBefore')),
    outlineLevel:
      Number.isInteger(outline) && outline >= 0 && outline <= 9
        ? outline === 9
          ? 0
          : outline + 1
        : undefined,
    borders: readBorders(pPr),
    shading: readShading(pPr),
    tabStops: ownTabStops(inheritedTabs, readTabEntries(pPr, dropped)),
  });
}

/** The mapped `w:pPr` children for these values (the style, list and section given apart). */
export function paragraphPropsChildren(
  style: string | undefined,
  p: ParagraphProps,
  list: { id: string; level: number } | undefined,
  sectPr: string | undefined,
  inheritedTabs: readonly TabStop[] = [],
): Record<string, string | undefined> {
  const line = p.lineHeight;
  const spacing = compact({
    'w:before': p.spaceBefore === undefined ? undefined : ptToTwips(p.spaceBefore),
    'w:after': p.spaceAfter === undefined ? undefined : ptToTwips(p.spaceAfter),
    'w:line':
      line === undefined
        ? undefined
        : line.rule === 'multiple'
          ? String(Math.round(line.value * 240))
          : ptToTwips(line.pt),
    'w:lineRule': line === undefined ? undefined : line.rule === 'multiple' ? 'auto' : line.rule,
  });
  const first = p.indentFirst;
  const ind = compact({
    'w:left': p.indentStart === undefined ? undefined : ptToTwips(p.indentStart),
    'w:right': p.indentEnd === undefined ? undefined : ptToTwips(p.indentEnd),
    'w:firstLine': first !== undefined && first >= 0 ? ptToTwips(first) : undefined,
    'w:hanging': first !== undefined && first < 0 ? ptToTwips(-first) : undefined,
  });
  return {
    pStyle: style === undefined ? undefined : tag('pStyle', { 'w:val': style }),
    keepNext: on('keepNext', p.keepWithNext),
    keepLines: on('keepLines', p.keepTogether),
    pageBreakBefore: on('pageBreakBefore', p.pageBreakBefore),
    widowControl: on('widowControl', p.widowControl),
    numPr: list
      ? `<w:numPr>${tag('ilvl', { 'w:val': String(list.level) })}${tag('numId', { 'w:val': list.id })}</w:numPr>`
      : undefined,
    pBdr: bordersXml(p.borders),
    shd: shadingXml(p.shading),
    tabs: tabsXml(inheritedTabs, p.tabStops),
    spacing: Object.keys(spacing).length > 0 ? tag('spacing', spacing) : undefined,
    ind: Object.keys(ind).length > 0 ? tag('ind', ind) : undefined,
    jc: p.align === undefined ? undefined : tag('jc', { 'w:val': JC_OUT[p.align] }),
    outlineLvl:
      p.outlineLevel === undefined
        ? undefined
        : tag('outlineLvl', { 'w:val': String(p.outlineLevel === 0 ? 9 : p.outlineLevel - 1) }),
    sectPr,
  };
}

const START_IN: Record<string, SectionStart> = {
  nextPage: 'next-page',
  continuous: 'continuous',
  evenPage: 'even-page',
  oddPage: 'odd-page',
  nextColumn: 'continuous',
};
const START_OUT: Record<SectionStart, string> = {
  'next-page': 'nextPage',
  continuous: 'continuous',
  'even-page': 'evenPage',
  'odd-page': 'oddPage',
};

/** A section's start and setup from its `w:sectPr`; the page colour is the document's `w:background`. */
export function readSection(
  sectPr: XmlElement,
  pageColor: string | undefined,
  onUnequal: () => void = () => {},
): { start: SectionStart; setup: PageSetup } {
  const size = child(sectPr, 'pgSz');
  const margin = child(sectPr, 'pgMar');
  const cols = child(sectPr, 'cols');
  const count = Number(wAttr(cols, 'num'));
  // Columns of their own widths read as equal (page-layout.md "Columns").
  if (count > 1 && !onOffOf(wAttr(cols, 'equalWidth'), true)) onUnequal();
  return {
    start: START_IN[val(child(sectPr, 'type')) ?? 'nextPage'] ?? 'next-page',
    setup: compact({
      width: twipsToPt(wAttr(size, 'w')) ?? 612,
      height: twipsToPt(wAttr(size, 'h')) ?? 792,
      orientation:
        wAttr(size, 'orient') === 'landscape' ? ('landscape' as const) : ('portrait' as const),
      margins: {
        top: twipsToPt(wAttr(margin, 'top')) ?? 72,
        bottom: twipsToPt(wAttr(margin, 'bottom')) ?? 72,
        left: twipsToPt(wAttr(margin, 'left')) ?? 72,
        right: twipsToPt(wAttr(margin, 'right')) ?? 72,
        // A header or footer margin at the default is none, as a new document has it.
        ...compact({
          header: ownMargin(twipsToPt(wAttr(margin, 'header'))),
          footer: ownMargin(twipsToPt(wAttr(margin, 'footer'))),
        }),
      },
      pageColor,
      columns:
        count > 1
          ? compact({
              count,
              gap: twipsToPt(wAttr(cols, 'space')) ?? 36,
              separator: onOffOf(wAttr(cols, 'sep'), false) ? (true as const) : undefined,
            })
          : undefined,
    }),
  };
}

export const MAPPED_SECTPR = new Set([
  'type',
  'pgSz',
  'pgMar',
  'cols',
  'headerReference',
  'footerReference',
  'titlePg',
]);

/**
 * A `w:sectPr` for a section, its kept children merged in, its header and footer references (`references`, written
 * first) and `w:titlePg` when the first page has its own; the gutter carried from `keptXml`.
 */
export function sectionXml(
  start: SectionStart,
  setup: PageSetup,
  kept: readonly string[],
  keptXml?: string,
  { references = '', titlePage = false }: { references?: string; titlePage?: boolean } = {},
): string {
  const carried = (name: string) =>
    keptXml?.match(new RegExp(`<(?:\\w+:)?pgMar[^>]*\\s(?:\\w+:)?${name}="(-?\\d+)"`))?.[1];
  const m = setup.margins;
  return `<w:sectPr>${ordered(
    SECTPR_ORDER,
    {
      headerReference: references || undefined,
      titlePg: titlePage ? '<w:titlePg/>' : undefined,
      type: start === 'next-page' ? undefined : tag('type', { 'w:val': START_OUT[start] }),
      pgSz: tag('pgSz', {
        'w:w': ptToTwips(setup.width),
        'w:h': ptToTwips(setup.height),
        'w:orient': setup.orientation === 'landscape' ? 'landscape' : undefined,
      }),
      pgMar: tag('pgMar', {
        'w:top': ptToTwips(m.top),
        'w:right': ptToTwips(m.right),
        'w:bottom': ptToTwips(m.bottom),
        'w:left': ptToTwips(m.left),
        'w:header': ptToTwips(m.header ?? HEADER_FOOTER_MARGIN_PT),
        'w:footer': ptToTwips(m.footer ?? HEADER_FOOTER_MARGIN_PT),
        'w:gutter': carried('gutter') ?? '0',
      }),
      cols:
        setup.columns && setup.columns.count > 1
          ? tag('cols', {
              'w:num': String(setup.columns.count),
              'w:space': ptToTwips(setup.columns.gap),
              'w:sep': setup.columns.separator ? '1' : undefined,
            })
          : undefined,
    },
    kept,
  )}</w:sectPr>`;
}

const FORMAT_IN: Record<string, NumberFormat> = {
  decimal: 'decimal',
  lowerLetter: 'lower-letter',
  upperLetter: 'upper-letter',
  lowerRoman: 'lower-roman',
  upperRoman: 'upper-roman',
};
const FORMAT_OUT: Record<NumberFormat, string> = {
  decimal: 'decimal',
  'lower-letter': 'lowerLetter',
  'upper-letter': 'upperLetter',
  'lower-roman': 'lowerRoman',
  'upper-roman': 'upperRoman',
};

/** One list level from its `w:lvl`. */
export function readLevel(lvl: XmlElement): ListLevel {
  const ind = child(child(lvl, 'pPr'), 'ind');
  const indents = compact({
    indent: twipsToPt(wAttr(ind, 'left') ?? wAttr(ind, 'start')),
    hanging: twipsToPt(wAttr(ind, 'hanging')),
  });
  const format = val(child(lvl, 'numFmt')) ?? 'decimal';
  const text = val(child(lvl, 'lvlText')) ?? '';
  if (format === 'bullet' || format === 'none' || !FORMAT_IN[format]) {
    if (text === CHECK_MARKS.open || text === CHECK_MARKS.done)
      return {
        kind: 'check',
        ...(attributeOf(lvl, LIVEDOC_NS, 'strike-checked') === 'false'
          ? { strikeChecked: false as const }
          : {}),
        ...indents,
      };
    return { kind: 'bullet', bullet: text, ...indents };
  }
  return {
    kind: 'number',
    format: FORMAT_IN[format],
    label: text,
    start: Number(val(child(lvl, 'start')) ?? '1') || 1,
    ...indents,
  };
}

/** Nine levels of an abstract numbering, with a `w:num`'s overrides. */
export function readLevels(abstractNum: XmlElement | undefined, num: XmlElement): ListLevel[] {
  const levels: ListLevel[] = Array.from({ length: LIST_LEVELS }, () => ({
    kind: 'bullet',
    bullet: '•',
  }));
  for (const lvl of abstractNum
    ? childElements(abstractNum).filter((c) => c.local === 'lvl')
    : []) {
    const at = Number(wAttr(lvl, 'ilvl'));
    if (at >= 0 && at < LIST_LEVELS) levels[at] = readLevel(lvl);
  }
  for (const override of childElements(num).filter((c) => c.local === 'lvlOverride')) {
    const at = Number(wAttr(override, 'ilvl'));
    if (!(at >= 0 && at < LIST_LEVELS)) continue;
    const lvl = child(override, 'lvl');
    if (lvl) levels[at] = readLevel(lvl);
    const start = Number(val(child(override, 'startOverride')));
    const level = levels[at]!;
    if (start >= 0 && level.kind === 'number') levels[at] = { ...level, start };
  }
  return levels;
}

/** A `w:abstractNum` for nine levels. */
export function abstractNumXml(id: string, levels: readonly ListLevel[]): string {
  const lvl = (level: ListLevel, at: number) => {
    const indent = level.indent ?? 36 * (at + 1);
    const hanging = level.hanging ?? 18;
    const pPr = `<w:pPr>${tag('ind', { 'w:left': ptToTwips(indent), 'w:hanging': ptToTwips(hanging) })}</w:pPr>`;
    if (level.kind === 'number')
      return `<w:lvl w:ilvl="${at}">${tag('start', { 'w:val': String(level.start) })}${tag('numFmt', { 'w:val': FORMAT_OUT[level.format] })}${tag('lvlText', { 'w:val': level.label })}${tag('lvlJc', { 'w:val': 'left' })}${pPr}</w:lvl>`;
    const bullet = level.kind === 'check' ? CHECK_MARKS.open : level.bullet;
    const plain = level.kind === 'check' && level.strikeChecked === false;
    return `<w:lvl w:ilvl="${at}"${plain ? ' livedoc:strike-checked="false"' : ''}>${tag('start', { 'w:val': '1' })}${tag('numFmt', { 'w:val': 'bullet' })}${tag('lvlText', { 'w:val': bullet })}${tag('lvlJc', { 'w:val': 'left' })}${pPr}</w:lvl>`;
  };
  return `<w:abstractNum w:abstractNumId="${escapeXmlAttribute(id)}">${tag('multiLevelType', { 'w:val': 'hybridMultilevel' })}${levels.map(lvl).join('')}</w:abstractNum>`;
}
