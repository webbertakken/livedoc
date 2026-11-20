// Paragraph styles on the surface (docs/specs/034-text-documents/text-and-paragraphs.md "Paragraph styles", "Default
// styles"): the paragraphs drawn in their styles, and Format > Paragraph styles with the toolbar's Styles control bound
// to the editor there is now, writing styles into its live state (on the undo timeline) and the person's default
// styles into their preferences.
import { useMemo, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { TextDocumentState } from '@livedoc/text-documents';
import { textDocumentParagraphStyleActions } from './text-document-paragraph-styles';
import { readDefaultStyles, saveDefaultStyles } from './text-document-default-styles';
import { TEXT_DOCUMENT_STYLES_ORIGIN } from './text-document-undo';
import { textFormattingReader } from './useTextDocumentFormatting';
import { useTextDocumentStyleSheet } from './useTextDocumentStyleSheet';

export function useTextDocumentParagraphStyles(
  view: EditorView | null,
  liveDoc: RefObject<Y.Doc | null>,
  format: TextDocumentFormat,
  canEdit: boolean,
  // Whose preferences the default styles are kept in.
  ownerId: string | null,
) {
  useTextDocumentStyleSheet(view, liveDoc, format);
  return useMemo(
    () =>
      textDocumentParagraphStyleActions({
        view,
        readFormatting: textFormattingReader(view, liveDoc, format),
        styles: {
          add: (style) => {
            if (liveDoc.current) TextDocumentState.addStyle(liveDoc.current, style);
          },
          set: (styles) => {
            if (liveDoc.current)
              TextDocumentState.setStyles(
                liveDoc.current,
                format,
                styles,
                TEXT_DOCUMENT_STYLES_ORIGIN,
              );
          },
        },
        defaultStyles: {
          read: readDefaultStyles,
          save: (saved) => saveDefaultStyles(saved, ownerId),
        },
        format,
        canEdit,
      }),
    [view, liveDoc, format, canEdit, ownerId],
  );
}
