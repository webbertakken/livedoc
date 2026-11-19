// The live state read as the model (docs/specs/034-text-documents/live-editing-and-storage.md "The layout"): what the
// state does not hold yet (a new text document's maps, a paragraph's style) reads as a blank text document of the
// tab's format has it.
import * as Y from 'yjs';
import type {
  Block,
  Inline,
  KeptBlock,
  KeptInline,
  Paragraph,
  Run,
  SectionBreak,
} from '../model/blocks';
import type { ListDefinition } from '../model/lists';
import type { TextProps } from '../model/props';
import type { Section } from '../model/sections';
import { Styles, type Style } from '../model/styles';
import { TextDocument, type TextDocumentFormat } from '../model/text-document';
import {
  DOCUMENT_MAP,
  KEPT_BLOCK,
  KEPT_INLINE,
  LINK_MARK,
  LISTS_MAP,
  PARAGRAPH,
  RUN_KEPT_MARK,
  SECTION_BREAK,
  SOURCE_MAP,
  STYLES_MAP,
  TEXT_PROPERTY_MARK_OF,
  TEXT_STYLE_MARK,
} from './live-names';
import { BODY_FRAGMENT } from './live-root';
import { readSource } from './live-source';

const PROPERTY_OF_MARK = new Map<string, keyof TextProps>(
  (Object.entries(TEXT_PROPERTY_MARK_OF) as [keyof TextProps, string][]).map(([p, m]) => [m, p]),
);

type Attributes = Record<string, unknown>;

/** The object with only the keys whose values are defined, so an absent attribute is an absent field. */
const defined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null)) as T;

function runOf(text: string, attributes: Attributes): Run {
  const props: Record<string, unknown> = {};
  for (const [mark, value] of Object.entries(attributes)) {
    const property = PROPERTY_OF_MARK.get(mark);
    if (property) props[property] = (value as { value: unknown }).value;
  }
  return defined<Run>({
    type: 'run',
    text,
    style: (attributes[TEXT_STYLE_MARK] as { id?: string } | undefined)?.id,
    props,
    link: (attributes[LINK_MARK] as { href?: string } | undefined)?.href,
    kept: (attributes[RUN_KEPT_MARK] as { kept?: Run['kept'] } | undefined)?.kept,
  });
}

function inlinesOf(paragraph: Y.XmlElement): Inline[] {
  const inlines: Inline[] = [];
  for (const child of paragraph.toArray()) {
    if (child instanceof Y.XmlText) {
      for (const op of child.toDelta() as { insert: unknown; attributes?: Attributes }[])
        if (typeof op.insert === 'string') inlines.push(runOf(op.insert, op.attributes ?? {}));
      continue;
    }
    if (child instanceof Y.XmlElement && child.nodeName === KEPT_INLINE) {
      const a = child.getAttributes() as Attributes;
      inlines.push(
        defined<KeptInline>({
          type: 'kept',
          name: a.name as string,
          xml: a.xml as KeptInline['xml'],
          props: a.props ?? {},
          style: a.style as string | undefined,
          link: a.link as string | undefined,
          kept: a.kept as KeptInline['kept'],
        }),
      );
    }
  }
  return inlines;
}

function blockOf(node: Y.XmlElement, normal: string): Block | null {
  const a = node.getAttributes() as Attributes;
  switch (node.nodeName) {
    case PARAGRAPH:
      return defined<Paragraph>({
        type: 'paragraph',
        style: (a.style as string | undefined) ?? normal,
        props: a.props ?? {},
        list: a.list as Paragraph['list'],
        text: a.text as Paragraph['text'],
        inlines: inlinesOf(node),
        kept: a.kept as Paragraph['kept'],
      });
    case SECTION_BREAK:
      return defined({ type: 'section', ...(a as Omit<SectionBreak, 'type'>) }) as SectionBreak;
    case KEPT_BLOCK:
      return { type: 'kept', name: a.name as string, xml: a.xml as KeptBlock['xml'] };
    default:
      return null;
  }
}

function stylesOf(map: Y.Map<unknown>): Style[] | null {
  if (map.size === 0) return null;
  return [...map.values()]
    .map((v) => v as { order: number; style: Style })
    .sort((x, y) => x.order - y.order)
    .map((v) => v.style);
}

/** The live state as the model, in the tab's format. */
export function readLiveDocument(doc: Y.Doc, format: TextDocumentFormat): TextDocument {
  const blank = TextDocument.blank({ format });
  const meta = doc.getMap<unknown>(DOCUMENT_MAP);
  const lists = doc.getMap<unknown>(LISTS_MAP);
  const styles = stylesOf(doc.getMap<unknown>(STYLES_MAP)) ?? blank.styles;
  const normal = Styles.idOfRole(styles, 'normal') ?? Styles.idOfRole(blank.styles, 'normal')!;
  const body = doc
    .getXmlFragment(BODY_FRAGMENT)
    .toArray()
    .flatMap((node) => {
      const block = node instanceof Y.XmlElement ? blockOf(node, normal) : null;
      return block ? [block] : [];
    });
  const source = readSource(doc.getMap<unknown>(SOURCE_MAP));
  return defined({
    format,
    metadata: (meta.get('metadata') as TextDocument['metadata'] | undefined) ?? blank.metadata,
    defaults: (meta.get('defaults') as TextDocument['defaults'] | undefined) ?? blank.defaults,
    styles,
    lists: Object.fromEntries(lists.entries()) as Record<string, ListDefinition>,
    section: (meta.get('section') as Section | undefined) ?? blank.section,
    body,
    source,
  });
}
