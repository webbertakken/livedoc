// The text formatting the surface binds (docs/specs/034-text-documents/text-and-paragraphs.md "Text formatting"): the
// format actions and the toolbar's font size over the editor there is now, reading the styles from the live state once
// per editor state, however many controls read them as the toolbar draws.
import { useMemo, type RefObject } from 'react';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { TextDocument, TextDocumentState } from '@livedoc/text-documents';
import type { TextFormatting } from './text-document-formatting';
import { textDocumentFormatActions } from './text-document-format-actions';

/** Reads the styles and defaults of the live state (a new document's while it has none), once per editor state. */
export function textFormattingReader(
  view: EditorView | null,
  liveDoc: RefObject<Y.Doc | null>,
  format: TextDocumentFormat,
): () => TextFormatting {
  let cached: { state: EditorState; formatting: TextFormatting } | null = null;
  return () => {
    const state = view?.state;
    if (cached && state && cached.state === state) return cached.formatting;
    const doc = liveDoc.current;
    const blank = TextDocument.blank({ format });
    const formatting = {
      styles: doc ? TextDocumentState.styles(doc, format) : blank.styles,
      defaults: doc ? TextDocumentState.defaults(doc, format) : blank.defaults,
    };
    if (state) cached = { state, formatting };
    return formatting;
  };
}

export function useTextDocumentFormatting(
  view: EditorView | null,
  liveDoc: RefObject<Y.Doc | null>,
  format: TextDocumentFormat,
  canEdit: boolean,
) {
  return useMemo(
    () => textDocumentFormatActions(view, textFormattingReader(view, liveDoc, format), { canEdit }),
    [view, liveDoc, format, canEdit],
  );
}
