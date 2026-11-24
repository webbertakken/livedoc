'use client';

// Format › Number › Custom Number Format (docs/specs/029-sheets/formatting.md "Number formats"): the shell's dialog
// with a format code's field, a preview of the active cell's value drawn in it (or why the code cannot be read), and
// Google's examples; a press on one puts it in the field. Apply formats the selection, one undo step.
import { useId, useState } from 'react';
import { formatCodeDraw, type CellFormat, type Value } from '@livedoc/sheets';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import {
  CUSTOM_FORMAT_EXAMPLES,
  CUSTOM_FORMAT_SAMPLE,
  customFormatPreview,
  customFormatStart,
} from '@/lib/spreadsheet/custom-number-format';

const FIELD =
  'h-prominent w-full rounded-control border border-(--office-line) bg-transparent px-3 font-mono text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)';
const HEADING = 'mb-2 text-body font-medium';

export function CustomNumberFormatDialog({
  value,
  format,
  locale,
  onApply,
  onClose,
}: {
  // The active cell's value and format, read as the dialog opens.
  value: Value;
  format: CellFormat | undefined;
  locale: string;
  onApply: (code: string) => void;
  onClose: () => void;
}) {
  const ids = { field: useId(), preview: useId() };
  const [code, setCode] = useState(() => customFormatStart(format, locale));
  const preview = customFormatPreview(value, code);
  return (
    <OfficeDialog
      open
      onClose={onClose}
      title="Custom Number Formats"
      primary={{ label: 'Apply', onPress: () => onApply(code), disabled: !preview.ok }}
    >
      <div className="flex flex-col gap-4 pt-1">
        <div className="flex flex-col">
          <label htmlFor={ids.field} className={HEADING}>
            Format Code
          </label>
          <input
            id={ids.field}
            value={code}
            spellCheck={false}
            aria-describedby={ids.preview}
            onChange={(e) => setCode(e.target.value)}
            className={FIELD}
          />
          <p
            id={ids.preview}
            role="status"
            className="mt-2 min-h-icon-title text-body"
            style={preview.ok && preview.colour ? { color: preview.colour } : undefined}
          >
            {preview.ok ? (
              <>
                <span className="text-(--office-muted)">Preview: </span>
                {preview.text}
              </>
            ) : (
              <span className="text-(--office-error)">{preview.problem}</span>
            )}
          </p>
        </div>
        <div className="flex min-h-0 flex-col">
          <h3 className={HEADING}>Examples</h3>
          <ul className="max-h-60 overflow-y-auto rounded-control border border-(--office-line)">
            {CUSTOM_FORMAT_EXAMPLES.map((example) => {
              const { text } = formatCodeDraw(CUSTOM_FORMAT_SAMPLE, example);
              return (
                <li key={example}>
                  <button
                    type="button"
                    aria-label={`${example}, ${text}`}
                    onClick={() => setCode(example)}
                    className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left text-body outline-none hover:bg-(--office-hover) focus-visible:bg-(--office-hover)"
                  >
                    <span className="truncate font-mono">{example}</span>
                    <span className="shrink-0 text-(--office-muted)">{text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </OfficeDialog>
  );
}
