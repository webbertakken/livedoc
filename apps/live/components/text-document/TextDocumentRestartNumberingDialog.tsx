'use client';

// Restart numbering (docs/specs/034-text-documents/lists.md "Numbering"): the number the caret's item's level starts
// again at, a whole number from 0 to 32767, refused under its field otherwise.
import { useId, useState } from 'react';
import { LIST_RESTART_MAX, LIST_RESTART_MIN } from '@livedoc/text-documents';
import { OfficeDialog } from '@/components/office/OfficeDialog';

/** The typed number, or null when it is no whole number from 0 to 32767. */
export function readRestartField(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= LIST_RESTART_MIN && value <= LIST_RESTART_MAX ? value : null;
}

const FIELD =
  'h-prominent w-28 rounded-control border border-(--office-line) bg-transparent px-3 text-body text-(--office-ink) tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-[invalid=true]:border-red-600 dark:aria-[invalid=true]:border-red-400';

export function TextDocumentRestartNumberingDialog({
  open,
  start,
  onApply,
  onClose,
}: {
  open: boolean;
  // The number it opens with: the item's restart, else 1.
  start: number;
  onApply: (start: number) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [text, setText] = useState(() => String(start));
  const value = readRestartField(text);
  const invalid = value === null;
  return (
    <OfficeDialog
      open={open}
      onClose={onClose}
      title="Restart numbering"
      primary={{
        label: 'OK',
        disabled: invalid,
        onPress: () => {
          if (value !== null) onApply(value);
        },
      }}
    >
      <div className="flex items-start gap-4">
        <label htmlFor={id} className="pt-2 text-body">
          Start at
        </label>
        <div className="flex flex-col gap-1">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={FIELD}
          />
          {invalid ? (
            <span id={`${id}-error`} className="text-supporting text-red-700 dark:text-red-300">
              Enter a whole number from {LIST_RESTART_MIN} to {LIST_RESTART_MAX}.
            </span>
          ) : null}
        </div>
      </div>
    </OfficeDialog>
  );
}
