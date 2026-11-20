// The model written into the live state (docs/specs/034-text-documents/live-editing-and-storage.md "The layout"): the
// body as elements and formatted text, and the maps beside it. One transaction.
import * as Y from 'yjs';
import type { Block, Inline, KeptInline, Paragraph, Run } from '../model/blocks';
import { isEmpty, type TextProps } from '../model/props';
import { TextDocument } from '../model/text-document';
import type { Style } from '../model/styles';
import type { ListDefinition } from '../model/lists';
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
import { writeSource } from './live-source';
import { BODY_FRAGMENT } from './live-root';

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

function inlineNodes(inlines: readonly Inline[]): (Y.XmlText | Y.XmlElement)[] {
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
    text = null;
    const element = new Y.XmlElement(KEPT_INLINE);
    setAttributes(element, {
      name: inline.name,
      xml: inline.xml,
      props: isEmpty(inline.props) ? undefined : inline.props,
      style: inline.style,
      link: inline.link,
      kept: inline.kept,
    });
    nodes.push(element);
  }
  return nodes;
}

function paragraphNode(paragraph: Paragraph): Y.XmlElement {
  const element = new Y.XmlElement(PARAGRAPH);
  setAttributes(element, {
    style: paragraph.style,
    props: isEmpty(paragraph.props) ? undefined : paragraph.props,
    list: paragraph.list,
    text: paragraph.text,
    kept: paragraph.kept,
  });
  const children = inlineNodes(paragraph.inlines);
  if (children.length > 0) element.insert(0, children);
  return element;
}

function blockNode(block: Block): Y.XmlElement {
  switch (block.type) {
    case 'paragraph':
      return paragraphNode(block);
    case 'section': {
      const element = new Y.XmlElement(SECTION_BREAK);
      const { type: _type, ...section } = block;
      setAttributes(element, section);
      return element;
    }
    case 'kept': {
      const element = new Y.XmlElement(KEPT_BLOCK);
      setAttributes(element, { name: block.name, xml: block.xml });
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
  doc.transact(() => {
    body.delete(0, body.length);
    body.insert(0, document.body.map(blockNode));
    meta.set('metadata', plain(document.metadata));
    meta.set('defaults', plain(document.defaults));
    meta.set('section', plain(document.section));
    styles.clear();
    document.styles.forEach((style, order) => styles.set(style.id, { order, style: plain(style) }));
    lists.clear();
    for (const [id, list] of Object.entries(document.lists)) lists.set(id, plain(list));
    writeSource(source, document.source);
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

/** A list's definition set by id, as one transaction with `origin` (lists.md "Making a list"). */
export function setLiveList(doc: Y.Doc, id: string, list: ListDefinition, origin?: unknown): void {
  const lists = doc.getMap<unknown>(LISTS_MAP);
  doc.transact(() => lists.set(id, plain(list)), origin);
}
