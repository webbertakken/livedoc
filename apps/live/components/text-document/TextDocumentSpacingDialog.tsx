'use client';

// Format > Line & paragraph spacing > Custom spacing (docs/specs/034-text-documents/text-and-paragraphs.md "Spacing
// and keep rules"): the line spacing and the space before and after the paragraphs the selection touches. A field
// shows the paragraphs' value, blank where they differ; a blank field changes nothing.
import { useId, useState } from 'react';
import type { Spacing } from '@/lib/text-document/text-document-paragraph-formatting';
import { OfficeDialog } from '@/components/office/OfficeDialog';

/** The line spacing a person may type: a multiple from 0.06 to 100. */
export const LINE_SPACING_RANGE = { min: 0.06, max: 100 } as const;
/** The space before or after a paragraph a person may type: 0 to 1,584 pt (22 in). */
export const PARAGRAPH_SPACE_RANGE = { min: 0, max: 1584 } as const;

type Range = { readonly min: number; readonly max: number };

/** A typed field read: its number, null for blank (no change), or 'invalid' outside its range. */
export function readSpacingField(text: string, { min, max }: Range): number | null | 'invalid' {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= min && value <= max ? value : 'invalid';
}

const FIELD =
  'h-field w-28 rounded-control border border-(--office-line) bg-transparent px-3 text-body text-(--office-ink) tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-[invalid=true]:border-red-600 dark:aria-[invalid=true]:border-red-400';

function SpacingField({
  label,
  unit,
  value,
  range,
  onChange,
}: {
  label: string;
  unit?: string;
  value: string;
  range: Range;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const invalid = readSpacingField(value, range) === 'invalid';
  return (
    <>
      <label htmlFor={id} className="pt-2 text-body">
        {label}
      </label>
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={FIELD}
          />
          {unit ? (
            <span aria-hidden="true" className="text-body text-(--office-muted)">
              {unit}
            </span>
          ) : null}
        </span>
        {invalid ? (
          <span id={`${id}-error`} className="text-supporting text-red-700 dark:text-red-300">
            Enter a number from {range.min} to {range.max}.
          </span>
        ) : null}
      </div>
    </>
  );
}

const shown = (value: number | null) =>
  value === null ? '' : String(Math.round(value * 100) / 100);

export function TextDocumentSpacingDialog({
  open,
  spacing,
  onApply,
  onClose,
}: {
  open: boolean;
  // The paragraphs' spacing, each null where they differ.
  spacing: Spacing;
  // The spacing to set; null leaves each paragraph's own.
  onApply: (spacing: Spacing) => void;
  onClose: () => void;
}) {
  const [line, setLine] = useState(() => shown(spacing.lineHeight));
  const [before, setBefore] = useState(() => shown(spacing.before));
  const [after, setAfter] = useState(() => shown(spacing.after));
  const fields = [
    [line, LINE_SPACING_RANGE],
    [before, PARAGRAPH_SPACE_RANGE],
    [after, PARAGRAPH_SPACE_RANGE],
  ] as const;
  const invalid = fields.some(([text, range]) => readSpacingField(text, range) === 'invalid');
  const value = (text: string, range: Range) => {
    const read = readSpacingField(text, range);
    return typeof read === 'number' ? read : null;
  };
  return (
    <OfficeDialog
      open={open}
      onClose={onClose}
      title="Custom spacing"
      primary={{
        label: 'Apply',
        disabled: invalid,
        onPress: () =>
          onApply({
            lineHeight: value(line, LINE_SPACING_RANGE),
            before: value(before, PARAGRAPH_SPACE_RANGE),
            after: value(after, PARAGRAPH_SPACE_RANGE),
          }),
      }}
    >
      <div className="grid grid-cols-[auto_1fr] items-start gap-x-6 gap-y-4 pt-1">
        <SpacingField
          label="Line spacing"
          value={line}
          range={LINE_SPACING_RANGE}
          onChange={setLine}
        />
        <h3 className="col-span-2 pt-2 text-panel-title">Paragraph spacing</h3>
        <SpacingField
          label="Before"
          unit="pt"
          value={before}
          range={PARAGRAPH_SPACE_RANGE}
          onChange={setBefore}
        />
        <SpacingField
          label="After"
          unit="pt"
          value={after}
          range={PARAGRAPH_SPACE_RANGE}
          onChange={setAfter}
        />
      </div>
    </OfficeDialog>
  );
}
