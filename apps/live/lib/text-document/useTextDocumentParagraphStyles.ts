// Paragraph styles on the surface (docs/specs/034-text-documents/text-and-paragraphs.md "Paragraph styles"): the
// paragraphs drawn in their styles, and Format > Paragraph styles with the toolbar's Styles control bound to the
// editor there is now, adding a style the document lacks to its live state.
import { useMemo, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { TextDocumentState } from '@livedoc/text-documents';
import { textDocumentParagraphStyleActions } from './text-document-paragraph-styles';
import { textFormattingReader } from './useTextDocumentFormatting';
import { useTextDocumentStyleSheet } from './useTextDocumentStyleSheet';

export function useTextDocumentParagraphStyles(
  view: EditorView | null,
  liveDoc: RefObject<Y.Doc | null>,
  format: TextDocumentFormat,
  canEdit: boolean,
) {
  useTextDocumentStyleSheet(view, liveDoc, format);
  return useMemo(
    () =>
      textDocumentParagraphStyleActions(
        view,
        textFormattingReader(view, liveDoc, format),
        (style) => {
          if (liveDoc.current) TextDocumentState.addStyle(liveDoc.current, style);
        },
        format,
        { canEdit },
      ),
    [view, liveDoc, format, canEdit],
  );
}
