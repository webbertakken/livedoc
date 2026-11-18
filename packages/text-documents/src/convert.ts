// Conversion (standard-mapping.md "Conversion"): a person's choice to move a text document to the other format. The
// losses are listed first; converting drops what was kept from the old format and maps the built-in styles' ids.
import type { Block, Inline, Paragraph } from './model/blocks';
import type { ListDefinition } from './model/lists';
import type { Section } from './model/sections';
import { ROLE_IDS, type Style } from './model/styles';
import type { TextDocument, TextDocumentFormat } from './model/text-document';
import type { ReportItem } from './report';

export type ConversionLoss = ReportItem & {
  /** `kept` for kept content, else the construct the other format cannot hold. */
  readonly kind: 'kept' | 'text-transform' | 'section-name' | 'list-header' | 'restart';
};

function count(map: Map<string, number>, name: string): void {
  map.set(name, (map.get(name) ?? 0) + 1);
}

/** What converting to `to` loses, by name and count; nothing when the document is already in that format. */
export function conversionLosses(document: TextDocument, to: TextDocumentFormat): ConversionLoss[] {
  if (document.format === to) return [];
  const kept = new Map<string, number>();
  const other = new Map<string, number>();
  for (const block of document.body) {
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
    if (to === 'ooxml' && block.list?.restart !== undefined) count(other, 'restart');
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
  const styles: Style[] = document.styles.map((s) => {
    const { parent, next, ...rest } = withoutKept(s);
    const p = id(parent);
    const n = id(next);
    return { ...rest, id: id(s.id)!, ...(p ? { parent: p } : {}), ...(n ? { next: n } : {}) };
  });
  const inline = (i: Inline, paragraphText: Paragraph['text']): Inline[] => {
    if (i.type === 'kept') return [];
    const style = id(i.style);
    const props = to === 'ooxml' && paragraphText ? { ...paragraphText, ...i.props } : i.props;
    const { style: _, ...rest } = withoutKept(i);
    return [{ ...rest, props, ...(style ? { style } : {}) }];
  };
  const body: Block[] = document.body.flatMap((block): Block[] => {
    if (block.type === 'kept') return [];
    if (block.type === 'section') {
      const { region: _, ...rest } = withoutKept(block);
      return [rest];
    }
    const { text, list, ...rest } = withoutKept(block);
    const place =
      list && to === 'ooxml' ? (({ restart: _r, unnumbered: _u, ...p }) => p)(list) : list;
    return [
      {
        ...rest,
        style: id(block.style)!,
        ...(place ? { list: place } : {}),
        ...(text && to === 'odf' ? { text } : {}),
        inlines: block.inlines.flatMap((i) => inline(i, text)),
      },
    ];
  });
  const lists: Record<string, ListDefinition> = Object.fromEntries(
    Object.entries(document.lists).map(([k, l]) => [k, withoutKept(l)]),
  );
  const section: Section = withoutKept(document.section);
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
