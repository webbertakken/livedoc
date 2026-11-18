// The live state of a text document (docs/specs/034-text-documents/live-editing-and-storage.md "The live model"): a
// Yjs document whose root XML fragment `body` holds the first document tab's body as ProseMirror nodes (y-prosemirror's
// layout: a `paragraph` element holding text). The room, the editor, the api and agents read and write it here.
import * as Y from 'yjs';
import type { Body, Paragraph } from './body';

/** The root fragment holding the first document tab's body. */
export const BODY_FRAGMENT = 'body';

/** The client id the seed is written by, so the seed is the same bytes everywhere and merges with itself. */
export const TEXT_DOCUMENT_SEED_CLIENT = 0;

// The seed: one empty paragraph, written by client 0 (docs/specs/034-text-documents/live-editing-and-storage.md
// "Storage"). Pinned as bytes, never recomputed, so a Yjs upgrade cannot change what every stored state starts from.
// Every state is read as the seed merged with what is stored, so no surface ever invents a first paragraph.
const SEED = Uint8Array.of(
  1,
  1,
  0,
  0,
  7,
  1,
  4,
  98,
  111,
  100,
  121,
  3,
  9,
  112,
  97,
  114,
  97,
  103,
  114,
  97,
  112,
  104,
  0,
);

const PARAGRAPH = 'paragraph';

function textOf(element: Y.XmlElement): string {
  return element
    .toArray()
    .map((child) =>
      child instanceof Y.XmlText
        ? (child.toDelta() as { insert: unknown }[])
            .map((d) => (typeof d.insert === 'string' ? d.insert : ''))
            .join('')
        : '',
    )
    .join('');
}

function paragraphNode(paragraph: Paragraph): Y.XmlElement {
  const element = new Y.XmlElement(PARAGRAPH);
  if (paragraph.text.length > 0) element.insert(0, [new Y.XmlText(paragraph.text)]);
  return element;
}

export const TextDocumentState = {
  /** The seed's bytes (a copy). */
  seed: (): Uint8Array => SEED.slice(),
  /**
   * A live document holding the seed and the given updates. Garbage collection is off: versions are snapshots that
   * need deleted items kept (live-editing-and-storage.md "Copies, snapshots and versions").
   */
  load: (updates: readonly Uint8Array[] = []): Y.Doc => {
    const doc = new Y.Doc({ gc: false });
    Y.applyUpdate(doc, SEED);
    for (const update of updates) Y.applyUpdate(doc, update);
    return doc;
  },
  /** The seed and the updates as one update, without a live document. */
  merge: (updates: readonly Uint8Array[]): Uint8Array => Y.mergeUpdates([SEED, ...updates]),
  /** Whether the bytes decode as a Yjs update; a frame that does not is refused before anything stores it. */
  decodes: (update: Uint8Array): boolean => {
    try {
      Y.decodeUpdate(update);
      return true;
    } catch {
      return false;
    }
  },
  body: (doc: Y.Doc): Y.XmlFragment => doc.getXmlFragment(BODY_FRAGMENT),
  /** The body's paragraphs as plain values. */
  paragraphs: (doc: Y.Doc): Body =>
    TextDocumentState.body(doc)
      .toArray()
      .flatMap((node) =>
        node instanceof Y.XmlElement && node.nodeName === PARAGRAPH ? [{ text: textOf(node) }] : [],
      ),
  /** Replace the whole body with these paragraphs, as one transaction; an empty body keeps one empty paragraph. */
  replaceBody: (doc: Y.Doc, body: Body): void => {
    const fragment = TextDocumentState.body(doc);
    const paragraphs = body.length > 0 ? body : [{ text: '' }];
    doc.transact(() => {
      fragment.delete(0, fragment.length);
      fragment.insert(0, paragraphs.map(paragraphNode));
    });
  },
  /** The whole state as one update. */
  encode: (doc: Y.Doc): Uint8Array => Y.encodeStateAsUpdate(doc),
  /** A state holding exactly these paragraphs, as one update to store beside the seed. */
  fromBody: (body: Body): Uint8Array => {
    const doc = TextDocumentState.load();
    TextDocumentState.replaceBody(doc, body);
    return Y.encodeStateAsUpdate(doc);
  },
} as const;
