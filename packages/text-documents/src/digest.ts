// What the room knows of a text document without reading its state again
// (docs/specs/034-text-documents/live-editing-and-storage.md "The digest"): counts, whether it has content, and the
// text content search reads: the body's, then its headers', footers' and notes'. Pure; built from a loaded state when the
// outbox drains the tab.
import type * as Y from 'yjs';
import { TEXT_DOCUMENT_WORDS_PER_PAGE } from './limits';
import { liveStoryIds } from './live/live-stories';
import { TextDocumentState } from './text-document-state';

export type TextDocumentDigest = {
  readonly characters: number;
  readonly words: number;
  /** Estimated without layout; never fewer than one, as an empty text document is one page. */
  readonly pages: number;
  readonly hasContent: boolean;
  /** The body's plain text, then each header's and footer's, then each note's, one line a paragraph. */
  readonly searchText: string;
};

const WORD = /\S+/g;

export function textDocumentDigest(doc: Y.Doc): TextDocumentDigest {
  const texts = TextDocumentState.paragraphs(doc).map((p) => p.text);
  const characters = texts.reduce((n, text) => n + text.length, 0);
  const words = texts.reduce((n, text) => n + (text.match(WORD)?.length ?? 0), 0);
  return {
    characters,
    words,
    pages: Math.max(1, Math.ceil(words / TEXT_DOCUMENT_WORDS_PER_PAGE)),
    hasContent: characters > 0,
    searchText: [
      ...texts,
      ...liveStoryIds(doc).flatMap((id) =>
        TextDocumentState.storyParagraphs(doc, id).map((p) => p.text),
      ),
    ].join('\n'),
  };
}
