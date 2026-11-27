'use client';

// Copy To › Existing Spreadsheet's picker (docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar", D183): the
// person's own spreadsheets but this one (SpreadsheetPickList); picking one copies the sheet there.
import { Button } from '@livedoc/ui';
import { Dialog } from '@/components/dialogs/Dialog';
import { DialogFooter } from '@/components/dialogs/DialogFooter';
import { SpreadsheetPickList } from './SpreadsheetPickList';

const TITLE_ID = 'copy-to-title';

export function CopyToDialog({
  ownerId,
  currentId,
  sheetName,
  onPick,
  onClose,
}: {
  ownerId: string;
  currentId: string;
  sheetName: string;
  onPick: (target: { documentId: string; name: string }) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} titleId={TITLE_ID}>
      <div data-copy-to="" className="flex flex-col gap-3 px-6 pt-6 pb-4">
        <h2 id={TITLE_ID} className="text-dialog-title text-slate-900 dark:text-slate-50">
          Copy {sheetName} to
        </h2>
        <SpreadsheetPickList
          ownerId={ownerId}
          currentId={currentId}
          what="workbook copy to"
          onPick={onPick}
        />
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
