'use client';

// Alt text (docs/specs/034-text-documents/objects.md "Working with a picture"): a picture's description, or "Mark as
// decorative", which empties and disables the description, as Google's; nothing changes until OK.
import { useId, useState } from 'react';
import { OfficeDialog } from '@/components/office/OfficeDialog';

export function TextDocumentAltTextDialog({
  open,
  alt,
  decorative,
  onApply,
  onClose,
}: {
  open: boolean;
  // The picture's description and mark now.
  alt: string;
  decorative: boolean;
  onApply: (change: { alt: string; decorative: boolean }) => void;
  onClose: () => void;
}) {
  const description = useId();
  const [text, setText] = useState(decorative ? '' : alt);
  const [marked, setMarked] = useState(decorative);
  return (
    <OfficeDialog
      open={open}
      onClose={onClose}
      title="Alt text"
      primary={{ label: 'OK', onPress: () => onApply({ alt: text, decorative: marked }) }}
    >
      <div className="flex flex-col gap-3 pt-1">
        <label htmlFor={description} className="text-body font-medium">
          Description
        </label>
        <textarea
          id={description}
          rows={4}
          value={text}
          disabled={marked}
          onChange={(event) => setText(event.target.value)}
          className="w-full resize-y rounded-control border border-(--office-line) bg-transparent px-3 py-2 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) disabled:opacity-40"
        />
        <label className="flex items-center gap-3 text-body">
          <input
            type="checkbox"
            className="size-4 shrink-0 accent-(--office-primary)"
            checked={marked}
            onChange={(event) => {
              setMarked(event.target.checked);
              if (event.target.checked) setText('');
            }}
          />
          Mark as decorative
        </label>
      </div>
    </OfficeDialog>
  );
}
