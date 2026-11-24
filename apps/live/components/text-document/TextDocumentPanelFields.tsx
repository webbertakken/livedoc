'use client';

// The fields a text document's side panel is built of (docs/specs/004-interface-design/office-shell.md "Side panels"):
// a section that folds, a number typed and applied on Enter or when its field is left (never while typed), a length in
// the person's unit, a percent, and a list applied at once. Table properties and Image options share them.
import { useId, useState, type ReactNode } from 'react';
import { OFFICE_PANEL_START } from '@/components/office/OfficePanel';
import {
  INDENT_FIELD_MAX,
  ptOf,
  readIndentField,
  unitOf,
  type IndentUnit,
} from '@/lib/text-document/indent-units';

export const PANEL_CONTROL =
  'h-prominent rounded-control border border-(--office-line) bg-transparent px-3 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) disabled:cursor-default disabled:opacity-40';
const SELECT = `${PANEL_CONTROL} w-full cursor-pointer [&>option]:bg-(--office-menu)`;
export const PANEL_LABEL = 'mb-1 text-body';
export const PANEL_CHECK_ROW = 'flex min-h-prominent cursor-pointer items-center gap-3 text-body';
export const PANEL_CHECK = 'size-4 shrink-0 accent-(--office-primary) disabled:cursor-default';
const SUMMARY =
  'flex cursor-pointer list-none items-center justify-between rounded-control px-2 py-2 text-body font-medium outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) [&::-webkit-details-marker]:hidden';

// The value a list shows where what it changes differs.
const MIXED = '';

export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details open className="group border-b border-(--office-line) pb-3 last:border-b-0">
      <summary className={SUMMARY}>
        {title}
        <span aria-hidden="true" className="text-(--office-icon) group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-4 px-2 pt-2">{children}</div>
    </details>
  );
}

/** A number typed in its own words and applied on Enter or when left, when it reads and differs from `value`. */
function PanelNumberField({
  label,
  value,
  suffix,
  read,
  error,
  disabled = false,
  start = false,
  onCommit,
}: {
  label: string;
  // What it shows; null where what it changes differs.
  value: number | null;
  suffix: string;
  // The typed text read: its number, null for blank (no change), or 'invalid'.
  read: (text: string) => number | null | 'invalid';
  error: string;
  disabled?: boolean;
  // The field the panel starts at when it opens.
  start?: boolean;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value === null ? '' : String(value));
  const typed = read(text);
  const invalid = !disabled && typed === 'invalid';
  const commit = () => {
    if (typeof typed === 'number' && (value === null || Math.abs(typed - value) > 0.005))
      onCommit(typed);
  };
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className={PANEL_LABEL}>
        {label}
      </label>
      <span className="flex items-center gap-2">
        <input
          id={id}
          {...(start ? { [OFFICE_PANEL_START]: '' } : {})}
          type="text"
          inputMode="decimal"
          value={text}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          className={`${PANEL_CONTROL} w-28 tabular-nums aria-[invalid=true]:border-red-600 dark:aria-[invalid=true]:border-red-400`}
        />
        <span aria-hidden="true" className="text-body text-(--office-muted)">
          {suffix}
        </span>
      </span>
      {invalid ? (
        <span id={`${id}-error`} className="mt-1 text-supporting text-red-700 dark:text-red-300">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** A length in the person's unit, given and applied in points. */
export function PanelLengthField({
  pt,
  unit,
  onCommit,
  ...rest
}: {
  label: string;
  // Points; null where what it changes differs.
  pt: number | null;
  unit: IndentUnit;
  disabled?: boolean;
  start?: boolean;
  onCommit: (pt: number) => void;
}) {
  return (
    <PanelNumberField
      {...rest}
      value={pt === null ? null : unitOf(pt, unit)}
      suffix={unit}
      read={(text) => readIndentField(text, unit)}
      error={`Enter a number from 0 to ${INDENT_FIELD_MAX[unit]}.`}
      onCommit={(value) => onCommit(ptOf(value, unit))}
    />
  );
}

/** An angle in degrees: any number, shown to two decimals; what it turns to is for the caller to hold. */
export function PanelAngleField({
  degrees,
  ...rest
}: {
  label: string;
  degrees: number | null;
  disabled?: boolean;
  onCommit: (degrees: number) => void;
}) {
  return (
    <PanelNumberField
      {...rest}
      value={degrees === null ? null : Math.round(degrees * 100) / 100}
      suffix="°"
      read={(text) => {
        const trimmed = text.trim().replace(',', '.').replace(/°$/, '').trim();
        if (trimmed === '') return null;
        const value = Number(trimmed);
        return Number.isFinite(value) ? value : 'invalid';
      }}
      error="Enter a number of degrees."
    />
  );
}

/** A percent from `least` to `most`, shown to a whole number. */
export function PanelPercentField({
  percent,
  least,
  most,
  ...rest
}: {
  label: string;
  percent: number | null;
  least: number;
  most: number;
  disabled?: boolean;
  onCommit: (percent: number) => void;
}) {
  return (
    <PanelNumberField
      {...rest}
      value={percent === null ? null : Math.round(percent)}
      suffix="%"
      read={(text) => {
        const trimmed = text.trim().replace(',', '.').replace(/%$/, '');
        if (trimmed === '') return null;
        const value = Number(trimmed);
        return Number.isFinite(value) && value >= least && value <= most ? value : 'invalid';
      }}
      error={`Enter a number from ${least} to ${most}.`}
    />
  );
}

export function PanelListField<T extends string>({
  label,
  value,
  options,
  disabled = false,
  onChoose,
}: {
  label: string;
  value: T | null;
  options: readonly (readonly [T, string])[];
  disabled?: boolean;
  onChoose: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className={PANEL_LABEL}>
        {label}
      </label>
      <select
        id={id}
        value={value ?? MIXED}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value !== MIXED) onChoose(e.target.value as T);
        }}
        className={SELECT}
      >
        {value === null ? <option value={MIXED} /> : null}
        {options.map(([option, words]) => (
          <option key={option} value={option}>
            {words}
          </option>
        ))}
      </select>
    </div>
  );
}
