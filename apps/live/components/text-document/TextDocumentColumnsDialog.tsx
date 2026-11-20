'use client';

// Format > Columns > More options (docs/specs/034-text-documents/page-layout.md "Columns"): Column options, as Google's
// dialog has it: presets drawn as small pages, the number of columns (the same choice), the spacing in the person's
// unit, refused past what leaves each column 0.5 in wide, and the line between columns; nothing changes until Apply.
import { useId, useState } from 'react';
import { Columns, MAX_COLUMNS, type PageSetup } from '@livedoc/text-documents';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { ptOf, readIndentField, unitOf, type IndentUnit } from '@/lib/text-document/indent-units';
import { TextDocumentLengthField } from './TextDocumentLengthField';

const PRESETS = [1, 2, 3] as const;
const PRESET_NAMES: Record<number, string> = {
  1: 'One column',
  2: 'Two columns',
  3: 'Three columns',
};

const CONTROL =
  'h-9 rounded border border-(--office-line) bg-transparent px-3 text-sm text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)';
const HEADING = 'mb-2 text-sm font-medium';

/** The message a spacing past the most reads, in the person's unit. */
export const spacingTooWide = (mostPt: number, unit: IndentUnit): string =>
  `Enter a number from 0 to ${unitOf(mostPt, unit)}.`;

// A small page with its columns of lines, as a preset tile draws it.
function PresetPage({ count }: { count: number }) {
  const width = 28;
  const gap = 3;
  const column = (width - gap * (count - 1)) / count;
  return (
    <svg viewBox="0 0 40 52" className="h-13 w-10" aria-hidden="true" focusable="false">
      <rect
        x="0.5"
        y="0.5"
        width="39"
        height="51"
        rx="2"
        className="fill-(--office-ground) stroke-(--office-line)"
      />
      {Array.from({ length: count }, (_, c) =>
        Array.from({ length: 8 }, (_, line) => (
          <rect
            key={`${c}:${line}`}
            x={6 + c * (column + gap)}
            y={7 + line * 5}
            width={line === 7 ? column * 0.6 : column}
            height="2"
            rx="1"
            className="fill-(--office-muted)"
          />
        )),
      )}
    </svg>
  );
}

export function TextDocumentColumnsDialog({
  open,
  setup,
  unit,
  onApply,
  onClose,
}: {
  open: boolean;
  // The setup of the section the caret is in: its columns now, and the text width they share.
  setup: PageSetup;
  unit: IndentUnit;
  onApply: (columns: Columns) => void;
  onClose: () => void;
}) {
  const ids = { presets: useId(), count: useId(), line: useId() };
  const initial = Columns.of(setup);
  const [count, setCount] = useState(initial.count);
  const [spacing, setSpacing] = useState(String(unitOf(initial.gap, unit)));
  const [line, setLine] = useState(initial.separator ?? false);
  // A file's section with more columns than Google offers keeps its count on offer.
  const counts = initial.count > MAX_COLUMNS ? [1, 2, 3, initial.count] : [1, 2, 3];
  const many = count > 1;
  const most = Columns.mostGap(setup, count);

  // Spacing left as shown keeps its exact length; a typed one is read in the unit.
  const typed = readIndentField(spacing, unit);
  const gap =
    spacing === String(unitOf(initial.gap, unit))
      ? initial.gap
      : typeof typed === 'number'
        ? ptOf(typed, unit)
        : null;
  const tooWide = many && gap !== null && gap > most + 0.005;
  const valid = !many || (gap !== null && !tooWide);
  const chosen = (): Columns =>
    many
      ? { count, gap: gap!, ...(line ? { separator: true as const } : {}) }
      : { count: 1, gap: initial.gap };

  return (
    <OfficeDialog
      open={open}
      onClose={onClose}
      title="Column options"
      primary={{ label: 'Apply', disabled: !valid, onPress: () => onApply(chosen()) }}
    >
      <div className="flex flex-col gap-5 pt-1">
        <fieldset>
          <legend className={HEADING}>Presets</legend>
          <div className="flex gap-3">
            {PRESETS.map((preset) => (
              <label key={preset} className="cursor-pointer">
                <input
                  type="radio"
                  name={ids.presets}
                  className="peer sr-only"
                  checked={count === preset}
                  onChange={() => setCount(preset)}
                  aria-label={PRESET_NAMES[preset]}
                />
                <span className="flex rounded-md border border-(--office-line) p-2 peer-checked:border-(--office-primary) peer-checked:ring-1 peer-checked:ring-(--office-primary) peer-focus-visible:ring-2 peer-focus-visible:ring-(--office-focus) hover:bg-(--office-hover)">
                  <PresetPage count={preset} />
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div className="flex flex-col">
            <label htmlFor={ids.count} className={HEADING}>
              Number of columns
            </label>
            <select
              id={ids.count}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className={`${CONTROL} w-28 cursor-pointer [&>option]:bg-(--office-menu)`}
            >
              {counts.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <span aria-hidden="true" className={`${HEADING} ${many ? '' : 'opacity-40'}`}>
              Spacing ({unit === 'in' ? 'inches' : 'centimetres'})
            </span>
            <TextDocumentLengthField
              label="Spacing"
              value={spacing}
              unit={unit}
              disabled={!many}
              problem={tooWide ? spacingTooWide(most, unit) : null}
              onChange={setSpacing}
            />
          </div>
        </div>
        <label
          htmlFor={ids.line}
          className={`flex items-center gap-3 text-sm ${many ? 'cursor-pointer' : 'opacity-40'}`}
        >
          <input
            id={ids.line}
            type="checkbox"
            className="size-4 shrink-0 accent-(--office-primary)"
            checked={many && line}
            disabled={!many}
            onChange={(e) => setLine(e.target.checked)}
          />
          Line between columns
        </label>
      </div>
    </OfficeDialog>
  );
}
