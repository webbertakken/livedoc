'use client';

// The bar over a drawing tab in the canvas editor (docs/specs/034-text-documents/objects.md "Inserting and editing"):
// it names the text document the drawing is in, with Save and close for whoever may edit it (Close for anyone else),
// also on Shift+Escape (⌘Escape on a Mac). Below the top line, centred, so the palette keeps its place.
import { useEffect } from 'react';
import { Button, safeInset } from '@livedoc/ui';
import type { Tab } from '@livedoc/document';
import { useEditorContext } from '@/app/document/[id]/EditorContext';
import { useSelectTab } from '@/app/document/[id]/useSelectTab';
import { useTextDocumentDrawingClose } from './useTextDocumentDrawingClose';

/** Whether a key press leaves the drawing: Shift+Escape, or ⌘Escape on a Mac. */
export const leavesDrawing = (e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'metaKey'>): boolean =>
  e.key === 'Escape' && (e.shiftKey || e.metaKey);

export function TextDocumentDrawingBar() {
  const ctx = useEditorContext();
  const tab = ctx.activeTab;
  if (!tab.drawingOf) return null;
  return <DrawingBar key={tab.id} tab={tab as Tab & { drawingOf: string }} />;
}

function DrawingBar({ tab }: { tab: Tab & { drawingOf: string } }) {
  const ctx = useEditorContext();
  const selectTab = useSelectTab();
  const canEdit = ctx.can.textDocumentEdits && !ctx.isReadOnly;
  const { saveAndClose, saving, refused } = useTextDocumentDrawingClose({
    tab,
    canEdit,
    ownerId: ctx.selfParticipant.id,
    documentId: ctx.documentId,
    imageContext: ctx.imageContext ?? null,
    deleteTab: ctx.deleteTab,
    selectTab,
  });
  const name = ctx.tabs.find((t) => t.id === tab.drawingOf)?.name ?? 'Text document';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!leavesDrawing(e)) return;
      e.preventDefault();
      void saveAndClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveAndClose]);

  return (
    <div
      role="region"
      aria-label="Drawing"
      style={{ top: `calc(4.5rem + ${safeInset('top')})` }}
      className="absolute left-1/2 z-[var(--z-toolbar)] flex -translate-x-1/2 flex-col items-center gap-1"
    >
      <div className="flex items-center gap-3 rounded-control border border-slate-200 bg-white py-1 pl-3 pr-1 text-body text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        <span>
          Drawing in <strong className="font-medium">{name}</strong>
        </span>
        <Button size="xs" onClick={() => void saveAndClose()} disabled={saving}>
          {canEdit ? 'Save and close' : 'Close'}
        </Button>
      </div>
      {refused ? (
        <p
          role="alert"
          className="rounded-control bg-white px-3 py-1 text-body text-red-700 shadow-sm dark:bg-slate-900 dark:text-red-300"
        >
          {refused}
        </p>
      ) : null}
    </div>
  );
}
