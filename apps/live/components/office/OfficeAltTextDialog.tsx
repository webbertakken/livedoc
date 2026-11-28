'use client';

// Alt text (docs/specs/034-text-documents/objects.md "Working with a picture", docs/specs/029-sheets/inserted-objects.md
// "Images over cells"): a picture's description, as Google's. A text document's offers "Mark as decorative", which
// empties and disables the description; a spreadsheet's a Title above it, which its one text folds in. Nothing changes
// until OK.
import { useId, useState } from 'react';
import { OfficeDialog } from '@/components/office/OfficeDialog';

const FIELD =
  'w-full rounded-control border border-(--office-line) bg-transparent px-3 py-2 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) disabled:opacity-40';

export type AltTextChange = { title: string; alt: string; decorative: boolean };

export function OfficeAltTextDialog({
  open,
  alt,
  decorative,
  withTitle = false,
  onApply,
  onClose,
}: {
  open: boolean;
  // The picture's description now.
  alt: string;
  // Its decorative mark now; absent where the kind has none.
  decorative?: boolean;
  // A Title field above the description (empty on opening).
  withTitle?: boolean;
  onApply: (change: AltTextChange) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const description = useId();
  const [title, setTitle] = useState('');
  const [text, setText] = useState(decorative ? '' : alt);
  const [marked, setMarked] = useState(decorative === true);
  return (
    <OfficeDialog
      open={open}
      onClose={onClose}
      title="Alt text"
      primary={{
        label: 'OK',
        onPress: () => onApply({ title: marked ? '' : title, alt: text, decorative: marked }),
      }}
    >
      <div className="flex flex-col gap-3 pt-1">
        {withTitle ? (
          <>
            <label htmlFor={titleId} className="text-body">
              Title
            </label>
            <input
              id={titleId}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={FIELD}
            />
          </>
        ) : null}
        <label htmlFor={description} className="text-body">
          Description
        </label>
        <textarea
          id={description}
          rows={4}
          value={text}
          disabled={marked}
          onChange={(event) => setText(event.target.value)}
          className={`${FIELD} resize-y`}
        />
        {decorative !== undefined ? (
          <label className="flex items-center gap-3 text-body">
            <input
              type="checkbox"
              className="size-icon-row shrink-0 accent-(--office-primary)"
              checked={marked}
              onChange={(event) => {
                setMarked(event.target.checked);
                if (event.target.checked) setText('');
              }}
            />
            Mark as decorative
          </label>
        ) : null}
      </div>
    </OfficeDialog>
  );
}
