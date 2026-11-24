'use client';

// The editor's drawing tabs as a text document works them (docs/specs/034-text-documents/objects.md "Drawings"):
// opening one shared with this person, copying one for a picture of its own, the ones a text document tab holds, who
// is in one, and dropping those no picture names. Each reads the editor as it is when asked, so the value holds still
// as the document's tabs change.
import { useMemo } from 'react';
import { drawingTabIdsOf } from '@livedoc/document';
import { useEditorContext } from '@/app/document/[id]/EditorContext';
import { useSelectTab } from '@/app/document/[id]/useSelectTab';
import { useLatest } from '@/hooks/ui/useLatest';
import type { DrawingTabs } from '@/lib/text-document/text-document-drawing-open-plugin';

export function useEditorDrawingTabs(): DrawingTabs {
  const ctx = useEditorContext();
  const latest = useLatest({ ctx, select: useSelectTab() });
  return useMemo<DrawingTabs>(() => {
    const drawingOf = (id: string) =>
      latest.current.ctx.tabs.find((t) => t.id === id)?.drawingOf ?? null;
    return {
      drawingOf,
      opens: (id) => drawingOf(id) !== null && !latest.current.ctx.isOutOfScope(id),
      open: (id) => latest.current.select(id),
      copy: (id, textDocumentTabId) => latest.current.ctx.copyDrawingTab(id, textDocumentTabId),
      ids: (textDocumentTabId) => drawingTabIdsOf(latest.current.ctx.tabs, textDocumentTabId),
      someoneIn: (id) => [...latest.current.ctx.remoteTabFocus.values()].includes(id),
      remove: (ids) => latest.current.ctx.removeDrawingTabs(ids),
      draw: async (id) => {
        const { tabs, loadedTabIds, isOutOfScope, imageContext } = latest.current.ctx;
        const tab = tabs.find((t) => t.id === id);
        if (!tab?.drawingOf || isOutOfScope(id) || !loadedTabIds.has(id)) return null;
        // The export's code loads only when a drawing is drawn.
        const { drawingPicture } =
          await import('@/lib/text-document/text-document-drawing-picture');
        return drawingPicture(tab, imageContext ?? null);
      },
    };
  }, [latest]);
}
