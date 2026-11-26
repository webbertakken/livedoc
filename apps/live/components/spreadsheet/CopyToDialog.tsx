'use client';

// Copy To › Existing Spreadsheet's picker (docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar", D183): the
// person's own spreadsheets but this one, newest first, narrowed by a search on their names; picking one copies the
// sheet there. Loading, none and a failed list each say so.
import { useCallback, useState } from 'react';
import type { DocumentSummary } from '@livedoc/api-schema';
import { Button, TextInput } from '@livedoc/ui';
import { Dialog } from '@/components/dialogs/Dialog';
import { DialogFooter } from '@/components/dialogs/DialogFooter';
import { useOwnDocuments } from '@/components/dialogs/useOwnDocuments';

const TITLE_ID = 'copy-to-title';

/** The spreadsheets a sheet may be copied into: the person's own, never `currentId`. */
export function copyTargets(documents: readonly DocumentSummary[], currentId: string) {
  return documents.filter((d) => d.spreadsheet && d.id !== currentId);
}

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
  const pick = useCallback(
    (documents: readonly DocumentSummary[]) => copyTargets(documents, currentId),
    [currentId],
  );
  const { listing, retry } = useOwnDocuments(ownerId, pick, 'workbook copy to');
  const [query, setQuery] = useState('');
  const wanted = query.trim().toLowerCase();
  const shown =
    listing.state === 'ready'
      ? listing.documents.filter((d) => d.name.toLowerCase().includes(wanted))
      : [];
  return (
    <Dialog open onClose={onClose} titleId={TITLE_ID}>
      <div data-copy-to="" className="flex flex-col gap-3 px-6 pt-6 pb-4">
        <h2 id={TITLE_ID} className="text-dialog-title text-slate-900 dark:text-slate-50">
          Copy {sheetName} to
        </h2>
        <TextInput
          aria-label="Search spreadsheets"
          placeholder="Search spreadsheets"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {listing.state === 'loading' ? (
          <p role="status" className="text-body text-slate-600 dark:text-slate-300">
            Loading your spreadsheets…
          </p>
        ) : listing.state === 'failed' ? (
          <div
            role="alert"
            className="flex items-center gap-3 text-body text-slate-700 dark:text-slate-200"
          >
            <span>Your spreadsheets could not be listed.</span>
            <Button variant="secondary" size="xs" onClick={retry}>
              Try Again
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <p className="text-body text-slate-600 dark:text-slate-300">
            {listing.documents.length === 0
              ? 'You have no other spreadsheets yet.'
              : 'No spreadsheet is called that.'}
          </p>
        ) : (
          <ul aria-label="Your spreadsheets" className="max-h-80 overflow-y-auto">
            {shown.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  data-copy-target={d.id}
                  onClick={() => onPick({ documentId: d.id, name: d.name })}
                  className="flex min-h-row w-full items-center rounded-control px-3 text-left text-body text-slate-700 hover:bg-slate-100 focus-visible:outline-2 pointer-coarse:min-h-11 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <span className="truncate">{d.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
