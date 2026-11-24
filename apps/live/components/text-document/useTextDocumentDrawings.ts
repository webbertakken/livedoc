'use client';

// Drawings in the writing (docs/specs/034-text-documents/objects.md "Inserting and editing", "Where it goes"):
// Insert > Drawing > New keeps where the caret is and opens a new drawing tab; when Save and close has made the
// drawing's picture, the text document places it there (its document tab shown first), one undo step.
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
}): OfficeActions {
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
    const at = placeIn(
      view,
      ready.where.anchor ? positionOf(view.state, ready.where.anchor) : null,
    );
    const put: PutPicture = ({ key, pixels }) =>
      insertPicture(
        {
          key,
          drawing: ready.drawingTabId,
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
      takeDrawing(ready.drawingTabId);
      placingNow.current = null;
      if (placed) track('Element', 'Added', 'TextDocumentDrawing');
      debugLog('[text-document] drawing placed', { drawing: ready.drawingTabId, placed });
    });
  }, [view, canEdit, shownTab, tabId, showTab, placing]);

  return useMemo<OfficeActions>(() => {
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
}
