'use client';

// A length typed in the person's unit (docs/specs/034-text-documents/text-and-paragraphs.md "Alignment and indents",
// page-layout.md "Page setup"): an indent or a margin, refused in the field past 0 to the field's most, or for a
// `problem` the dialog finds in it with others (margins leaving no room for text).
import { useId } from 'react';
import {
  INDENT_FIELD_MAX,
  readIndentField,
  type IndentUnit,
} from '@/lib/text-document/indent-units';

const FIELD =
  'h-9 w-28 rounded border border-(--office-line) bg-transparent px-3 text-sm text-(--office-ink) tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-[invalid=true]:border-red-600 dark:aria-[invalid=true]:border-red-400 disabled:opacity-40';

export function TextDocumentLengthField({
  label,
  value,
  unit,
  disabled = false,
  problem = null,
  onChange,
}: {
  label: string;
  value: string;
  unit: IndentUnit;
  disabled?: boolean;
  // What is wrong with the field beside the others, shown when its own number reads.
  problem?: string | null;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const outOfRange = !disabled && readIndentField(value, unit) === 'invalid';
  const message = outOfRange
    ? `Enter a number from 0 to ${INDENT_FIELD_MAX[unit]}.`
    : disabled
      ? null
      : problem;
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          aria-label={`${label} (${unit})`}
          aria-invalid={message !== null}
          aria-describedby={message !== null ? `${id}-error` : undefined}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={FIELD}
        />
        <span aria-hidden="true" className="text-sm text-(--office-muted)">
          {unit}
        </span>
      </span>
      {message !== null ? (
        <span id={`${id}-error`} className="text-xs text-red-700 dark:text-red-300">
          {message}
        </span>
      ) : null}
    </div>
  );
}
