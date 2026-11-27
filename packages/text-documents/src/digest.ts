// What the room knows of a text document without reading its state again
// (docs/specs/034-text-documents/live-editing-and-storage.md "The digest"): counts, whether it has content, the
// text content search reads (every tab's body, then its headers', footers' and notes'), and the threads' rows the
// Inbox reads. Pure; built from a loaded state when the outbox drains the tab.
import * as Y from 'yjs';
import type { CollabIndexRows } from '@livedoc/document';
import { TEXT_DOCUMENT_WORDS_PER_PAGE } from './limits';
import { liveStoryIds } from './live/live-stories';
import { liveTabFragments } from './live/live-tabs';
import { textDocumentCollabRows } from './live/live-thread-index';
import { LiveThreads } from './live/live-threads';
import { EQUATION, PICTURE } from './live/live-names';
import { TextDocumentState } from './text-document-state';

export type TextDocumentDigest = {
  readonly characters: number;
  readonly words: number;
  /** Estimated without layout; never fewer than one, as an empty text document is one page. */
  readonly pages: number;
  readonly hasContent: boolean;
  /** The body's plain text, then each header's and footer's, then each note's, one line a paragraph. */
  readonly searchText: string;
  /** The gallery images its pictures hold, each once: the tab's references in the room's index. */
  readonly imageIds: readonly string[];
  /** The threads' rows in the collaboration index, authors as adder keys (inbox.md §2.7). */
  readonly collab: CollabIndexRows;
};

const WORD = /\S+/g;

/** Whether the body holds a picture or an equation: an object is content (live-editing-and-storage.md "The digest"). */
const holdsObject = (body: Y.XmlFragment): boolean =>
  !body
    .createTreeWalker(
      (n) => n instanceof Y.XmlElement && (n.nodeName === PICTURE || n.nodeName === EQUATION),
    )
    .next().done;

export function textDocumentDigest(doc: Y.Doc): TextDocumentDigest {
  const texts = TextDocumentState.paragraphs(doc).map((p) => p.text);
  const threads = LiveThreads.read(doc);
  const characters = texts.reduce((n, text) => n + text.length, 0);
  const words = texts.reduce((n, text) => n + (text.match(WORD)?.length ?? 0), 0);
  return {
    characters,
    words,
    pages: Math.max(1, Math.ceil(words / TEXT_DOCUMENT_WORDS_PER_PAGE)),
    hasContent: characters > 0 || liveTabFragments(doc).some(holdsObject),
    searchText: [
      ...texts,
      ...liveStoryIds(doc).flatMap((id) =>
        TextDocumentState.storyParagraphs(doc, id).map((p) => p.text),
      ),
    ].join('\n'),
    imageIds: TextDocumentState.galleryImages(doc),
    collab: textDocumentCollabRows(threads, null),
  };
}
