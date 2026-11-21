'use client';

// The Table properties side panel's body (docs/specs/034-text-documents/tables.md "Table properties"): Rows, Columns,
// Alignment, Colour and Cell, each a section that folds; each field shows what the cells it changes share, blank where
// they differ. A list or a colour applies at once; a length on Enter or when its field is left. Outside a table it says
// where to put the cursor.
import { useId, useState, type ReactNode } from 'react';
import type { CellVerticalAlign } from '@livedoc/text-documents';
import {
  OFFICE_NO_COLOUR,
  OfficeDialogColourField,
} from '@/components/office/OfficeDialogColourField';
import { OFFICE_PANEL_START } from '@/components/office/OfficePanel';
import {
  INDENT_FIELD_MAX,
  ptOf,
  readIndentField,
  unitOf,
  type IndentUnit,
} from '@/lib/text-document/indent-units';
import {
  TABLE_BORDER_WIDTHS,
  type TableAlignChoice,
  type TableProperties,
  type TablePropertyChange,
} from '@/lib/text-document/text-document-table-properties';

const CONTROL =
  'h-9 rounded border border-(--office-line) bg-transparent px-3 text-sm text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) disabled:cursor-default disabled:opacity-40';
const SELECT = `${CONTROL} w-full cursor-pointer [&>option]:bg-(--office-menu)`;
const LABEL = 'mb-1 text-sm';
const SUMMARY =
  'flex cursor-pointer list-none items-center justify-between rounded px-2 py-2 text-sm font-medium outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) [&::-webkit-details-marker]:hidden';

const VERTICAL: readonly (readonly [CellVerticalAlign, string])[] = [
  ['top', 'Top'],
  ['middle', 'Middle'],
  ['bottom', 'Bottom'],
];
const ALIGN: readonly (readonly [TableAlignChoice, string])[] = [
  ['start', 'Left'],
  ['center', 'Center'],
  ['end', 'Right'],
];
// The value a list shows where the cells differ.
const MIXED = '';

function Section({ title, children }: { title: string; children: ReactNode }) {
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

/** A length in the person's unit; applied on Enter or when left, never while typed. */
function LengthField({
  label,
  pt,
  unit,
  disabled = false,
  start = false,
  onCommit,
}: {
  label: string;
  // Points; null where the cells differ.
  pt: number | null;
  unit: IndentUnit;
  disabled?: boolean;
  // The field the panel starts at when it opens.
  start?: boolean;
  onCommit: (pt: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState(pt === null ? '' : String(unitOf(pt, unit)));
  const read = readIndentField(text, unit);
  const invalid = !disabled && read === 'invalid';
  const commit = () => {
    if (typeof read === 'number' && (pt === null || Math.abs(ptOf(read, unit) - pt) > 0.005))
      onCommit(ptOf(read, unit));
  };
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className={LABEL}>
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
          className={`${CONTROL} w-28 tabular-nums aria-[invalid=true]:border-red-600 dark:aria-[invalid=true]:border-red-400`}
        />
        <span aria-hidden="true" className="text-sm text-(--office-muted)">
          {unit}
        </span>
      </span>
      {invalid ? (
        <span id={`${id}-error`} className="mt-1 text-xs text-red-700 dark:text-red-300">
          {`Enter a number from 0 to ${INDENT_FIELD_MAX[unit]}.`}
        </span>
      ) : null}
    </div>
  );
}

function ListField<T extends string>({
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
      <label htmlFor={id} className={LABEL}>
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

const widthWords = (pt: number) => `${pt} pt`;

export function TextDocumentTablePropertiesPanel({
  properties,
  unit,
  onChange,
}: {
  // The caret's table's, or null outside one.
  properties: TableProperties | null;
  unit: IndentUnit;
  onChange: (change: TablePropertyChange) => void;
}) {
  if (!properties)
    return (
      <p className="px-2 pt-1 text-sm text-(--office-muted)">
        Put the cursor in a table to see its properties.
      </p>
    );
  const p = properties;
  // Each length field starts again from the value shown when that value changes.
  const length = (
    label: string,
    pt: number | null,
    field: 'rowHeight' | 'columnWidth' | 'indent' | 'padding',
    extra: { disabled?: boolean; start?: boolean } = {},
  ) => (
    <LengthField
      key={`${field}:${pt ?? 'mixed'}`}
      label={label}
      pt={pt}
      unit={unit}
      {...extra}
      onCommit={(value) => onChange({ field, value })}
    />
  );
  return (
    <div className="flex flex-col gap-1 px-1 pt-1">
      <Section title="Rows">
        {length('Minimum row height', p.rowHeight, 'rowHeight', { start: true })}
      </Section>
      <Section title="Columns">{length('Column width', p.columnWidth, 'columnWidth')}</Section>
      <Section title="Alignment">
        <ListField
          label="Cell vertical alignment"
          value={p.verticalAlign}
          options={VERTICAL}
          onChoose={(value) => onChange({ field: 'verticalAlign', value })}
        />
        <ListField
          label="Table alignment"
          value={p.align}
          options={ALIGN}
          onChoose={(value) => onChange({ field: 'align', value })}
        />
        {length('Left indent', p.indent, 'indent', { disabled: p.align !== 'start' })}
      </Section>
      <Section title="Colour">
        <div className="flex items-end gap-3">
          <div className="flex flex-col">
            <span className={LABEL}>Table border</span>
            <OfficeDialogColourField
              label="Table border colour"
              value={p.borderColor}
              className={CONTROL}
              onPick={(value) => onChange({ field: 'borderColor', value })}
            />
          </div>
          <div className="min-w-0 flex-1">
            <ListField
              label="Border width"
              value={p.borderWidth === null ? null : String(p.borderWidth)}
              options={TABLE_BORDER_WIDTHS.map((w) => [String(w), widthWords(w)] as const)}
              onChoose={(value) => onChange({ field: 'borderWidth', value: Number(value) })}
            />
          </div>
        </div>
        <div className="flex flex-col">
          <span className={LABEL}>Cell background colour</span>
          <OfficeDialogColourField
            label="Cell background colour"
            value={p.background === null ? null : p.background || OFFICE_NO_COLOUR}
            leading="None"
            className={CONTROL}
            onPick={(value) =>
              onChange({ field: 'background', value: value === OFFICE_NO_COLOUR ? null : value })
            }
          />
        </div>
      </Section>
      <Section title="Cell">{length('Cell padding', p.padding, 'padding')}</Section>
    </div>
  );
}
