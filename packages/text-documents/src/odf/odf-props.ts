// ODF formatting properties (standard-mapping.md "What the model holds"): `style:paragraph-properties`,
// `style:text-properties` and `style:page-layout-properties` read into the model's values and written from them,
// attributes in a fixed order.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  fractionToOdfPercent,
  odfColour,
  odfLengthToPt,
  odfPercent,
  ptToOdf,
  type XmlElement,
} from '@livedoc/office-packages';
import {
  compact,
  type BorderDash,
  type BorderLine,
  type ParagraphBorders,
  type ParagraphProps,
  type TextProps,
} from '../model/props';
import type { Columns, PageSetup } from '../model/sections';
import { TabStops, type TabAlign, type TabLeader, type TabStop } from '../model/tab-stops';
import { NS } from './odf-names';

const fo = (e: XmlElement, local: string) => attributeOf(e, NS.fo, local);
const st = (e: XmlElement, local: string) => attributeOf(e, NS.style, local);

const ALIGN_IN: Record<string, ParagraphProps['align']> = {
  start: 'start',
  left: 'start',
  center: 'center',
  end: 'end',
  right: 'end',
  justify: 'justify',
};

const keep = (value: string | undefined) =>
  value === 'always' ? true : value === 'auto' ? false : undefined;

function widowControl(e: XmlElement): boolean | undefined {
  const widows = fo(e, 'widows');
  const orphans = fo(e, 'orphans');
  if (widows === '2' && orphans === '2') return true;
  if (widows === '0' && orphans === '0') return false;
  return undefined;
}

function lineHeight(e: XmlElement): ParagraphProps['lineHeight'] {
  const atLeast = odfLengthToPt(st(e, 'line-height-at-least'));
  if (atLeast !== undefined) return { rule: 'atLeast', pt: atLeast };
  const value = fo(e, 'line-height');
  const multiple = odfPercent(value);
  if (multiple !== undefined) return { rule: 'multiple', value: multiple };
  const exact = odfLengthToPt(value);
  return exact === undefined ? undefined : { rule: 'exact', pt: exact };
}

// Borders (standard-mapping.md "The model"): `fo:border-<side>` over `fo:border`, each `<width> <style> <colour>` in
// any order; a style the model has no dash for reads as solid. ODF has no line between paragraphs.
const ODF_SIDES = ['top', 'bottom', 'left', 'right'] as const;

function dashOf(style: string): BorderDash | null {
  if (style === 'none' || style === 'hidden') return null;
  if (style === 'dotted') return 'dotted';
  return style.includes('dash') ? 'dashed' : 'solid';
}

/** One `fo:border` value (`<width> <style> <colour>` in any order) as a line, its padding from `padding`. */
export function borderLine(
  value: string | undefined,
  padding: string | undefined,
): BorderLine | undefined {
  if (!value) return undefined;
  let width: number | undefined;
  let dash: BorderDash | null = 'solid';
  let color = '#000000';
  for (const token of value.trim().split(/\s+/)) {
    const length = odfLengthToPt(token);
    if (length !== undefined) width = length;
    else if (odfColour(token)) color = odfColour(token)!;
    else dash = dashOf(token);
  }
  if (dash === null || !width) return undefined;
  return { width, dash, color, space: odfLengthToPt(padding) ?? 0 };
}

function readBorders(e: XmlElement): ParagraphBorders | undefined {
  const borders: Record<string, BorderLine> = {};
  let named = false;
  for (const side of ODF_SIDES) {
    const value = fo(e, `border-${side}`) ?? fo(e, 'border');
    named ||= value !== undefined;
    const line = borderLine(value, fo(e, `padding-${side}`) ?? fo(e, 'padding'));
    if (line) borders[side] = line;
  }
  return named ? borders : undefined;
}

// Tab stops (standard-mapping.md "The model"): `style:tab-stop` positions as the file counts them; the reader
// moves them to the text area's start where the file counts from the indent.
const TAB_TYPE_IN: Record<string, TabAlign> = {
  left: 'start',
  center: 'center',
  right: 'end',
  char: 'decimal',
};
const TAB_TYPE_OUT: Record<TabAlign, string> = {
  start: 'left',
  center: 'center',
  end: 'right',
  decimal: 'char',
};
const LEADER_IN: Record<string, TabLeader> = {
  '.': 'dot',
  '-': 'hyphen',
  _: 'underscore',
  '\u00b7': 'middle-dot',
};
const LEADER_STYLE_IN: Record<string, TabLeader> = {
  dotted: 'dot',
  dash: 'hyphen',
  solid: 'underscore',
};
const LEADER_OUT: Record<TabLeader, { style: string; text: string }> = {
  dot: { style: 'dotted', text: '.' },
  hyphen: { style: 'dash', text: '-' },
  underscore: { style: 'solid', text: '_' },
  'middle-dot': { style: 'dotted', text: '\u00b7' },
};

function leaderOf(e: XmlElement): TabLeader | undefined {
  const text = st(e, 'leader-text');
  const style = st(e, 'leader-style');
  if (text !== undefined && text.trim() !== '') return LEADER_IN[text] ?? 'dot';
  return style === undefined || style === 'none' ? undefined : (LEADER_STYLE_IN[style] ?? 'dot');
}

/** A paragraph-properties' tab stops: none when it names none, an empty list for an empty `style:tab-stops`. */
function readTabStops(e: XmlElement, dropped: (count: number) => void): TabStop[] | undefined {
  const list = childElement(e, NS.style, 'tab-stops');
  if (!list) return undefined;
  const stops: TabStop[] = [];
  let unread = 0;
  for (const stop of childElements(list)) {
    const position = odfLengthToPt(st(stop, 'position'));
    if (position === undefined) {
      unread += 1;
      continue;
    }
    const align = TAB_TYPE_IN[st(stop, 'type') ?? 'left'] ?? 'start';
    const char = st(stop, 'char');
    stops.push(
      compact({
        position,
        align,
        leader: leaderOf(stop),
        char: align === 'decimal' && char && char !== '.' ? char : undefined,
      }),
    );
  }
  const read = TabStops.normalise(stops);
  if (read.dropped + unread > 0) dropped(read.dropped + unread);
  return read.stops;
}

/** `style:tab-stops` for a list; nothing when the paragraph has none of its own. */
export function tabStopsXml(stops: readonly TabStop[] | undefined): string {
  if (!stops) return '';
  if (stops.length === 0) return '<style:tab-stops/>';
  const each = stops.map((s) => {
    const leader = s.leader && LEADER_OUT[s.leader];
    return `<style:tab-stop${attr('style:position', ptToOdf(s.position))}${attr('style:type', TAB_TYPE_OUT[s.align])}${attr('style:char', s.align === 'decimal' ? (s.char ?? '.') : undefined)}${attr('style:leader-style', leader?.style)}${attr('style:leader-text', leader?.text)}/>`;
  });
  return `<style:tab-stops>${each.join('')}</style:tab-stops>`;
}

/** The paragraph properties of a style's `style:paragraph-properties`; `dropped` counts tab stops left out. */
export function readParagraphProps(
  style: XmlElement,
  dropped: (count: number) => void = () => {},
): ParagraphProps {
  const e = childElement(style, NS.style, 'paragraph-properties');
  if (!e) return {};
  const breakBefore = fo(e, 'break-before');
  return compact({
    align: ALIGN_IN[fo(e, 'text-align') ?? ''],
    indentStart: odfLengthToPt(fo(e, 'margin-left')),
    indentEnd: odfLengthToPt(fo(e, 'margin-right')),
    indentFirst: odfLengthToPt(fo(e, 'text-indent')),
    spaceBefore: odfLengthToPt(fo(e, 'margin-top')),
    spaceAfter: odfLengthToPt(fo(e, 'margin-bottom')),
    lineHeight: lineHeight(e),
    keepWithNext: keep(fo(e, 'keep-with-next')),
    keepTogether: keep(fo(e, 'keep-together')),
    widowControl: widowControl(e),
    pageBreakBefore: breakBefore === 'page' ? true : breakBefore === 'auto' ? false : undefined,
    columnBreakBefore: breakBefore === 'column' ? true : undefined,
    borders: readBorders(e),
    shading: odfColour(fo(e, 'background-color')),
    tabStops: readTabStops(e, dropped),
    tabInterval: odfLengthToPt(st(e, 'tab-stop-distance')),
  });
}

const flag = (value: string | undefined, on: (v: string) => boolean, off: string) =>
  value === undefined ? undefined : value === off ? false : on(value) ? true : undefined;

function vertical(value: string | undefined): TextProps['vertical'] {
  const first = value?.trim().split(/\s+/)[0];
  if (first === undefined) return undefined;
  if (first === 'super') return 'super';
  if (first === 'sub') return 'sub';
  const n = Number.parseFloat(first);
  if (Number.isNaN(n)) return undefined;
  return n > 0 ? 'super' : n < 0 ? 'sub' : 'baseline';
}

const TRANSFORMS = new Set(['uppercase', 'lowercase', 'capitalize', 'none']);

/** The text properties of a style's `style:text-properties`; fonts named by face resolve to their family. */
export function readTextProps(style: XmlElement, faces: ReadonlyMap<string, string>): TextProps {
  const e = childElement(style, NS.style, 'text-properties');
  if (!e) return {};
  const faceName = st(e, 'font-name');
  const family = fo(e, 'font-family');
  const weight = fo(e, 'font-weight');
  const transform = fo(e, 'text-transform');
  const background = fo(e, 'background-color');
  return compact({
    font: faceName !== undefined ? (faces.get(faceName) ?? faceName) : family && unquote(family),
    size: odfLengthToPt(fo(e, 'font-size')),
    bold: weight === undefined ? undefined : weight === 'bold' || Number(weight) >= 600,
    italic: flag(fo(e, 'font-style'), (s) => s === 'italic' || s === 'oblique', 'normal'),
    underline: flag(st(e, 'text-underline-style'), () => true, 'none'),
    strike: flag(st(e, 'text-line-through-style'), () => true, 'none'),
    vertical: vertical(st(e, 'text-position')),
    color: odfColour(fo(e, 'color')),
    highlight: odfColour(background),
    smallCaps: flag(fo(e, 'font-variant'), (v) => v === 'small-caps', 'normal'),
    transform: TRANSFORMS.has(transform ?? '') ? (transform as TextProps['transform']) : undefined,
  });
}

/** A font family as ODF lists it, without its quotes. */
export const unquote = (family: string): string => family.trim().replace(/^(['"])(.*)\1$/, '$2');

const attr = (name: string, value: string | undefined) =>
  value === undefined ? '' : ` ${name}="${escapeXmlAttribute(value)}"`;

const length = (pt: number | undefined) => (pt === undefined ? undefined : ptToOdf(pt));
const always = (b: boolean | undefined) => (b === undefined ? undefined : b ? 'always' : 'auto');

const ALIGN_OUT: Record<NonNullable<ParagraphProps['align']>, string> = {
  start: 'start',
  center: 'center',
  end: 'end',
  justify: 'justify',
};

const ODF_DASH: Record<BorderDash, string> = { solid: 'solid', dotted: 'dotted', dashed: 'dashed' };

/** A line as one `fo:border` value. */
export const borderValue = (line: BorderLine): string =>
  `${ptToOdf(line.width)} ${ODF_DASH[line.dash]} ${line.color}`;

// Every side once any is set, `none` where absent, so a paragraph's borders replace its style's whole.
function bordersXml(borders: ParagraphBorders | undefined): string {
  if (!borders) return '';
  return ODF_SIDES.map((side) => {
    const line = borders[side];
    return line
      ? attr(`fo:border-${side}`, borderValue(line)) +
          attr(`fo:padding-${side}`, ptToOdf(line.space))
      : attr(`fo:border-${side}`, 'none');
  }).join('');
}

/** `style:paragraph-properties` for these values, or nothing when there are none. */
export function paragraphPropsXml(p: ParagraphProps, extra = ''): string {
  const line = p.lineHeight;
  const attrs = [
    attr('fo:margin-left', length(p.indentStart)),
    attr('fo:margin-right', length(p.indentEnd)),
    attr('fo:text-indent', length(p.indentFirst)),
    attr('fo:margin-top', length(p.spaceBefore)),
    attr('fo:margin-bottom', length(p.spaceAfter)),
    attr('fo:text-align', p.align && ALIGN_OUT[p.align]),
    attr(
      'fo:line-height',
      line?.rule === 'multiple'
        ? fractionToOdfPercent(line.value)
        : line?.rule === 'exact'
          ? ptToOdf(line.pt)
          : undefined,
    ),
    attr('style:line-height-at-least', line?.rule === 'atLeast' ? ptToOdf(line.pt) : undefined),
    attr('fo:keep-with-next', always(p.keepWithNext)),
    attr('fo:keep-together', always(p.keepTogether)),
    attr('fo:widows', p.widowControl === undefined ? undefined : p.widowControl ? '2' : '0'),
    attr('fo:orphans', p.widowControl === undefined ? undefined : p.widowControl ? '2' : '0'),
    attr('fo:break-before', breakBeforeOf(p)),
    bordersXml(p.borders),
    attr('fo:background-color', p.shading),
    attr('style:tab-stop-distance', length(p.tabInterval)),
  ].join('');
  const children = tabStopsXml(p.tabStops) + extra;
  if (children)
    return `<style:paragraph-properties${attrs}>${children}</style:paragraph-properties>`;
  return attrs ? `<style:paragraph-properties${attrs}/>` : '';
}

const bool = (b: boolean | undefined, on: string, off: string) =>
  b === undefined ? undefined : b ? on : off;

/** `style:text-properties` for these values, fonts named by their face; nothing when there are none. */
export function textPropsXml(t: TextProps): string {
  const attrs = [
    attr('style:font-name', t.font),
    attr('fo:font-size', length(t.size)),
    attr('fo:font-weight', bool(t.bold, 'bold', 'normal')),
    attr('fo:font-style', bool(t.italic, 'italic', 'normal')),
    attr('style:text-underline-style', bool(t.underline, 'solid', 'none')),
    attr('style:text-underline-width', t.underline ? 'auto' : undefined),
    attr('style:text-underline-color', t.underline ? 'font-color' : undefined),
    attr('style:text-line-through-style', bool(t.strike, 'solid', 'none')),
    attr(
      'style:text-position',
      t.vertical === undefined
        ? undefined
        : t.vertical === 'super'
          ? 'super 58%'
          : t.vertical === 'sub'
            ? 'sub 58%'
            : '0% 100%',
    ),
    attr('fo:color', t.color),
    attr('fo:background-color', t.highlight),
    attr('fo:font-variant', bool(t.smallCaps, 'small-caps', 'normal')),
    attr('fo:text-transform', t.transform),
  ].join('');
  return attrs ? `<style:text-properties${attrs}/>` : '';
}

// One `fo:break-before` holds both breaks: a page break wins, then a column break; "auto" where either is set off.
const breakBeforeOf = (p: ParagraphProps): string | undefined =>
  p.pageBreakBefore
    ? 'page'
    : p.columnBreakBefore
      ? 'column'
      : p.pageBreakBefore === false || p.columnBreakBefore === false
        ? 'auto'
        : undefined;

/** A page layout's setup from its `style:page-layout-properties`. */
export function readPageSetup(layout: XmlElement, onUnequal?: () => void): PageSetup | undefined {
  const e = childElement(layout, NS.style, 'page-layout-properties');
  const width = e && odfLengthToPt(fo(e, 'page-width'));
  const height = e && odfLengthToPt(fo(e, 'page-height'));
  if (!e || width === undefined || height === undefined) return undefined;
  return compact({
    width,
    height,
    orientation:
      st(e, 'print-orientation') === 'landscape' ? ('landscape' as const) : ('portrait' as const),
    margins: {
      top: odfLengthToPt(fo(e, 'margin-top')) ?? 0,
      bottom: odfLengthToPt(fo(e, 'margin-bottom')) ?? 0,
      left: odfLengthToPt(fo(e, 'margin-left')) ?? 0,
      right: odfLengthToPt(fo(e, 'margin-right')) ?? 0,
    },
    pageColor: odfColour(fo(e, 'background-color')),
    columns: readColumns(e, onUnequal),
  });
}

/**
 * The columns a page layout's or a section's properties hold (page-layout.md "Columns"): count, gap and the line
 * between; none for one column. Columns of unequal widths read as equal, and `onUnequal` is told.
 */
export function readColumns(
  props: XmlElement | undefined,
  onUnequal: () => void = () => {},
): Columns | undefined {
  const columns = props && childElement(props, NS.style, 'columns');
  const count = Number(columns && fo(columns, 'column-count'));
  if (!columns || !(count > 1)) return undefined;
  const widths = childElements(columns)
    .filter((c) => c.local === 'column' && c.uri === NS.style)
    .map((c) => Number.parseFloat(st(c, 'rel-width') ?? ''))
    .filter((w) => w > 0);
  // Suites split a total into near halves (32767* and 32768*): within a hundredth is equal.
  if (widths.length > 1 && Math.max(...widths) - Math.min(...widths) > Math.max(...widths) / 100)
    onUnequal();
  const sep = childElement(columns, NS.style, 'column-sep');
  const line = sep !== undefined && (st(sep, 'style') ?? 'solid') !== 'none';
  return compact({
    count,
    gap: odfLengthToPt(fo(columns, 'column-gap')) ?? 0,
    separator: line ? (true as const) : undefined,
  });
}

// The line between columns as LibreOffice writes it: thin, black, the columns' whole height.
const COLUMN_SEP =
  '<style:column-sep style:style="solid" style:width="0.5pt" style:color="#000000" style:height="100%" style:vertical-align="top"/>';

/** `style:columns` for a column count past one, with its line between. */
export const columnsXml = (columns: PageSetup['columns']): string =>
  columns && columns.count > 1
    ? columns.separator
      ? `<style:columns fo:column-count="${columns.count}" fo:column-gap="${ptToOdf(columns.gap)}">${COLUMN_SEP}</style:columns>`
      : `<style:columns fo:column-count="${columns.count}" fo:column-gap="${ptToOdf(columns.gap)}"/>`
    : '';

/** `style:page-layout-properties` for a setup, with what was kept of the layout's own children. */
export function pageLayoutPropsXml(setup: PageSetup, inner = ''): string {
  const m = setup.margins;
  const attrs = [
    attr('fo:page-width', ptToOdf(setup.width)),
    attr('fo:page-height', ptToOdf(setup.height)),
    attr('style:print-orientation', setup.orientation),
    attr('fo:margin-top', ptToOdf(m.top)),
    attr('fo:margin-bottom', ptToOdf(m.bottom)),
    attr('fo:margin-left', ptToOdf(m.left)),
    attr('fo:margin-right', ptToOdf(m.right)),
    attr('fo:background-color', setup.pageColor),
  ].join('');
  const children = columnsXml(setup.columns) + inner;
  return children
    ? `<style:page-layout-properties${attrs}>${children}</style:page-layout-properties>`
    : `<style:page-layout-properties${attrs}/>`;
}
