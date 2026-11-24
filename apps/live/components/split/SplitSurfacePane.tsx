'use client';

import { surfaceOf, type Tab } from '@livedoc/document';
import { useEditorContext } from '@/app/document/[id]/EditorContext';
import { PdfDocumentHost } from '@/components/pdf-document/PdfDocumentHost';
import { TextDocumentHost } from '@/components/text-document/TextDocumentHost';

// The other pane for a tab outside the canvas (docs/specs/006-document/kinds-outside-the-canvas.md "Side by side"): a
// text document's surface, live and read-only, and a PDF's pages the same; a surface with no read-only view yet (the spreadsheet) its tab's name
// and "Click to edit.". A press anywhere in it moves the editor across, as the canvas's other pane does.
export function SplitSurfacePane({
  tab,
  onFocus,
}: {
  tab: Tab;
  onFocus: (via: 'Click' | 'Hover') => void;
}) {
  const { documentWorkbook } = useEditorContext();
  const surface = surfaceOf(tab, documentWorkbook !== null);
  return (
    <section
      aria-label={`${tab.name}, side by side. Click to edit.`}
      data-split-surface-pane={surface ?? ''}
      className="relative flex h-full min-w-0 cursor-pointer flex-col"
      onPointerDownCapture={() => onFocus('Click')}
    >
      {surface === 'text-document' ? (
        <TextDocumentHost tab={tab} readOnly />
      ) : surface === 'pdf' ? (
        <PdfDocumentHost tab={tab} readOnly />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1 bg-slate-100 p-4 text-body text-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <p className="font-medium">{tab.name}</p>
          <p>Click to edit.</p>
        </div>
      )}
    </section>
  );
}
