'use client';

// Pictures held in cells (docs/specs/029-sheets/inserted-objects.md "Images in a cell", D630, D632): Insert Image in
// Cell putting a picked picture in the active cell, and on a cell holding one, its Alt Text and Place Image over Cells
// in the cell's context menu. Each change one write, one undo step; a protection refuses it as it refuses typing. An
// Editor's alone; the grid draws the pictures for everyone (SheetCellPicture).
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { cellKey, makeAxisIds, pictureInput, type SheetWrite } from '@livedoc/sheets';
import { OfficeAltTextDialog, type AltTextChange } from '@/components/office/OfficeAltTextDialog';
import type { SheetController } from '@/components/sheets/sheet-controller';
import {
  markPlacedImage,
  type SheetImageAccess,
} from '@/components/sheets/sheet-images-over-cells-context';
import { getWorkbenchConfinement } from '@/lib/api/workbench-confinement';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  cellPictureOf,
  pictureOverCellsWrite,
  type CellIds,
} from '@/lib/spreadsheet/sheet-cell-picture';
import {
  CELL_PICTURE_ALT_TEXT,
  INSERT_IMAGE_IN_CELL,
  PLACE_IMAGE_OVER_CELLS,
  insertImageAction,
  type ImagePlacing,
} from '@/lib/spreadsheet/sheet-image-menu';
import { altOfTitled, type PickedPicture } from '@/lib/spreadsheet/sheet-image-place';
import { track } from '@/lib/telemetry';
import { pictureNaturalSize } from './picture-natural-size';
import { PICTURE_NOT_PLACED } from './useSpreadsheetImages';

const ImagePicker = dynamic(
  () => import('@/components/panels/ImagePicker').then((m) => m.ImagePicker),
  { ssr: false },
);

export function useSpreadsheetCellPictures(
  c: SheetController,
  access: SheetImageAccess,
  placing: ImagePlacing,
): { actions: OfficeActions; dialogs: ReactNode } {
  const { sheet, canShape, write, announce } = c;
  const [picking, setPicking] = useState(false);
  const [altFor, setAltFor] = useState<{ at: CellIds; nonce: number } | null>(null);
  const { active } = c.selection;
  // The active cell is always one of the grid's.
  const here = useMemo(
    (): CellIds => ({ r: sheet.layout.rows[active.r]!, c: sheet.layout.cols[active.c]! }),
    [sheet.layout, active.r, active.c],
  );
  const pictureAt = useCallback(
    (at: CellIds) => cellPictureOf(sheet.cells.get(cellKey(at.r, at.c))),
    [sheet.cells],
  );
  const pictureHere = pictureAt(here);

  const send = useCallback(
    (w: SheetWrite, what: string) => {
      const ok = write(w, 'Image');
      debugLog(`[sheet-images] cell ${what} sheet=${sheet.id} ok=${ok}`);
      return ok;
    },
    [write, sheet.id],
  );

  const picked = useCallback(
    (image: PickedPicture) => {
      setPicking(false);
      // A cell holds gallery ids alone (D625): an embedded picture is never placed.
      if (image.id.startsWith('data:')) {
        announce(PICTURE_NOT_PLACED);
        debugLog('[sheet-images] picked picture embedded, not placed in a cell');
        return;
      }
      const { active: now } = c.selectionNow();
      const r = sheet.layout.rows[now.r]!;
      const col = sheet.layout.cols[now.c]!;
      const ok = send(
        { kind: 'cells', cells: [{ r, c: col, i: pictureInput(image.id) }] },
        'inserted',
      );
      if (ok) track('Spreadsheet', 'Added', 'ImageInCell');
      c.focusGrid();
    },
    [c, sheet.layout, send, announce],
  );

  const placeOver = useCallback(
    async (at: CellIds) => {
      const picture = pictureAt(at);
      if (!picture) return;
      const natural = await pictureNaturalSize(access, picture.id);
      const taken = new Set((sheet.layout.objects ?? []).map((x) => x.id));
      const [id] = makeAxisIds(1, Math.random, taken);
      // Selected as it draws, ready to move (SheetImagesLayer).
      markPlacedImage(id!);
      send(pictureOverCellsWrite(id!, picture, at, natural), 'over-cells');
    },
    [pictureAt, access, sheet.layout.objects, send],
  );

  const applyAlt = useCallback(
    (change: AltTextChange) => {
      const at = altFor?.at;
      setAltFor(null);
      const picture = at && pictureAt(at);
      if (!at || !picture) return;
      const alt = altOfTitled(change.title, change.alt);
      send({ kind: 'cells', cells: [{ ...at, i: pictureInput(picture.id, alt) }] }, 'alt');
      c.focusGrid();
    },
    [altFor, pictureAt, send, c],
  );

  const actions = useMemo((): OfficeActions => {
    if (!canShape) return {};
    const out: OfficeActions = {
      [INSERT_IMAGE_IN_CELL]: insertImageAction(placing, () => setPicking(true), 'in'),
    };
    if (!pictureHere) return out;
    return {
      ...out,
      [CELL_PICTURE_ALT_TEXT]: { run: () => setAltFor({ at: here, nonce: Date.now() }) },
      [PLACE_IMAGE_OVER_CELLS]: { run: () => void placeOver(here) },
    };
  }, [canShape, placing, here, pictureHere, placeOver]);

  const altPicture = altFor ? pictureAt(altFor.at) : null;
  const dialogs = (
    <>
      {altFor && altPicture ? (
        <OfficeAltTextDialog
          key={altFor.nonce}
          open
          withTitle
          alt={altPicture.alt ?? ''}
          onApply={applyAlt}
          onClose={() => {
            setAltFor(null);
            c.focusGrid();
          }}
        />
      ) : null}
      {picking ? (
        <ImagePicker
          ownerId={access.ownerId}
          documentId={access.documentId}
          forElementId={null}
          uploadOnly={getWorkbenchConfinement() !== null}
          onSelect={picked}
          onClose={() => {
            setPicking(false);
            c.focusGrid();
          }}
        />
      ) : null}
    </>
  );

  return { actions, dialogs };
}
