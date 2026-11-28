'use client';

// Insert › Emoji in a spreadsheet (docs/specs/029-sheets/inserted-objects.md "Tick boxes, dropdowns and emoji", D635):
// the editor's emoji picker, each emoji picked going into the open edit at its caret, or opening the active cell's
// edit with it; the edit is saved as typing is. An Editor's alone.
import { useMemo, useState, type ReactNode } from 'react';
import { OfficeEmojiDialog } from '@/components/office/OfficeEmojiDialog';
import type { SheetController } from '@/components/sheets/sheet-controller';
import type { FormulaInput } from '@/components/sheets/useFormulaInput';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';

export const INSERT_EMOJI = 'insert-emoji';

// The open edit's text box: the cell's, or the formula bar's when the edit is there.
const editorOf = (sheetId: string, inBar: boolean) =>
  document.querySelector<HTMLTextAreaElement>(
    `textarea[data-sheet-editor="${sheetId}"][aria-label${inBar ? '="Formula bar"' : '^="Edit cell"'}]`,
  );

export function useSpreadsheetEmoji(
  c: SheetController,
  input: FormulaInput,
): { actions: OfficeActions; dialog: ReactNode } {
  const [open, setOpen] = useState(false);
  const { canEdit } = c;
  const actions = useMemo(
    (): OfficeActions => (canEdit ? { [INSERT_EMOJI]: { run: () => setOpen(true) } } : {}),
    [canEdit],
  );
  const dialog =
    open && canEdit ? (
      <OfficeEmojiDialog
        onPick={(emoji) => {
          input.insertText(emoji);
          track('Spreadsheet', 'Added', 'Emoji');
          debugLog(`[sheets] emoji inserted sheet=${c.sheet.id}`);
        }}
        onClose={() => {
          setOpen(false);
          // The edit takes the keys back at its caret, or the grid when none is open.
          const editor = c.editing ? editorOf(c.sheet.id, c.editing.origin === 'bar') : null;
          if (!editor) return c.focusGrid();
          editor.focus({ preventScroll: true });
          editor.setSelectionRange(input.caret, input.caret);
        }}
      />
    ) : null;
  return { actions, dialog };
}
