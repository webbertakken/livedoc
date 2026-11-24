'use client';

// Format › Rotation › Custom Angle (docs/specs/029-sheets/formatting.md "Alignment, wrapping, rotation", D211): the
// shell's dialog with a field of whole degrees from −90 to 90, starting at the active cell's angle. Apply turns the
// selection, 0 clearing; anything else dims Apply and says why, politely.
import { useId, useState } from 'react';
import type { CellFormat, Rotation } from '@livedoc/sheets';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { customAngleOf, customAngleStart } from '@/lib/spreadsheet/custom-angle';

const FIELD =
  'h-prominent w-full rounded-control border border-(--office-line) bg-transparent px-3 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)';

export function CustomAngleDialog({
  format,
  onApply,
  onClose,
}: {
  // The active cell's format, read as the dialog opens.
  format: CellFormat | undefined;
  onApply: (ro: Rotation | null) => void;
  onClose: () => void;
}) {
  const ids = { field: useId(), problem: useId() };
  const [text, setText] = useState(() => customAngleStart(format));
  const angle = customAngleOf(text);
  return (
    <OfficeDialog
      open
      onClose={onClose}
      title="Custom Angle"
      // A dimmed Apply never presses (OfficeDialog): only an angle it can take is applied.
      primary={
        angle.ok
          ? { label: 'Apply', onPress: () => onApply(angle.ro) }
          : { label: 'Apply', onPress: onClose, disabled: true }
      }
    >
      <div className="flex flex-col pt-1">
        <label htmlFor={ids.field} className="mb-2 text-body font-medium">
          Angle in degrees
        </label>
        <input
          id={ids.field}
          value={text}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={ids.problem}
          aria-invalid={!angle.ok}
          onChange={(e) => setText(e.target.value)}
          className={FIELD}
        />
        <p
          id={ids.problem}
          role="status"
          className="mt-2 min-h-icon-title text-body text-(--office-error)"
        >
          {angle.ok ? '' : angle.problem}
        </p>
      </div>
    </OfficeDialog>
  );
}
