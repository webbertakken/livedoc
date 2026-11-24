'use client';

// Leaving a drawing tab (docs/specs/034-text-documents/objects.md "Inserting and editing", "Its picture"): Save and
// close makes the drawing's picture, stores it as an inserted picture is and goes back to its text document, which
// places it; an empty drawing is removed and places nothing; a picture that cannot be stored keeps the drawing open,
// said in the words a refused picture has. Anyone who cannot edit only closes it.
import { useCallback, useMemo, useState } from 'react';
import type { Tab } from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';
import { addImageFileForDocument, ImageUploadError } from '@/lib/upload-image';
import {
  drawingPending,
  drawingReady,
  putDrawingPending,
  takeDrawing,
} from '@/lib/text-document/text-document-drawing-pending';
import { storeOrKeep } from '@/lib/text-document/text-document-picture-place';

/** What a drawing whose picture could not be made or stored says, as a picture refused on insert does. */
export const DRAWING_NOT_STORED = 'The picture could not be added.';

export function useTextDocumentDrawingClose({
  tab,
  canEdit,
  ownerId,
  documentId,
  imageContext,
  deleteTab,
  selectTab,
}: {
  // The drawing tab open in the canvas editor.
  tab: Tab & { drawingOf: string };
  canEdit: boolean;
  ownerId: string;
  documentId: string | null;
  imageContext: { ownerId: string; documentId: string; shareCode: string | null } | null;
  deleteTab: (id: string) => void;
  selectTab: (id: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const store = useMemo(
    () => storeOrKeep((file) => addImageFileForDocument(ownerId, documentId, file)),
    [ownerId, documentId],
  );

  const close = useCallback(() => selectTab(tab.drawingOf), [selectTab, tab.drawingOf]);

  const saveAndClose = useCallback(async () => {
    if (!canEdit) return close();
    if (tab.elements.length === 0) {
      takeDrawing(tab.id);
      deleteTab(tab.id);
      debugLog('[text-document] drawing empty, removed', { drawing: tab.id });
      return;
    }
    setSaving(true);
    setRefused(null);
    try {
      // The export's code loads only when a drawing is saved.
      const { drawingPicture } = await import('@/lib/text-document/text-document-drawing-picture');
      const bytes = await drawingPicture(tab, imageContext);
      const stored = await store(new File([bytes.slice()], 'drawing.png', { type: 'image/png' }));
      if (!drawingPending(tab.id))
        putDrawingPending(tab.id, {
          textDocumentTabId: tab.drawingOf,
          documentTab: '',
          anchor: null,
        });
      drawingReady(tab.id, { bytes, stored });
      debugLog('[text-document] drawing saved', { drawing: tab.id, gallery: stored !== null });
      close();
    } catch (error) {
      const message = error instanceof ImageUploadError ? error.message : DRAWING_NOT_STORED;
      setRefused(message);
      debugLog('[text-document] drawing not stored', { drawing: tab.id, error: String(error) });
    } finally {
      setSaving(false);
    }
  }, [canEdit, close, tab, imageContext, store, deleteTab]);

  return { saveAndClose, close, saving, refused };
}
