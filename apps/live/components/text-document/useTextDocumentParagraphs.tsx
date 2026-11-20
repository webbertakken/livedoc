'use client';

// A text document's paragraph formatting on the surface (docs/specs/034-text-documents/text-and-paragraphs.md
// "Alignment and indents"): Format > Align & indent and the toolbar's Align and indent controls bound to the editor
// there is now, and the Indentation options dialog they open.
import { useMemo, useState, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { track } from '@/lib/telemetry';
import { indentUnit } from '@/lib/text-document/indent-units';
import { textDocumentParagraphActions } from '@/lib/text-document/text-document-paragraph-actions';
import {
  indentsOf,
  setIndents,
  type Indents,
} from '@/lib/text-document/text-document-paragraph-formatting';
import { textFormattingReader } from '@/lib/text-document/useTextDocumentFormatting';
import { TextDocumentIndentationDialog } from './TextDocumentIndentationDialog';

export function useTextDocumentParagraphs(
  view: EditorView | null,
  liveDoc: RefObject<Y.Doc | null>,
  format: TextDocumentFormat,
  canEdit: boolean,
) {
  // The paragraphs' indents as the dialog opened on them; null while it is closed.
  const [indentation, setIndentation] = useState<Indents | null>(null);
  const readFormatting = useMemo(
    () => textFormattingReader(view, liveDoc, format),
    [view, liveDoc, format],
  );
  const bound = useMemo(
    () =>
      textDocumentParagraphActions({
        view,
        readFormatting,
        canEdit,
        openIndentation: () => {
          if (view) setIndentation(indentsOf(view.state, readFormatting()));
        },
      }),
    [view, readFormatting, canEdit],
  );
  const close = () => {
    setIndentation(null);
    if (view && !view.isDestroyed) view.focus();
  };
  const dialog =
    indentation && view ? (
      <TextDocumentIndentationDialog
        open
        indents={indentation}
        unit={indentUnit()}
        onClose={close}
        onApply={(indents) => {
          if (!view.isDestroyed) {
            setIndents(readFormatting(), indents)(view.state, view.dispatch);
            track('Element', 'Changed', 'TextDocumentIndentation');
          }
          close();
        }}
      />
    ) : null;
  return { ...bound, dialog };
}
