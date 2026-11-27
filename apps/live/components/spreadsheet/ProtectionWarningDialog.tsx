'use client';

// Show a Warning's dialog (docs/specs/029-sheets/data-tools.md "Protected ranges", D346): asked before this person's
// first change under a warning protection; OK writes it and lets them on past that range for the rest of their visit,
// Cancel leaves the cells as they were.
import { Button } from '@livedoc/ui';
import { Dialog } from '@/components/dialogs/Dialog';
import { DialogFooter } from '@/components/dialogs/DialogFooter';

const TITLE_ID = 'protection-warning-title';

export const PROTECTION_WARNING =
  "Heads up! You're trying to edit part of this sheet that shouldn't be changed accidentally. Edit anyway?";

export function ProtectionWarningDialog({
  onOk,
  onCancel,
}: {
  onOk: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open onClose={onCancel} titleId={TITLE_ID}>
      <div className="flex flex-col gap-3 px-6 pt-6 pb-4">
        <h2 id={TITLE_ID} className="text-dialog-title text-slate-900 dark:text-slate-50">
          Protected range
        </h2>
        <p className="text-body text-slate-700 dark:text-slate-200">{PROTECTION_WARNING}</p>
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button autoFocus onClick={onOk}>
          OK
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
