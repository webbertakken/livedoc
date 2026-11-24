'use client';

// Format > Page orientation (docs/specs/034-text-documents/page-layout.md "Page setup"): portrait or landscape for the
// whole document, as Page setup's orientation; nothing changes until OK.
import { useId, useState } from 'react';
import type { Orientation } from '@livedoc/text-documents';
import { OfficeDialog } from '@/components/office/OfficeDialog';

const ORIENTATIONS: readonly { value: Orientation; label: string }[] = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

export function TextDocumentPageOrientationDialog({
  open,
  orientation,
  onApply,
  onClose,
}: {
  open: boolean;
  // The page's orientation now.
  orientation: Orientation;
  onApply: (orientation: Orientation) => void;
  onClose: () => void;
}) {
  const name = useId();
  const [chosen, setChosen] = useState(orientation);
  return (
    <OfficeDialog
      open={open}
      onClose={onClose}
      title="Page orientation"
      primary={{ label: 'OK', onPress: () => onApply(chosen) }}
    >
      <fieldset className="flex flex-col gap-3 pt-1">
        <legend className="sr-only">Orientation</legend>
        {ORIENTATIONS.map(({ value, label }) => (
          <label key={value} className="flex items-center gap-3 text-body">
            <input
              type="radio"
              name={name}
              className="size-4 shrink-0 accent-(--office-primary)"
              checked={chosen === value}
              onChange={() => setChosen(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
    </OfficeDialog>
  );
}
