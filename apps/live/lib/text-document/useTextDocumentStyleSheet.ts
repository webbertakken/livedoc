// A text document's paragraph styles drawn (docs/specs/034-text-documents/text-and-paragraphs.md "Paragraph styles"):
// one style sheet for the open body, scoped to it, written as the editor opens and again, at most once a frame, after
// any change to the live state that changed it (a style updated or added, by anyone), when tabs are laid out again.
import { useEffect, useId, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { TextDocumentState } from '@livedoc/text-documents';
import { textDocumentStyleSheet } from './text-document-style-sheet';
import { relayTextDocumentTabs } from './text-document-tab-layout';
import { relayoutPages } from './pagination/pagination-plugin';

export function useTextDocumentStyleSheet(
  view: EditorView | null,
  liveDoc: RefObject<Y.Doc | null>,
  format: TextDocumentFormat,
): void {
  const scope = useId();
  useEffect(() => {
    const doc = liveDoc.current;
    if (!view || !doc) return;
    view.dom.setAttribute('data-text-document-styles', scope);
    const sheet = document.createElement('style');
    sheet.dataset.textDocumentStyles = scope;
    document.head.append(sheet);
    const write = () => {
      const css = textDocumentStyleSheet(
        TextDocumentState.styles(doc, format),
        TextDocumentState.defaults(doc, format),
        `[data-text-document-styles="${scope}"]`,
      );
      if (sheet.textContent === css) return;
      sheet.textContent = css;
      // Styles move the writing, so its tabs and its pages are laid out again ("Tab stops", page-layout.md).
      if (!view.isDestroyed) {
        relayTextDocumentTabs(view);
        relayoutPages(view);
      }
    };
    let frame: number | null = null;
    const onUpdate = () => {
      frame ??= requestAnimationFrame(() => {
        frame = null;
        write();
      });
    };
    write();
    doc.on('update', onUpdate);
    return () => {
      doc.off('update', onUpdate);
      if (frame !== null) cancelAnimationFrame(frame);
      sheet.remove();
    };
  }, [view, liveDoc, format, scope]);
}
