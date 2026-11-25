// The model written into the live state (docs/specs/034-text-documents/live-editing-and-storage.md "The layout"): the
// body as elements and formatted text, and the maps beside it. One transaction.
import * as Y from 'yjs';
import type { Block, Inline, KeptInline, Paragraph, Run } from '../model/blocks';
import type { CommentMark } from '../model/comments';
import { isEmpty, type TextProps } from '../model/props';
import { TextDocument, type TextDocumentFormat } from '../model/text-document';
import type { Style } from '../model/styles';
import type { ListDefinition } from '../model/lists';
import type { Section } from '../model/sections';
import { Pictures, type Picture, type PictureMedia } from '../model/pictures';
import {
  DOCUMENT_MAP,
  KEPT_BLOCK,
  EQUATION,
  BOOKMARK,
  FIELD,
  FOOTNOTE,
  KEPT_INLINE,
  LINK_MARK,
  MEDIA_MAP,
  PICTURE,
  LISTS_MAP,
  PARAGRAPH,
  RUN_KEPT_MARK,
  SECTION_BREAK,
  CONTENTS,
  SOURCE_MAP,
  STYLES_MAP,
  TEXT_PROPERTY_MARK_OF,
  TEXT_STYLE_MARK,
} from './live-names';
import { writeSource } from './live-source';
import { StoryWriter, type LiveHeaders } from './live-stories';
import { BODY_FRAGMENT } from './live-root';
import { writeLiveTabs } from './live-tabs';
import { DocumentTabs, FIRST_DOCUMENT_TAB_ID } from '../model/document-tabs';
import { tableElement } from './live-tables';
import { CommentPlaces } from './live-thread-files';
import { THREADS_MAP } from './live-names';

/** A value as the state holds it: plain JSON, undefined fields left out. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function setAttributes(element: Y.XmlElement, attributes: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(attributes))
    // The attribute's value is a whole JSON value; Yjs' typing says string, its encoding takes any.
    if (value !== undefined) element.setAttribute(key, plain(value) as string);
}

/** A run's text formatting attributes: one per property, each `{ value }`, so a `false` is kept. */
export function runAttributes(inline: Run | KeptInline): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inline.props) as [keyof TextProps, unknown][])
    if (value !== undefined) attributes[TEXT_PROPERTY_MARK_OF[key]] = { value };
  if (inline.link !== undefined) attributes[LINK_MARK] = { href: inline.link };
  if (inline.style !== undefined) attributes[TEXT_STYLE_MARK] = { id: inline.style };
  if (inline.kept !== undefined) attributes[RUN_KEPT_MARK] = { kept: plain(inline.kept) };
  return attributes;
}

/** Where a comment marker sits as the inlines are built: in a run of text, or between the paragraph's children. */
type MarkAt = (
  mark: CommentMark,
  at: { text: Y.XmlText; offset: number } | { child: number },
) => void;

function inlineNodes(
  inlines: readonly Inline[],
  stories: StoryWriter,
  markAt?: MarkAt,
): (Y.XmlText | Y.XmlElement)[] {
  const nodes: (Y.XmlText | Y.XmlElement)[] = [];
  let text: Y.XmlText | null = null;
  let at = 0;
  for (const inline of inlines) {
    if (inline.type === 'run') {
      if (inline.text.length === 0) continue;
      if (!text) {
        text = new Y.XmlText();
        nodes.push(text);
        at = 0;
      }
      text.insert(at, inline.text, runAttributes(inline));
      at += inline.text.length;
      continue;
    }
    // A comment's edge is no node: its place is noted, and the run of text goes on across it.
    if (inline.type === 'comment') {
      markAt?.(inline, text ? { text, offset: at } : { child: nodes.length });
      continue;
    }
    text = null;
    if (inline.type === 'picture') {
      nodes.push(pictureElement(inline));
      continue;
    }
    const element = new Y.XmlElement(
      inline.type === 'field'
        ? FIELD
        : inline.type === 'note'
          ? FOOTNOTE
          : inline.type === 'equation'
            ? EQUATION
            : inline.type === 'bookmark'
              ? BOOKMARK
              : KEPT_INLINE,
    );
    setAttributes(element, {
      ...(inline.type === 'field'
        ? { field: inline.field, text: inline.text }
        : inline.type === 'note'
          ? { story: stories.note(inline) }
          : inline.type === 'equation'
            ? { math: inline.math }
            : inline.type === 'bookmark'
              ? { name: inline.name }
              : { name: inline.name, xml: inline.xml }),
      props: isEmpty(inline.props) ? undefined : inline.props,
      style: inline.style,
      link: inline.link,
      kept: inline.kept,
    });
    nodes.push(element);
  }
  return nodes;
}

/** A picture as its atom: its values as attributes, its media by key. */
export function pictureElement(picture: Picture): Y.XmlElement {
  const element = new Y.XmlElement(PICTURE);
  const { type: _, props, ...values } = picture;
  setAttributes(element, { ...values, props: isEmpty(props) ? undefined : props });
  return element;
}

/** Each media the document's pictures hold, into the state's `media` map by key: its bytes, or its gallery image. */
export function writeLiveMedia(
  map: Y.Map<unknown>,
  media: readonly [string, PictureMedia][],
): void {
  for (const [key, m] of media)
    if (!map.has(key))
      map.set(key, {
        mediaType: m.mediaType,
        ...(Pictures.holdsBytes(m) ? { bytes: m.bytes } : { image: m.image }),
        ...(m.part ? { part: m.part } : {}),
      });
}

function paragraphNode(
  paragraph: Paragraph,
  stories: StoryWriter,
  places?: CommentPlaces,
): Y.XmlElement {
  const element = new Y.XmlElement(PARAGRAPH);
  setAttributes(element, {
    style: paragraph.style,
    props: isEmpty(paragraph.props) ? undefined : paragraph.props,
    list: paragraph.list,
    text: paragraph.text,
    kept: paragraph.kept,
  });
  const children = inlineNodes(
    paragraph.inlines,
    stories,
    places &&
      ((mark, at) =>
        'text' in at
          ? places.note(mark, at.text, at.offset)
          : places.note(mark, element, at.child)),
  );
  if (children.length > 0) element.insert(0, children);
  return element;
}

function blockNode(block: Block, stories: StoryWriter, places?: CommentPlaces): Y.XmlElement {
  switch (block.type) {
    case 'paragraph':
      return paragraphNode(block, stories, places);
    case 'section': {
      const element = new Y.XmlElement(SECTION_BREAK);
      const { type: _type, headers, ...section } = block;
      setAttributes(element, { ...section, headers: stories.headers(headers) });
      return element;
    }
    case 'kept': {
      const element = new Y.XmlElement(KEPT_BLOCK);
      setAttributes(element, { name: block.name, xml: block.xml });
      return element;
    }
    case 'table':
      return tableElement(block, (b) => blockNode(b, stories, places), setAttributes);
    case 'contents': {
      const element = new Y.XmlElement(CONTENTS);
      setAttributes(element, { look: block.look, levels: block.levels });
      element.insert(
        0,
        block.entries.map((p) => paragraphNode(p, stories)),
      );
      return element;
    }
  }
}

/** Replace the whole live state with the model, as one transaction. The format stays the tab's. */
export function writeLiveDocument(doc: Y.Doc, document: TextDocument): void {
  const body = doc.getXmlFragment(BODY_FRAGMENT);
  const meta = doc.getMap<unknown>(DOCUMENT_MAP);
  const styles = doc.getMap<unknown>(STYLES_MAP);
  const lists = doc.getMap<unknown>(LISTS_MAP);
  const source = doc.getMap<unknown>(SOURCE_MAP);
  const media = doc.getMap<unknown>(MEDIA_MAP);
  const threads = doc.getMap<unknown>(THREADS_MAP);
  doc.transact(() => {
    const stories: StoryWriter = new StoryWriter(doc, (block) => blockNode(block, stories));
    // Comment markers are noted in the tabs' bodies alone, never in a header, footer or note.
    const places = new CommentPlaces();
    threads.clear();
    // Each document tab's body in its own fragment; one plain tab's in `body` alone (standard-mapping.md "Document tabs").
    const tabs = DocumentTabs.isPlain(document) ? undefined : DocumentTabs.all(document);
    writeLiveTabs(doc, tabs, (blocks, tab) => {
      places.tab = tab;
      return blocks.map((block) => blockNode(block, stories, places));
    });
    if (!tabs) {
      places.tab = FIRST_DOCUMENT_TAB_ID;
      body.delete(0, body.length);
      body.insert(
        0,
        document.body.map((block) => blockNode(block, stories, places)),
      );
    } else if (!tabs.some((t) => t.id === FIRST_DOCUMENT_TAB_ID)) body.delete(0, body.length);
    meta.set('metadata', plain(document.metadata));
    meta.set('defaults', plain(document.defaults));
    const { headers, ...section } = document.section;
    meta.set('section', plain({ ...section, headers: stories.headers(headers) }));
    if (document.pageless) meta.set('pageless', true);
    else meta.delete('pageless');
    if (document.watermark) meta.set('watermark', plain(document.watermark));
    else meta.delete('watermark');
    styles.clear();
    document.styles.forEach((style, order) => styles.set(style.id, { order, style: plain(style) }));
    lists.clear();
    for (const [id, list] of Object.entries(document.lists)) lists.set(id, plain(list));
    writeSource(source, document.source);
    media.clear();
    writeLiveMedia(media, Pictures.heldMedia(document));
    places.write(
      doc,
      document.comments ?? [],
      new Map(DocumentTabs.all(document).map((t) => [t.id, t.body])),
    );
  });
}

/**
 * A style added to the live state's own, after the others (text-and-paragraphs.md "Paragraph styles": a style the
 * document lacks). While the state holds no styles of its own the format's set stands, which holds every role, so
 * nothing is written; a style the state already holds is left as it is.
 */
export function addLiveStyle(doc: Y.Doc, style: Style): void {
  const styles = doc.getMap<unknown>(STYLES_MAP);
  if (styles.size === 0 || styles.has(style.id)) return;
  styles.set(style.id, { order: styles.size, style: plain(style) });
}

/**
 * Styles set by id, replacing a held one and adding one not held, as one transaction with `origin` (undo tracks it:
 * text-and-paragraphs.md "Update to match"). While the state holds no styles of its own, the format's set is written
 * first, so the styles not set keep standing.
 */
export function setLiveStyles(
  doc: Y.Doc,
  format: 'odf' | 'ooxml',
  changed: readonly Style[],
  origin: unknown = null,
): void {
  if (changed.length === 0) return;
  const styles = doc.getMap<unknown>(STYLES_MAP);
  doc.transact(() => {
    if (styles.size === 0)
      TextDocument.blank({ format }).styles.forEach((style, order) =>
        styles.set(style.id, { order, style: plain(style) }),
      );
    for (const style of changed) {
      const held = styles.get(style.id) as { order: number } | undefined;
      styles.set(style.id, { order: held?.order ?? styles.size, style: plain(style) });
    }
  }, origin);
}

/**
 * Sets the first section's start and setup, as one transaction with `origin` (page-layout.md "Page setup"); its
 * headers and footers stay as the state holds them.
 */
export function setLiveSection(doc: Y.Doc, section: Section, origin?: unknown): void {
  const meta = doc.getMap<unknown>(DOCUMENT_MAP);
  const held = (meta.get('section') as { headers?: LiveHeaders } | undefined)?.headers;
  const { headers: _, ...rest } = section;
  doc.transact(() => meta.set('section', plain({ ...rest, headers: held })), origin);
}

/**
 * The first section's own headers and footers set as the live state names them, as one transaction with `origin`;
 * a document holding no first section yet gets a new one's (page-layout.md "Headers and footers").
 */
export function setLiveFirstHeaders(
  doc: Y.Doc,
  format: TextDocumentFormat,
  headers: LiveHeaders | undefined,
  origin?: unknown,
): void {
  const meta = doc.getMap<unknown>(DOCUMENT_MAP);
  const held =
    (meta.get('section') as Section | undefined) ?? TextDocument.blank({ format }).section;
  const { headers: _, ...rest } = held;
  doc.transact(
    () => meta.set('section', plain({ ...rest, ...(headers ? { headers } : {}) })),
    origin,
  );
}

/** A list's definition set by id, as one transaction with `origin` (lists.md "Making a list"). */

export function setLiveList(doc: Y.Doc, id: string, list: ListDefinition, origin?: unknown): void {
  const lists = doc.getMap<unknown>(LISTS_MAP);
  doc.transact(() => lists.set(id, plain(list)), origin);
}
