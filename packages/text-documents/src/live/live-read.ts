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
import { Styles, type Style, type StyleDefaults } from '../model/styles';
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
import { StoryReader, type LiveHeaders } from './live-stories';

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

function blockOf(node: Y.XmlElement, normal: string, stories?: StoryReader): Block | null {
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
    case SECTION_BREAK: {
      const { headers, ...rest } = a as Omit<SectionBreak, 'type' | 'headers'> & {
        headers?: LiveHeaders;
      };
      return defined({
        type: 'section',
        ...rest,
        headers: stories?.headers(headers),
      }) as SectionBreak;
    }
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

/** The live state's style defaults alone. */
export function readLiveDefaults(doc: Y.Doc, format: TextDocumentFormat): StyleDefaults {
  return (
    (doc.getMap<unknown>(DOCUMENT_MAP).get('defaults') as StyleDefaults | undefined) ??
    TextDocument.blank({ format }).defaults
  );
}

/** The live state's first section, or a new document's while it holds none (page-layout.md "Page setup"). */
export function readLiveSection(doc: Y.Doc, format: TextDocumentFormat): Section {
  const held = doc.getMap<unknown>(DOCUMENT_MAP).get('section') as LiveSection | undefined;
  if (!held) return TextDocument.blank({ format }).section;
  return sectionOf(held, new StoryReader(doc, (node) => blockOf(node, normalOf(doc, format))));
}

type LiveSection = Omit<Section, 'headers'> & { headers?: LiveHeaders };

const sectionOf = ({ headers, ...rest }: LiveSection, stories: StoryReader): Section =>
  defined({ ...rest, headers: stories.headers(headers) });

const normalOf = (doc: Y.Doc, format: TextDocumentFormat): string => {
  const styles = readLiveStyles(doc, format);
  return (
    Styles.idOfRole(styles, 'normal') ??
    Styles.idOfRole(TextDocument.blank({ format }).styles, 'normal')!
  );
};

/** The live state's styles, or the format's own while it holds none. */
export function readLiveStyles(doc: Y.Doc, format: TextDocumentFormat): Style[] {
  return stylesOf(doc.getMap<unknown>(STYLES_MAP)) ?? [...TextDocument.blank({ format }).styles];
}

/** The live state as the model, in the tab's format. */
export function readLiveDocument(doc: Y.Doc, format: TextDocumentFormat): TextDocument {
  const blank = TextDocument.blank({ format });
  const meta = doc.getMap<unknown>(DOCUMENT_MAP);
  const lists = doc.getMap<unknown>(LISTS_MAP);
  const styles = stylesOf(doc.getMap<unknown>(STYLES_MAP)) ?? blank.styles;
  const normal = Styles.idOfRole(styles, 'normal') ?? Styles.idOfRole(blank.styles, 'normal')!;
  const stories: StoryReader = new StoryReader(doc, (node) => blockOf(node, normal));
  const body = doc
    .getXmlFragment(BODY_FRAGMENT)
    .toArray()
    .flatMap((node) => {
      const block = node instanceof Y.XmlElement ? blockOf(node, normal, stories) : null;
      return block ? [block] : [];
    });
  const held = meta.get('section') as LiveSection | undefined;
  const source = readSource(doc.getMap<unknown>(SOURCE_MAP));
  return defined({
    format,
    metadata: (meta.get('metadata') as TextDocument['metadata'] | undefined) ?? blank.metadata,
    defaults: (meta.get('defaults') as TextDocument['defaults'] | undefined) ?? blank.defaults,
    styles,
    lists: Object.fromEntries(lists.entries()) as Record<string, ListDefinition>,
    section: held ? sectionOf(held, stories) : blank.section,
    pageless: meta.get('pageless') === true ? true : undefined,
    body,
    source,
  });
}
