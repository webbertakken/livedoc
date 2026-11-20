'use client';

// A text document's paragraph formatting on the surface (docs/specs/034-text-documents/text-and-paragraphs.md
// "Alignment and indents", "Spacing and keep rules", "Borders and shading"): Format > Align & indent and Line &
// paragraph spacing, and the toolbar's controls for them, bound to the editor there is now, with the Indentation
// options, Custom spacing and Borders and shading dialogs they open.
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
  setSpacing,
  spacingOf,
  type Indents,
  type Spacing,
} from '@/lib/text-document/text-document-paragraph-formatting';
import { textFormattingReader } from '@/lib/text-document/useTextDocumentFormatting';
import { TextDocumentIndentationDialog } from './TextDocumentIndentationDialog';
import { TextDocumentSpacingDialog } from './TextDocumentSpacingDialog';
import { TextDocumentBordersDialog } from './TextDocumentBordersDialog';
import { bordersOf, setBordersAndShading } from '@/lib/text-document/text-document-borders';

export function useTextDocumentParagraphs(
  view: EditorView | null,
  liveDoc: RefObject<Y.Doc | null>,
  format: TextDocumentFormat,
  canEdit: boolean,
) {
  // The paragraphs' indents as the dialog opened on them; null while it is closed.
  const [indentation, setIndentation] = useState<Indents | null>(null);
  // The paragraphs' spacing as Custom spacing opened on them; null while it is closed.
  const [spacing, setSpacingDraft] = useState<Spacing | null>(null);
  // Borders and shading is open (it reads the paragraphs as its positions change).
  const [bordering, setBordering] = useState(false);
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
        openSpacing: () => {
          if (view) setSpacingDraft(spacingOf(view.state, readFormatting()));
        },
        openBorders: () => setBordering(true),
      }),
    [view, readFormatting, canEdit],
  );
  const close = () => {
    setIndentation(null);
    setSpacingDraft(null);
    setBordering(false);
    if (view && !view.isDestroyed) view.focus();
  };
  const dialog =
    bordering && view ? (
      <TextDocumentBordersDialog
        open
        odf={format === 'odf'}
        read={(sides) => bordersOf(view.state, readFormatting(), sides)}
        onClose={close}
        onApply={(change) => {
          if (!view.isDestroyed) {
            setBordersAndShading(readFormatting(), change)(view.state, view.dispatch);
            track('Element', 'Changed', 'TextDocumentBordersAndShading');
          }
          close();
        }}
      />
    ) : spacing && view ? (
      <TextDocumentSpacingDialog
        open
        spacing={spacing}
        onClose={close}
        onApply={(next) => {
          if (!view.isDestroyed) {
            setSpacing(readFormatting(), next)(view.state, view.dispatch);
            track('Element', 'Changed', 'TextDocumentCustomSpacing');
          }
          close();
        }}
      />
    ) : indentation && view ? (
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
