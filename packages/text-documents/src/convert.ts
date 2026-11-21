// Conversion (standard-mapping.md "Conversion"): a person's choice to move a text document to the other format. The
// losses are listed first; converting drops what was kept from the old format and maps the built-in styles' ids.
import type { Block, Inline, Paragraph } from './model/blocks';
import type { ListDefinition } from './model/lists';
import { compact, type BorderLine, type ParagraphProps, type TextProps } from './model/props';
import { borderSize, borderSpace, OOXML_BORDER_SPACE_MAX_PT } from './ooxml/ooxml-borders';
import type { PageSetup, Section } from './model/sections';
import {
  HEADER_FOOTER_KINDS,
  HEADER_FOOTER_SLOTS,
  type HeaderFooterSet,
  type SectionHeaders,
} from './model/headers';
import { ROLE_IDS, type Style } from './model/styles';
import type { TextDocument, TextDocumentFormat } from './model/text-document';
import type { ReportItem } from './report';

export type ConversionLoss = ReportItem & {
  /** `kept` for kept content, else the construct the other format cannot hold. */
  readonly kind:
    | 'kept'
    | 'text-transform'
    | 'section-name'
    | 'list-header'
    | 'between'
    | 'border-padding'
    | 'header-footer'
    | 'page-number-start';
};

function count(map: Map<string, number>, name: string): void {
  map.set(name, (map.get(name) ?? 0) + 1);
}

/** Every section of the document: the first, then each section break's. */
const sectionsOf = (document: TextDocument): Section[] => [
  document.section,
  ...document.body.filter((b): b is Extract<Block, { type: 'section' }> => b.type === 'section'),
];

/** Each header's and footer's blocks a section holds of its own. */
const storiesOf = (headers: SectionHeaders | undefined): (readonly Block[])[] =>
  HEADER_FOOTER_KINDS.flatMap((kind) =>
    HEADER_FOOTER_SLOTS.flatMap((slot) => {
      const story = headers?.[kind]?.[slot];
      return story ? [story.blocks] : [];
    }),
  );

/** What converting to `to` loses, by name and count; nothing when the document is already in that format. */
export function conversionLosses(document: TextDocument, to: TextDocumentFormat): ConversionLoss[] {
  if (document.format === to) return [];
  const kept = new Map<string, number>();
  const other = new Map<string, number>();
  const stories = sectionsOf(document).flatMap((s) => storiesOf(s.headers));
  // A continuous section has no master page in an OpenDocument file: its own headers and footers, and the number its
  // pages start at, are a loss.
  if (to === 'odf')
    for (const block of document.body)
      if (block.type === 'section' && block.start === 'continuous') {
        for (let i = 0; i < storiesOf(block.headers).length; i += 1) count(other, 'header-footer');
        if (block.numberStart !== undefined) count(other, 'page-number-start');
      }
  for (const block of [...document.body, ...stories.flat()]) {
    if (block.type === 'kept') count(kept, block.name);
    if (block.type === 'section' && block.region) count(other, 'section-name');
    if (block.type !== 'paragraph') continue;
    for (const inline of block.inlines) {
      if (inline.type === 'kept') count(kept, inline.name);
      const transform = inline.props.transform ?? block.text?.transform;
      if (to === 'ooxml' && (transform === 'lowercase' || transform === 'capitalize'))
        count(other, 'text-transform');
    }
    if (to === 'ooxml' && block.list?.unnumbered) count(other, 'list-header');
    const borders = block.props.borders;
    if (to === 'odf' && borders?.between) count(other, 'between');
    if (
      to === 'ooxml' &&
      Object.values(borders ?? {}).some((line) => line.space > OOXML_BORDER_SPACE_MAX_PT)
    )
      count(other, 'border-padding');
  }
  for (const entry of document.source?.format === 'odf'
    ? document.source.entries
    : (document.source?.parts ?? []))
    count(kept, entry.name.split('/')[0]!);
  return [
    ...[...kept].map(([name, n]) => ({ kind: 'kept' as const, name, count: n })),
    ...[...other].map(([name, n]) => ({ kind: name as ConversionLoss['kind'], name, count: n })),
  ];
}

const twentieth = (pt: number) => Math.round(pt * 20) / 20;
const half = (pt: number) => Math.round(pt * 2) / 2;
const opt = (n: number | undefined, f: (n: number) => number) =>
  n === undefined ? undefined : f(n);

const ooxmlBorder = (line: BorderLine): BorderLine => ({
  ...line,
  width: borderSize(line.width) / 8,
  space: borderSpace(line.space),
});

/** Paragraph values in OOXML's resolution: lengths in twentieths of a point, line multiples in 240ths. */
function ooxmlParagraph(p: ParagraphProps): ParagraphProps {
  const line = p.lineHeight;
  return compact({
    ...p,
    borders:
      p.borders &&
      Object.fromEntries(Object.entries(p.borders).map(([side, b]) => [side, ooxmlBorder(b)])),
    indentStart: opt(p.indentStart, twentieth),
    indentEnd: opt(p.indentEnd, twentieth),
    indentFirst: opt(p.indentFirst, twentieth),
    spaceBefore: opt(p.spaceBefore, twentieth),
    spaceAfter: opt(p.spaceAfter, twentieth),
    lineHeight:
      line === undefined
        ? undefined
        : line.rule === 'multiple'
          ? { ...line, value: Math.round(line.value * 240) / 240 }
          : { ...line, pt: twentieth(line.pt) },
  });
}

/** Text values OOXML holds: sizes in half-points, and only the uppercase transform (the others are losses). */
function ooxmlText(t: TextProps): TextProps {
  return compact({
    ...t,
    size: opt(t.size, half),
    transform:
      t.transform === 'lowercase' || t.transform === 'capitalize' ? undefined : t.transform,
  });
}

/** Paragraph values ODF holds: no line between paragraphs (a loss). */
function odfParagraph(p: ParagraphProps): ParagraphProps {
  if (!p.borders?.between) return p;
  const { between: _, ...borders } = p.borders;
  return { ...p, borders };
}

function ooxmlSetup(setup: PageSetup): PageSetup {
  const m = setup.margins;
  return compact({
    ...setup,
    width: twentieth(setup.width),
    height: twentieth(setup.height),
    margins: compact({
      top: twentieth(m.top),
      bottom: twentieth(m.bottom),
      left: twentieth(m.left),
      right: twentieth(m.right),
      header: opt(m.header, twentieth),
      footer: opt(m.footer, twentieth),
    }),
    columns: setup.columns && { ...setup.columns, gap: twentieth(setup.columns.gap) },
  });
}

const withoutKept = <T extends { kept?: unknown }>(value: T): Omit<T, 'kept'> => {
  const { kept: _, ...rest } = value;
  return rest;
};

/** The document in the other format, and what that lost. */
export function convertTextDocument(
  document: TextDocument,
  to: TextDocumentFormat,
): { document: TextDocument; losses: ConversionLoss[] } {
  const losses = conversionLosses(document, to);
  if (document.format === to) return { document, losses };
  const ids = new Map<string, string>();
  for (const style of document.styles) if (style.role) ids.set(style.id, ROLE_IDS[to][style.role]);
  const id = (value: string | undefined) =>
    value === undefined ? undefined : (ids.get(value) ?? value);
  const ooxml = to === 'ooxml';
  const paragraphOf = (p: ParagraphProps) => (ooxml ? ooxmlParagraph(p) : odfParagraph(p));
  const textOf = (t: TextProps) => (ooxml ? ooxmlText(t) : t);
  const setupOf = (s: PageSetup) => (ooxml ? ooxmlSetup(s) : s);
  const styles: Style[] = document.styles.map((s) => {
    const { parent, next, ...rest } = withoutKept({
      ...s,
      paragraph: paragraphOf(s.paragraph),
      text: textOf(s.text),
    });
    const p = id(parent);
    const n = id(next);
    return { ...rest, id: id(s.id)!, ...(p ? { parent: p } : {}), ...(n ? { next: n } : {}) };
  });
  const inline = (i: Inline, paragraphText: Paragraph['text']): Inline[] => {
    if (i.type === 'kept') return [];
    const style = id(i.style);
    const props = textOf(
      to === 'ooxml' && paragraphText ? { ...paragraphText, ...i.props } : i.props,
    );
    const { style: _, ...rest } = withoutKept(i);
    return [{ ...rest, props, ...(style ? { style } : {}) } as Inline];
  };
  // A section's headers and footers: their blocks converted as the body's, the part they came from left behind.
  const headersOf = (headers: SectionHeaders | undefined): SectionHeaders | undefined => {
    if (!headers) return undefined;
    const set = (h: HeaderFooterSet | undefined): HeaderFooterSet | undefined =>
      h &&
      Object.fromEntries(
        Object.entries(h).map(([slot, story]) => [slot, { blocks: blocksOf(story.blocks) }]),
      );
    return compact({ ...headers, header: set(headers.header), footer: set(headers.footer) });
  };
  const blocksOf = (blocks: readonly Block[]): Block[] =>
    blocks.flatMap((block): Block[] => {
      if (block.type === 'kept') return [];
      if (block.type === 'section') {
        const { region: _, headers, ...rest } = withoutKept(block);
        const own = headersOf(headers);
        return [{ ...rest, setup: setupOf(block.setup), ...(own ? { headers: own } : {}) }];
      }
      const { text, list, ...rest } = withoutKept(block);
      const place = list && to === 'ooxml' ? (({ unnumbered: _u, ...p }) => p)(list) : list;
      return [
        {
          ...rest,
          props: paragraphOf(block.props),
          style: id(block.style)!,
          ...(place ? { list: place } : {}),
          ...(text && to === 'odf' ? { text } : {}),
          inlines: block.inlines.flatMap((i) => inline(i, text)),
        },
      ];
    });
  const body = blocksOf(document.body);
  const lists: Record<string, ListDefinition> = Object.fromEntries(
    Object.entries(document.lists).map(([k, l]) => [k, withoutKept(l)]),
  );
  const { headers: firstHeaders, ...first } = withoutKept(document.section);
  const firstOwn = headersOf(firstHeaders);
  const section: Section = {
    ...first,
    setup: setupOf(document.section.setup),
    ...(firstOwn ? { headers: firstOwn } : {}),
  };
  const { kept: _, ...metadata } = document.metadata;
  return {
    document: {
      format: to,
      metadata,
      defaults: withoutKept(document.defaults),
      styles,
      lists,
      section,
      body,
    },
    losses,
  };
}
