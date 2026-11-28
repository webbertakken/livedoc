'use client';

// A spreadsheet's images over cells (docs/specs/029-sheets/inserted-objects.md "Images over cells", D623, D625): the
// open sheet's image objects handed to the grid's images layer at their px places; Insert Image over Cells placing a
// picked picture at the active cell; the image's menu (Alt Text, Replace Image, Place Image in Selected Cell, Delete);
// each change one undo step, written back as the sheet's layout write. An Editor's alone.
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { makeAxisIds, type SheetImage, type SheetObject } from '@livedoc/sheets';
import { OfficeAltTextDialog, type AltTextChange } from '@/components/office/OfficeAltTextDialog';
import { OfficeContextMenu } from '@/components/office/OfficeContextMenu';
import type { SheetController } from '@/components/sheets/sheet-controller';
import {
  markPlacedImage,
  type SheetImageAccess,
  type SheetImagesOverCells,
} from '@/components/sheets/sheet-images-over-cells-context';
import { apiListImages } from '@/lib/api-client';
import { getWorkbenchConfinement } from '@/lib/api/workbench-confinement';
import { debugLog } from '@/lib/debug-log';
import type { Point } from '@/lib/office/context-menu-place';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { isOfflineIdSync } from '@/lib/offline/offline-store';
import {
  IMAGE_ALT_TEXT,
  IMAGE_DELETE,
  IMAGE_MENU_ENTRIES,
  IMAGE_REPLACE,
  INSERT_IMAGE_OVER_CELLS,
  PLACE_IMAGE_IN_CELL,
  insertImageAction,
  type ImagePlacing,
} from '@/lib/spreadsheet/sheet-image-menu';
import {
  altOfTitled,
  newSheetImage,
  replacedImage,
  type ImageBox,
  type PickedPicture,
} from '@/lib/spreadsheet/sheet-image-place';
import { pictureIntoCellWrite } from '@/lib/spreadsheet/sheet-cell-picture';
import { track } from '@/lib/telemetry';
import { anchorAt, anchorPx } from '../charts/sheet-chart-place';

const ImagePicker = dynamic(
  () => import('@/components/panels/ImagePicker').then((m) => m.ImagePicker),
  { ssr: false },
);

/** Said when a picked picture is not one the gallery holds (a This Browser embed). */
export const PICTURE_NOT_PLACED = 'That picture could not be placed. Try another.';

// A menu opens this far below what opened it.
const MENU_GAP_PX = 4;

type Picking = { for: 'insert' } | { for: 'replace'; id: string };

// The editor in a workbench uploads into its one document and never reads the person's gallery (workbench-embeds.md).
const inWorkbench = () => getWorkbenchConfinement() !== null;

/** Whether this deployment and document can hold images over cells or in them (the gallery's probe, This Browser). */
function useImagePlacing(access: SheetImageAccess, canShape: boolean): ImagePlacing {
  const local = isOfflineIdSync(access.documentId);
  const [probed, setProbed] = useState<ImagePlacing>('ready');
  useEffect(() => {
    // A workbench may not list the gallery: its picker uploads alone, and an upload refused says why.
    if (!canShape || local || inWorkbench()) return;
    let live = true;
    apiListImages(access.ownerId)
      .then((list) => {
        if (!live) return;
        setProbed(list === null ? 'unavailable' : 'ready');
        debugLog(`[sheet-images] probe ${list === null ? 'unavailable' : 'ready'}`);
      })
      .catch(() => debugLog('[sheet-images] probe failed'));
    return () => {
      live = false;
    };
  }, [access.ownerId, canShape, local]);
  return local ? 'local' : probed;
}

export function useSpreadsheetImages(
  c: SheetController,
  access: SheetImageAccess,
): {
  value: SheetImagesOverCells | null;
  actions: OfficeActions;
  dialogs: ReactNode;
  // Where pictures can be placed, for Insert Image in Cell (useSpreadsheetCellPictures).
  placing: ImagePlacing;
} {
  const { sheet, geometry, canShape, write, announce } = c;
  const objects = sheet.layout.objects;
  const images = useMemo(
    () => (objects ?? []).filter((x): x is SheetImage => x.kind === 'image'),
    [objects],
  );
  const placing = useImagePlacing(access, canShape);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [menu, setMenu] = useState<{ id: string; at: Point } | null>(null);
  const [altFor, setAltFor] = useState<{ id: string; nonce: number } | null>(null);

  const put = useCallback(
    (id: string, object: SheetObject | null, what: string) => {
      const ok = write({ kind: 'layout', changes: [{ k: 'object', id, object }] }, 'Image');
      debugLog(`[sheet-images] ${what} sheet=${sheet.id} image=${id} ok=${ok}`);
      return ok;
    },
    [write, sheet.id],
  );
  const find = useCallback((id: string) => images.find((x) => x.id === id), [images]);

  const value = useMemo((): SheetImagesOverCells | null => {
    if (images.length === 0) return null;
    return {
      images: images.map((image) => ({ image, ...anchorPx(image.at, sheet.layout, geometry) })),
      access,
      editable: canShape,
      place: (id: string, box: ImageBox, what: 'moved' | 'resized') => {
        const cur = find(id);
        if (!cur) return;
        put(
          id,
          {
            ...cur,
            at: anchorAt({ x: box.x, y: box.y }, sheet.layout, geometry),
            width: box.width,
            height: box.height,
          },
          what,
        );
      },
      remove: (id: string) => void put(id, null, 'removed'),
      // Below its ⋮ button, or at a right-click's pointer.
      menu: (id: string, at: DOMRect) =>
        setMenu({ id, at: { x: at.left, y: at.bottom + MENU_GAP_PX } }),
      menuFor: menu?.id ?? null,
    };
  }, [images, sheet.layout, geometry, access, canShape, find, put, menu]);

  const insert = useCallback(
    (picked: PickedPicture) => {
      const { active } = c.selectionNow();
      const { rows, cols } = sheet.layout;
      const at = { r: rows[active.r]!, c: cols[active.c]!, dx: 0, dy: 0 };
      const taken = new Set((objects ?? []).map((x) => x.id));
      const [id] = makeAxisIds(1, Math.random, taken);
      // Selected as it draws, ready to move (SheetImagesLayer).
      markPlacedImage(id!);
      if (put(id!, newSheetImage(id!, picked, at), 'inserted'))
        track('Spreadsheet', 'Added', 'ImageOverCells');
    },
    [c, sheet.layout, objects, put],
  );

  const picked = useCallback(
    (was: Picking, image: PickedPicture) => {
      setPicking(null);
      // A sheet holds gallery ids alone (D625): an embedded picture is never placed.
      if (image.id.startsWith('data:')) {
        announce(PICTURE_NOT_PLACED);
        debugLog('[sheet-images] picked picture embedded, not placed');
        return;
      }
      if (was.for === 'insert') return insert(image);
      const cur = find(was.id);
      if (cur) put(cur.id, replacedImage(cur, image), 'replaced');
    },
    [insert, find, put, announce],
  );

  const applyAlt = useCallback(
    (change: AltTextChange) => {
      const cur = altFor && find(altFor.id);
      setAltFor(null);
      if (!cur) return;
      const { alt: _alt, ...rest } = cur;
      const alt = altOfTitled(change.title, change.alt);
      put(cur.id, alt ? { ...rest, alt } : rest, 'alt');
    },
    [altFor, find, put],
  );

  const actions = useMemo(
    (): OfficeActions =>
      canShape
        ? {
            [INSERT_IMAGE_OVER_CELLS]: insertImageAction(placing, () =>
              setPicking({ for: 'insert' }),
            ),
          }
        : {},
    [canShape, placing],
  );

  const menuActions = useMemo((): OfficeActions => {
    const id = menu?.id;
    if (!id) return {};
    return {
      [IMAGE_ALT_TEXT]: { run: () => setAltFor({ id, nonce: Date.now() }) },
      [IMAGE_REPLACE]: insertImageAction(placing, () => setPicking({ for: 'replace', id })),
      // Into the active cell, its alt text kept (inserted-objects.md "Images in a cell", D632).
      [PLACE_IMAGE_IN_CELL]: {
        run: () => {
          const cur = find(id);
          const { active } = c.selectionNow();
          const at = { r: sheet.layout.rows[active.r]!, c: sheet.layout.cols[active.c]! };
          if (!cur) return;
          const ok = write(pictureIntoCellWrite(cur, at), 'Image');
          debugLog(`[sheet-images] into-cell sheet=${sheet.id} image=${id} ok=${ok}`);
          c.focusGrid();
        },
      },
      [IMAGE_DELETE]: {
        run: () => {
          put(id, null, 'removed');
          c.focusGrid();
        },
      },
    };
  }, [menu, placing, put, c, find, sheet.layout, sheet.id, write]);

  const altImage = altFor ? find(altFor.id) : undefined;
  const dialogs = (
    <>
      {menu ? (
        <OfficeContextMenu
          entries={IMAGE_MENU_ENTRIES}
          at={menu.at}
          actions={menuActions}
          shortcutOf={() => null}
          onClose={() => setMenu(null)}
        />
      ) : null}
      {altFor && altImage ? (
        <OfficeAltTextDialog
          key={altFor.nonce}
          open
          withTitle
          alt={altImage.alt ?? ''}
          onApply={applyAlt}
          onClose={() => setAltFor(null)}
        />
      ) : null}
      {picking ? (
        <ImagePicker
          ownerId={access.ownerId}
          documentId={access.documentId}
          forElementId={null}
          uploadOnly={inWorkbench()}
          onSelect={(image) => picked(picking, image)}
          onClose={() => {
            setPicking(null);
            c.focusGrid();
          }}
        />
      ) : null}
    </>
  );

  return { value, actions, dialogs, placing };
}
