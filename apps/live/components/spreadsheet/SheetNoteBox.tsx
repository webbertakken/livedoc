'use client';

// The note box (docs/specs/029-sheets/review.md "Notes"): a card at the active cell's top right holding its note as
// plain text, the caret at its end. Clicking away, Escape or Shift+F2 saves it (D643), each once; an empty note takes
// the note off. Escape and Shift+F2 give the grid the keys back.
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { SHEET_NOTE_MAX } from '@livedoc/sheets';
import { OfficePopup } from '@/components/office/OfficePopup';
import { POPUP_GAP, type Box } from '@/lib/office/popup-place';
import type { ScreenCellBox } from './active-cell-box';

export function SheetNoteBox({
  cell,
  note,
  onSave,
}: {
  // The active cell's box on the screen.
  cell: ScreenCellBox;
  note: string;
  // Saves the text; `toGrid` when the keys go back to the grid (Escape, Shift+F2) rather than where the press went.
  onSave: (text: string, toGrid: boolean) => void;
}) {
  const [text, setText] = useState(note);
  const field = useRef<HTMLTextAreaElement>(null);
  const saved = useRef(false);
  // The box opens on the cell's right edge, level with its top (the popup opens below its anchor's bottom).
  const anchor: Box = { left: cell.right + 2, top: cell.top, bottom: cell.top - POPUP_GAP };
  // The caret at the note's end, the field focused once drawn.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const save = (toGrid: boolean) => {
    if (saved.current) return;
    saved.current = true;
    onSave(text, toGrid);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' || (e.key === 'F2' && e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      save(true);
    }
  };
  return (
    <OfficePopup anchor={anchor}>
      <div
        data-sheet-note-box=""
        className="w-60 rounded-menu border border-(--office-line) bg-(--office-menu) p-1 shadow-lg"
      >
        <textarea
          ref={field}
          aria-label="Note"
          value={text}
          maxLength={SHEET_NOTE_MAX}
          rows={5}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => save(false)}
          className="block w-full resize-y rounded-control bg-transparent px-2 py-1 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)"
        />
      </div>
    </OfficePopup>
  );
}
