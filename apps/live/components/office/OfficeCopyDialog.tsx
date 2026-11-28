'use client';

// File > Make a copy's dialog (docs/specs/034-text-documents/files-and-print.md "Make a copy"), Google's Copy document:
// the copy's name, its folder, and what it keeps of the review. The page owns where the copy goes and making it; this
// draws the choices and says how the copy went.
import { useEffect, useId, useRef, useState } from 'react';
import type { CopiedReviewChoice } from '@livedoc/text-documents';
import { OfficeDialog } from './OfficeDialog';

const FIELD =
  'w-full rounded-control border border-(--office-line) bg-transparent px-3 py-2 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)';

const CHANGE =
  'touch-target relative rounded-control px-3 py-1 text-body text-(--office-primary) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)';

/** What the person chose: the name as typed, and the review where it was offered. */
export type OfficeCopyChoice = { name: string; review: CopiedReviewChoice | null };

export function OfficeCopyDialog({
  open,
  documentName,
  folder,
  offerReview,
  copying,
  failure,
  onCopy,
  onClose,
}: {
  // False while the folder picker stands in for it; what was typed and ticked stays.
  open: boolean;
  documentName: string;
  // The folder the copy goes in and the press that changes it; null for a copy made in This Browser.
  folder: { name: string; onChange: () => void } | null;
  // The two review choices, for anyone but a Viewer.
  offerReview: boolean;
  copying: boolean;
  // What the last refusal said; null while nothing was refused.
  failure: string | null;
  onCopy: (choice: OfficeCopyChoice) => void;
  onClose: () => void;
}) {
  const nameId = useId();
  const folderId = useId();
  const nameField = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(`Copy of ${documentName}`);
  const [comments, setComments] = useState(false);
  const [resolved, setResolved] = useState(false);
  // The name selected once, as the dialog first opens, so typing replaces it.
  const selected = useRef(false);
  useEffect(() => {
    if (!open || selected.current) return;
    selected.current = true;
    nameField.current?.select();
  }, [open]);
  return (
    <OfficeDialog
      open={open}
      onClose={onClose}
      title="Copy document"
      primary={{
        label: copying ? 'Making a copy…' : 'Make a copy',
        disabled: copying,
        onPress: () =>
          onCopy({
            name,
            review: offerReview ? { comments, resolved: comments && resolved } : null,
          }),
      }}
    >
      <div data-office-copy-dialog="" className="flex flex-col gap-3 pt-1">
        <label htmlFor={nameId} className="text-body">
          Name
        </label>
        <input
          ref={nameField}
          id={nameId}
          type="text"
          data-office-copy-name=""
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={FIELD}
        />
        {folder ? (
          <div data-office-copy-folder="" className="flex items-center gap-3">
            <span id={folderId} className="text-body text-(--office-muted)">
              Folder
            </span>
            <span className="min-w-0 flex-1 truncate text-body" aria-labelledby={folderId}>
              {folder.name}
            </span>
            <button
              type="button"
              className={CHANGE}
              aria-label={`Change folder, now ${folder.name}`}
              onClick={folder.onChange}
            >
              Change
            </button>
          </div>
        ) : null}
        {offerReview ? (
          <label className="flex items-center gap-3 text-body">
            <input
              type="checkbox"
              data-office-copy-comments=""
              className="size-icon-row shrink-0 accent-(--office-primary)"
              checked={comments}
              onChange={(event) => setComments(event.target.checked)}
            />
            Copy comments and suggestions
          </label>
        ) : null}
        {offerReview && comments ? (
          <label className="flex items-center gap-3 pl-8 text-body">
            <input
              type="checkbox"
              data-office-copy-resolved=""
              className="size-icon-row shrink-0 accent-(--office-primary)"
              checked={resolved}
              onChange={(event) => setResolved(event.target.checked)}
            />
            Include resolved comments and suggestions
          </label>
        ) : null}
        {failure ? (
          <p role="alert" className="text-body text-(--office-error)">
            {failure}
          </p>
        ) : null}
      </div>
    </OfficeDialog>
  );
}
