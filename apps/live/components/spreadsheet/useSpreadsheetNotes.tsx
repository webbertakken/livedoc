'use client';

// A spreadsheet's notes (docs/specs/029-sheets/review.md "Notes"): Insert › Note, the cell menu's Insert Note or Edit
// Note and Shift+F2 open the note box on the active cell, an Editor's (D647); its save gives every selected cell the
// note, or takes it off when empty, as one change (`Note`); Delete Notes takes off every note in the selection. A
// Participant and a Viewer read the markers and the hover card alone.
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { noteRanges, notesIn, deleteNotes, type GridRange } from '@livedoc/sheets';
import { readWorkbook } from '@/components/sheets/read-workbook';
import type { SheetController } from '@/components/sheets/sheet-controller';
import { mergeAt } from '@/components/sheets/sheet-geometry';
import type { OpenNoteCell } from '@/components/sheets/sheet-note-open-context';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  CELL_INSERT_NOTE,
  DELETE_NOTES,
  EDIT_NOTE,
  INSERT_NOTE,
} from '@/lib/spreadsheet/sheet-notes';
import { track } from '@/lib/telemetry';
import { cellScreenBox } from './active-cell-box';
import { SheetNoteBox } from './SheetNoteBox';

type Opened = {
  nonce: number;
  // The cell the box is on (a merged area's top-left) and the selection its save writes to.
  at: OpenNoteCell;
  ranges: readonly GridRange[];
  note: string;
};

export function useSpreadsheetNotes(c: SheetController): {
  actions: OfficeActions;
  box: ReactNode;
  open: OpenNoteCell | null;
} {
  const [opened, setOpened] = useState<Opened | null>(null);
  const sheetId = c.sheet.id;
  const { r, c: col } = c.selection.active;
  // A merged cell's note is its top-left cell's.
  const merge = mergeAt(c.geometry, r, col);
  const noteR = merge ? merge.r1 : r;
  const noteC = merge ? merge.c1 : col;
  const here = readWorkbook(c.version, () => c.workbook.cellNoteOf(sheetId, noteR, noteC));
  const { ranges } = c.selection;
  const anyNotes = readWorkbook(c.version, () => notesIn(c.sheet, ranges));
  const { canShape } = c;

  const openBox = useCallback(() => {
    if (!canShape) return;
    setOpened({
      nonce: Date.now(),
      at: { sheetId, r: noteR, c: noteC },
      ranges,
      note: here ?? '',
    });
    debugLog(`[sheets] note box opened sheet=${sheetId} noted=${here !== null}`);
  }, [canShape, sheetId, noteR, noteC, ranges, here]);

  const save = useCallback(
    (text: string, toGrid: boolean) => {
      if (!opened) return;
      setOpened(null);
      const made = noteRanges(c.workbook, opened.at.sheetId, opened.ranges, text);
      if (made && 'refusal' in made) {
        debugLog(`[sheets] note refused ${made.refusal}`);
        c.toast(made.message);
      } else if (made) {
        const ok = c.write(made.write, 'Note');
        if (ok) track('Spreadsheet', 'Changed', 'Note');
        const cells = made.write.kind === 'cells' ? made.write.cells.length : 0;
        debugLog(
          `[sheets] note saved sheet=${opened.at.sheetId} cells=${cells} removed=${text === ''} ok=${ok}`,
        );
      } else debugLog(`[sheets] note unchanged sheet=${opened.at.sheetId}`);
      if (toGrid) c.focusGrid();
    },
    [c, opened],
  );

  const remove = useCallback(() => {
    const write = deleteNotes(c.sheet, c.selection.ranges);
    const ok = write ? c.write(write, 'Note') : false;
    if (ok) track('Spreadsheet', 'Changed', 'Note');
    debugLog(`[sheets] notes deleted sheet=${c.sheet.id} ok=${ok}`);
    c.focusGrid();
  }, [c]);

  const actions = useMemo((): OfficeActions => {
    if (!canShape) return {};
    return {
      [INSERT_NOTE]: { run: openBox },
      [here === null ? CELL_INSERT_NOTE : EDIT_NOTE]: { run: openBox },
      ...(anyNotes ? { [DELETE_NOTES]: { run: remove } } : {}),
    };
  }, [canShape, openBox, here, anyNotes, remove]);

  const box = opened ? (
    <SheetNoteBox
      key={opened.nonce}
      cell={cellScreenBox(c, opened.at.r, opened.at.c)}
      note={opened.note}
      onSave={save}
    />
  ) : null;
  return { actions, box, open: opened?.at ?? null };
}
