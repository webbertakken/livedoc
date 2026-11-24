'use client';

// Drawings in the writing (docs/specs/034-text-documents/objects.md "Inserting and editing", "Where it goes", "Opening
// it again", "Its picture again"): Insert > Drawing > New keeps where the caret is and opens a new drawing tab; a
// picture opens its drawing, keeping where the picture is. When Save and close has made the drawing's picture, the text
// document puts it in the pictures naming it, or, where none does, places it there (its document tab shown first),
// one undo step either way.
import { useEffect, useMemo, useRef } from 'react';
import { Selection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import {
  putDrawingPending,
  readyDrawingFor,
  takeDrawing,
} from '@/lib/text-document/text-document-drawing-pending';
import {
  drawingPicturesIn,
  refreshDrawingPictures,
  repointDrawingPicture,
} from '@/lib/text-document/text-document-drawing-pictures';
import { startUndoStep } from '@/lib/text-document/text-document-undo';
import { TextDocumentState } from '@livedoc/text-documents';
import type {
  DrawingTabs,
  OpenDrawing,
} from '@/lib/text-document/text-document-drawing-open-plugin';
import {
  insertedPictureSize,
  insertPicture,
} from '@/lib/text-document/text-document-picture-insert';
import {
  placeStoredPicture,
  type PicturePlacing,
  type PutPicture,
} from '@/lib/text-document/text-document-picture-place';
import { anchorOf, positionOf } from '@/lib/text-document/text-document-relative-positions';

/** The menu item that starts a drawing. */
export const DRAWING_NEW_ITEM = 'drawing-new';

/** A drawing's picture is made at twice its size (objects.md "Its picture"): placed at its drawn size. */
export const DRAWING_PICTURE_SCALE = 2;

/** Where a picture can go in the body: `at` when it is inside a paragraph's text, else the body's end. */
function placeIn(view: EditorView, at: number | null): number {
  const doc = view.state.doc;
  if (at !== null && at >= 0 && at <= doc.content.size && doc.resolve(at).parent.inlineContent)
    return at;
  return Selection.atEnd(doc).from;
}

export function useTextDocumentDrawings({
  view,
  tabId,
  canEdit,
  shownTab,
  showTab,
  placing,
  create,
  drawingTabs,
}: {
  view: EditorView | null;
  // The text document tab this surface shows.
  tabId: string;
  // Whether drawings may be put in: an Editor, in the body.
  canEdit: boolean;
  // The document tab the editor shows, and how another is shown.
  shownTab: string | null;
  showTab: { readonly current: (tab: string) => void };
  placing: PicturePlacing;
  // Adds an empty drawing tab of this text document tab and opens it; its id, or null when none may be added.
  create: (() => string | null) | null;
  // The editor's drawing tabs, opened in the canvas editor; null where none may be opened (outside an editor).
  drawingTabs: DrawingTabs | null;
}): { actions: OfficeActions; open: OpenDrawing | null } {
  // Placed once each: a re-render while its upload settles must not place it twice.
  const placingNow = useRef<string | null>(null);

  useEffect(() => {
    if (!view || !canEdit || shownTab === null) return;
    const ready = readyDrawingFor(tabId);
    if (!ready || placingNow.current === ready.drawingTabId) return;
    if (ready.where.documentTab && ready.where.documentTab !== shownTab) {
      showTab.current(ready.where.documentTab);
      return;
    }
    placingNow.current = ready.drawingTabId;
    const drawing = ready.drawingTabId;
    const named = drawingPicturesIn(view.state.doc, drawing).length;
    const at = placeIn(
      view,
      ready.where.anchor ? positionOf(view.state, ready.where.anchor) : null,
    );
    const put: PutPicture = ({ key, pixels }) =>
      named > 0
        ? refreshDrawingPictures(drawing, { key, pixels })
        : insertPicture(
            {
              key,
              drawing,
              ...insertedPictureSize(
                {
                  width: pixels.width / DRAWING_PICTURE_SCALE,
                  height: pixels.height / DRAWING_PICTURE_SCALE,
                },
                placing.room(),
              ),
            },
            at,
          );
    void placeStoredPicture(placing, ready.bytes, ready.stored, put).then((placed) => {
      takeDrawing(drawing);
      placingNow.current = null;
      if (placed && named > 0) track('Element', 'Changed', 'TextDocumentImageDrawing');
      else if (placed) track('Element', 'Added', 'TextDocumentDrawing');
      debugLog(named > 0 ? '[text-document] drawing refreshed' : '[text-document] drawing placed', {
        drawing,
        placed,
        count: named,
      });
    });
  }, [view, canEdit, shownTab, tabId, showTab, placing]);

  const actions = useMemo<OfficeActions>(() => {
    if (!canEdit || !create || !view) return {};
    return {
      [DRAWING_NEW_ITEM]: {
        run: () => {
          const anchor = anchorOf(view.state, view.state.selection.from);
          const drawing = create();
          if (!drawing) return;
          putDrawingPending(drawing, {
            textDocumentTabId: tabId,
            documentTab: shownTab ?? '',
            anchor,
          });
          debugLog('[text-document] drawing started', { drawing, anchored: anchor !== null });
        },
      },
    };
  }, [canEdit, create, view, tabId, shownTab]);

  // Opening a drawing again: an Editor's Save and close comes back to where its picture is. A drawing whose tab is not
  // there to open (gone, or outside this person's share) stays its picture.
  const open = useMemo<OpenDrawing | null>(() => {
    if (!drawingTabs || !view) return null;
    return (drawing, pos) => {
      if (!drawingTabs.opens(drawing)) {
        debugLog('[text-document] drawing not opened', { drawing });
        return;
      }
      const opened = canEdit ? ownDrawing(drawing, pos) : drawing;
      if (canEdit)
        putDrawingPending(opened, {
          textDocumentTabId: tabId,
          documentTab: shownTab ?? '',
          anchor: anchorOf(view.state, pos),
        });
      debugLog('[text-document] drawing opened', { drawing: opened, editing: canEdit });
      drawingTabs.open(opened);
    };
    // One drawing, one picture (objects.md): a drawing another picture also names, or another text document tab's, is
    // first copied for this picture, which names the copy from then on (its own undo step). The drawing to open.
    function ownDrawing(drawing: string, pos: number): string {
      const doc = placing.doc();
      const named = doc ? (TextDocumentState.drawingNames(doc).get(drawing) ?? 0) : 0;
      if (named <= 1 && drawingTabs!.drawingOf(drawing) === tabId) return drawing;
      const copy = drawingTabs!.copy(drawing, tabId);
      if (!copy || !view) {
        debugLog('[text-document] drawing copy refused', { drawing });
        return drawing;
      }
      startUndoStep(view);
      const repointed = repointDrawingPicture(pos, drawing, copy)(view.state, view.dispatch);
      startUndoStep(view);
      debugLog('[text-document] drawing copied', { from: drawing, to: copy, repointed });
      return repointed ? copy : drawing;
    }
  }, [drawingTabs, view, canEdit, tabId, shownTab, placing]);

  return { actions, open };
}
